import {
  logCloudVMEvent,
  updateCloudVM as updateCloudVMRecord,
  getCloudVMOrThrow,
  countActiveCloudVMs,
  createCloudVM as createCloudVMRecord,
  getAgentOrThrow,
  updateAgent,
  findAgentsByCloudVmId,
  updateManyAgentsByVm,
  findAgentByVmAndSlug,
  listRunningCloudVMsForRepair,
  createLiveGatewayToken,
  revokeLiveGatewayToken,
  deleteConnectionsByMachineName,
  findConnectionIdsByMachineName,
} from "@agentcenter/database";
import { connectionRegistry } from "./live-connection-registry";
import { generateApiKey } from "../api-key";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { computeCronSchedule, getMcUrl } from "../agent-config-generator";
import { isFeatureEnabled } from "../feature-flags";
import { FLAG_KEYS, CloudVmStatus, getAgentSlug } from "@agentcenter/utils";
import {
  createServer,
  getServer,
  powerOn,
  powerOff,
  deleteServer,
  createSSHKey,
  deleteSSHKey,
} from "./hetzner";
import { generateSSHKeyPair, encryptPrivateKey } from "./ssh-keys";
import { sshExec, sshUploadFile, sshTestConnection } from "./ssh";
import { env } from "../env";
import { LLM_PROVIDERS_MAP } from "@agentcenter/utils";
import { VM_USER, VM_HOME, VM_CONFIG_DIR, VM_CONFIG_PATH, VM_WORKSPACE } from "./cloud-vm-paths";
import { ensureHeartbeatCron, removeAgentCrons } from "./cloud-vm-cron";
import {
  getVMSSHConfig,
  ocExec,
  restartGateway,
  waitForGateway,
  readVMConfig,
  writeVMConfig,
  computeAgentCronIndex,
  ensureAgentWorkspace,
  uploadAgentConfigFiles,
  ensureGatewayConfig,
  buildAgentsList,
} from "./cloud-vm-utils";

const MAX_VMS_PER_WORKSPACE = 10;

// ─── Helpers ────────────────────────────────────────────────────────

async function log(vmId: string, message: string, level: "info" | "warn" | "error" = "info") {
  await logCloudVMEvent(vmId, message, level);
}

async function updateVM(vmId: string, data: Record<string, unknown>) {
  await updateCloudVMRecord(vmId, data as any);
}

async function setStep(vmId: string, status: string, setupStep: string, setupProgress: number) {
  await updateVM(vmId, { status, setupStep, setupProgress });
}

async function failVM(vmId: string, step: string, error: string) {
  // Revoke any live gateway token that was created during provisioning so it
  // cannot be used by a partially-installed plugin on a failed VM.
  const failedVm = await getCloudVMOrThrow(vmId).catch(() => null);
  if (failedVm && (failedVm as any).liveGatewayTokenId) {
    await revokeLiveGatewayToken((failedVm as any).liveGatewayTokenId).catch(() => undefined);
  }
  // Terminate any live WS and delete connection records (+ cascaded routes/deliveries).
  await teardownLiveConnections(failedVm?.serverName);
  await updateVM(vmId, {
    status: CloudVmStatus.ERROR,
    errorMessage: `Failed at step "${step}": ${error}`,
    errorAt: new Date(),
    setupStep: null,
    liveGatewayTokenId: null, // Cleared so a retry gets a fresh token
  });
  await log(vmId, `Provisioning failed at "${step}": ${error}`, "error");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Terminate any live WebSocket connections for a machine and delete their DB
 * records (cascades LiveAgentRoute + LivePendingDelivery).
 * Called on every VM stop/fail/destroy/disable-gateway event.
 */
async function teardownLiveConnections(serverName: string | null | undefined): Promise<void> {
  if (!serverName) return;
  // Find connection IDs before deleting so we can close the in-memory WS
  const ids = await findConnectionIdsByMachineName(serverName).catch(() => [] as string[]);
  for (const id of ids) {
    const conn = connectionRegistry.get(id);
    if (conn) {
      conn.ws.terminate(); // fires "close" → registry.remove + DB cleanup (no-op after delete)
    }
  }
  await deleteConnectionsByMachineName(serverName).catch(() => undefined);
}

function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Convert an http(s) MC URL to the wss live-gateway WebSocket URL. */
function liveGatewayWssUrl(): string {
  return (
    getMcUrl()
      .replace(/\/$/, "")
      .replace(/^https/, "wss")
      .replace(/^http:/, "ws:") + "/live-gateway"
  );
}

/**
 * Create a live gateway install token in the DB and return the raw token string
 * plus the DB record ID. The raw token is written into openclaw.json on the VM;
 * the ID is stored on the CloudVM record so it can be revoked on destroy.
 */
async function createVMLiveGatewayToken(vmId: string): Promise<{ raw: string; tokenId: string }> {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(raw, 12);
  const record = await createLiveGatewayToken({
    tokenHash,
    tokenPrefix: raw.slice(0, 8),
    name: `cloud-vm-${vmId}`,
  });
  return { raw, tokenId: record.id };
}

/**
 * Configure the agentcenter-bridge plugin on a running VM.
 * The binary is pre-installed during provisioning (step 7a). If it's missing
 * (older VM), we fall back to installing it on demand from ClawHub.
 * Only the config write is needed for VMs provisioned after the pre-install step.
 */
async function installBridgePlugin(
  sshConfig: { host: string; privateKey: string },
  rawToken: string,
): Promise<void> {
  // Check if the plugin binary is already installed
  const check = await ocExec(
    sshConfig,
    "openclaw plugins list 2>/dev/null | grep -q agentcenter-bridge && echo FOUND || echo MISSING",
    { timeoutMs: 15_000 },
  );
  const isInstalled = check.stdout.trim() === "FOUND";

  if (!isInstalled) {
    // Fallback: binary not present (VM provisioned before step 7a was added).
    // Install from ClawHub — retry on rate-limit.
    let install: Awaited<ReturnType<typeof ocExec>> | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      install = await ocExec(
        sshConfig,
        "openclaw plugins install clawhub:@agentcenter/agentcenter-bridge --force",
        { timeoutMs: 120_000 },
      );
      if (install.code === 0) break;
      const output = (install.stderr + install.stdout).toLowerCase();
      if ((output.includes("429") || output.includes("rate limit")) && attempt < 3) {
        await sleep(attempt * 8_000);
        continue;
      }
      break;
    }
    if (install!.code !== 0) {
      const detail = (install!.stderr + "\n" + install!.stdout).trim().slice(0, 800);
      throw new Error(`agentcenter-bridge install failed (exit ${install!.code}): ${detail}`);
    }
  }

  // Write plugin config — daemon hot-reloads and starts the plugin.
  const config = await readVMConfig(sshConfig);
  const wssUrl = liveGatewayWssUrl();

  config.plugins = {
    allow: ["agentcenter-bridge"],
    entries: {
      "agentcenter-bridge": {
        enabled: true,
        config: { agentCenterUrl: wssUrl, token: rawToken },
      },
    },
  };

  await writeVMConfig(sshConfig, config);
}

/**
 * Set the default model in an agents.defaults config object.
 *
 * OpenClaw docs (docs.openclaw.ai/gateway/configuration):
 *   agents.defaults.model   → { primary: "provider/model-id", fallbacks?: [...] }
 *   agents.defaults.models  → catalog / allowlist, e.g. { "provider/model-id": { alias: "..." } }
 *
 * `model.primary` is always a plain string.
 * `models` is a dictionary keyed by model ID → config object.
 * These are separate keys with different schemas — never mix them.
 */
function setDefaultModelInConfig(defaults: Record<string, unknown>, qualifiedModel: string): void {
  // agents.defaults.model — selection (primary is a string)
  const modelConfig = (defaults.model as Record<string, unknown>) || {};
  modelConfig.primary = qualifiedModel;
  defaults.model = modelConfig;

  // Clean up any malformed `models` (e.g. if it was accidentally set to { primary: "..." })
  if (defaults.models && typeof defaults.models === "object") {
    const catalog = defaults.models as Record<string, unknown>;
    // A valid catalog has model-ID keys like "anthropic/claude-...", never "primary"
    if ("primary" in catalog && typeof catalog.primary === "string") {
      delete catalog.primary;
    }
    // Ensure the new model is in the catalog so it isn't blocked by the allowlist
    if (!catalog[qualifiedModel]) {
      catalog[qualifiedModel] = {};
    }
  }
}

// ─── Create Cloud VM ────────────────────────────────────────────────

interface CreateCloudVMParams {
  name?: string;
  region?: string;
  serverType?: string;
}

export async function createCloudVM(params: CreateCloudVMParams): Promise<{ vmId: string }> {
  const { name, region = "ash", serverType = "cpx11" } = params;

  // Feature gate — cloud_vms must be enabled in both feature flags and license
  const allowed = await isFeatureEnabled(FLAG_KEYS.CLOUD_VMS);
  if (!allowed) {
    throw new Error("Cloud VMs are not available on your current plan");
  }

  // Check VM limit (safety cap)
  const existingCount = await countActiveCloudVMs();
  if (existingCount >= MAX_VMS_PER_WORKSPACE) {
    throw new Error(`Maximum ${MAX_VMS_PER_WORKSPACE} active VMs allowed`);
  }

  const serverName = `agentcenter-vm-${Date.now()}`;

  // Step 1: Generate SSH key pair
  const { publicKey, privateKey } = generateSSHKeyPair();
  const storedPrivateKey = env.SSH_KEY_ENCRYPTION_SECRET
    ? encryptPrivateKey(privateKey, env.SSH_KEY_ENCRYPTION_SECRET)
    : privateKey;

  // Step 2: Upload SSH key to Hetzner
  let hetznerSshKeyId: string;
  try {
    const sshKeyResult = await createSSHKey({
      name: `agentcenter-${serverName}`,
      publicKey,
      labels: { "managed-by": "agentcenter" },
    });
    hetznerSshKeyId = sshKeyResult.sshKeyId;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to upload SSH key: ${message}`);
  }

  // Create VM record
  const vm = await createCloudVMRecord({
    name: name || null,
    provider: "hetzner",
    status: CloudVmStatus.PROVISIONING,
    serverName,
    region,
    serverType,
    sshPublicKey: publicKey,
    sshPrivateKey: storedPrivateKey,
    hetznerSshKeyId,
    setupStep: "creating_server",
    setupProgress: 5,
  });

  await log(vm.id, "SSH key generated and uploaded to Hetzner");

  // Step 3: Create Hetzner server with SSH key (no cloud-init)
  try {
    const server = await createServer({
      name: serverName,
      serverType,
      image: "ubuntu-24.04",
      location: region,
      sshKeys: [hetznerSshKeyId],
      labels: {
        "managed-by": "agentcenter",
        "vm-id": vm.id,
      },
    });

    await updateVM(vm.id, {
      externalServerId: server.serverId,
      ipv4: server.ipv4,
      provisionedAt: new Date(),
      setupStep: "waiting_for_server",
      setupProgress: 10,
    });

    await log(vm.id, `Server created (ID: ${server.serverId}, IP: ${server.ipv4})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await failVM(vm.id, "create_server", message);
    throw new Error(`Failed to create server: ${message}`);
  }

  // Fire-and-forget provisioning
  provisionVM(vm.id).catch((err) => {
    console.error(`[cloud-vm] provisionVM(${vm.id}) background error:`, err);
  });

  return { vmId: vm.id };
}

// ─── Provision VM (SSH Pipeline) ────────────────────────────────────

export async function provisionVM(vmId: string): Promise<void> {
  const vm = await getCloudVMOrThrow(vmId);

  if (!vm.externalServerId || !vm.ipv4) {
    await failVM(vmId, "provision_start", "Server not created yet");
    return;
  }

  try {
    // Step 3: Poll Hetzner until server = running
    await setStep(vmId, CloudVmStatus.WAITING_FOR_SSH, "waiting_for_hetzner", 15);
    await log(vmId, "Waiting for Hetzner server to be ready...");

    let serverReady = false;
    for (let i = 0; i < 60; i++) {
      const serverInfo = await getServer(vm.externalServerId);
      if (serverInfo.status === CloudVmStatus.RUNNING) {
        serverReady = true;
        break;
      }
      await sleep(5_000);
    }
    if (!serverReady) {
      await failVM(vmId, "wait_server", "Server did not reach running state within 5 minutes");
      return;
    }

    // Step 4: Poll SSH until connection succeeds
    await setStep(vmId, CloudVmStatus.WAITING_FOR_SSH, CloudVmStatus.WAITING_FOR_SSH, 20);
    await log(vmId, "Server running, waiting for SSH to become available...");

    const sshConfig = getVMSSHConfig(vm);
    let sshReady = false;
    for (let i = 0; i < 30; i++) {
      if (await sshTestConnection(sshConfig)) {
        sshReady = true;
        break;
      }
      await sleep(10_000);
    }
    if (!sshReady) {
      await failVM(vmId, "wait_ssh", "SSH connection not available within 5 minutes");
      return;
    }

    await log(vmId, "SSH connection established");

    // Step 5: apt-get update + install system deps + security packages
    await setStep(vmId, CloudVmStatus.INSTALLING_DEPS, "apt_update", 30);
    await log(vmId, "Installing system dependencies and security packages...");

    let result = await sshExec(
      sshConfig,
      [
        "export DEBIAN_FRONTEND=noninteractive",
        "apt-get update -qq",
        "apt-get install -y -qq curl jq git build-essential ufw fail2ban unattended-upgrades",
      ].join(" && "),
      { timeoutMs: 300_000 },
    );

    if (result.code !== 0) {
      await failVM(
        vmId,
        "install_deps",
        `Exit code ${result.code}: ${result.stderr.slice(0, 500)}`,
      );
      return;
    }

    // Step 6: Install Node.js 22 (required by OpenClaw)
    await setStep(vmId, CloudVmStatus.INSTALLING_DEPS, "install_nodejs", 45);
    await log(vmId, "Installing Node.js 22...");

    result = await sshExec(
      sshConfig,
      [
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y -qq nodejs",
      ].join(" && "),
      { timeoutMs: 180_000 },
    );

    if (result.code !== 0) {
      await failVM(
        vmId,
        "install_nodejs",
        `Exit code ${result.code}: ${result.stderr.slice(0, 500)}`,
      );
      return;
    }

    // Step 6b: Security hardening — dedicated user, firewall, SSH, auto-updates
    await setStep(vmId, CloudVmStatus.INSTALLING_DEPS, "security_hardening", 50);
    await log(vmId, "Applying security hardening...");

    // Create dedicated non-root user for OpenClaw
    result = await sshExec(
      sshConfig,
      [
        `id ${VM_USER} &>/dev/null || useradd -m -s /bin/bash ${VM_USER}`,
        `mkdir -p ${VM_CONFIG_DIR} ${VM_WORKSPACE}`,
        `chown -R ${VM_USER}:${VM_USER} ${VM_HOME}`,
      ].join(" && "),
    );

    if (result.code !== 0) {
      await failVM(vmId, "create_user", `Exit code ${result.code}: ${result.stderr.slice(0, 500)}`);
      return;
    }

    // Configure UFW firewall — allow SSH, block OpenClaw ports from public access
    result = await sshExec(
      sshConfig,
      [
        "ufw default deny incoming",
        "ufw default allow outgoing",
        "ufw allow 22/tcp", // SSH
        "ufw deny 18789/tcp", // OpenClaw Gateway — loopback only
        "ufw deny 18793/tcp", // OpenClaw Canvas Host — loopback only
        "ufw --force enable",
      ].join(" && "),
      { timeoutMs: 30_000 },
    );

    if (result.code !== 0) {
      await log(
        vmId,
        `Warning: UFW setup failed (code ${result.code}): ${result.stderr.slice(0, 300)}`,
        "warn",
      );
      // Non-fatal — continue provisioning
    } else {
      await log(vmId, "UFW firewall configured (SSH allowed, ports 18789/18793 blocked)");
    }

    // Harden SSH — disable password authentication
    result = await sshExec(
      sshConfig,
      [
        "sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config",
        "sed -i 's/^#\\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config",
        "systemctl restart ssh",
      ].join(" && "),
      { timeoutMs: 15_000 },
    );

    if (result.code !== 0) {
      await log(vmId, `Warning: SSH hardening failed: ${result.stderr.slice(0, 300)}`, "warn");
    } else {
      await log(vmId, "SSH hardened (password authentication disabled)");
    }

    // Enable fail2ban with default SSH jail
    result = await sshExec(
      sshConfig,
      ["systemctl enable fail2ban", "systemctl start fail2ban"].join(" && "),
      { timeoutMs: 15_000 },
    );

    if (result.code !== 0) {
      await log(vmId, `Warning: fail2ban setup failed: ${result.stderr.slice(0, 300)}`, "warn");
    } else {
      await log(vmId, "fail2ban enabled for SSH brute-force protection");
    }

    // Enable unattended-upgrades for automatic security patches
    result = await sshExec(
      sshConfig,
      [
        "echo 'APT::Periodic::Update-Package-Lists \"1\";' > /etc/apt/apt.conf.d/20auto-upgrades",
        "echo 'APT::Periodic::Unattended-Upgrade \"1\";' >> /etc/apt/apt.conf.d/20auto-upgrades",
      ].join(" && "),
      { timeoutMs: 15_000 },
    );

    if (result.code !== 0) {
      await log(
        vmId,
        `Warning: unattended-upgrades setup failed: ${result.stderr.slice(0, 300)}`,
        "warn",
      );
    } else {
      await log(vmId, "Unattended-upgrades enabled for automatic security patches");
    }

    // Set up log rotation for OpenClaw logs
    const logrotateConf = [
      "/tmp/openclaw/openclaw-*.log {",
      "  daily",
      "  rotate 7",
      "  compress",
      "  missingok",
      "  notifempty",
      "}",
    ].join("\n");
    await sshUploadFile(sshConfig, "/etc/logrotate.d/openclaw", logrotateConf);

    // Lock down session transcript directory permissions
    await sshExec(
      sshConfig,
      [
        `mkdir -p ${VM_CONFIG_DIR}/agents`,
        `chmod 700 ${VM_CONFIG_DIR}/agents`,
        `chown -R ${VM_USER}:${VM_USER} ${VM_CONFIG_DIR}/agents`,
      ].join(" && "),
    );

    // Step 7: Install OpenClaw globally via npm
    await setStep(vmId, CloudVmStatus.INSTALLING_OPENCLAW, "install_openclaw", 60);
    await log(vmId, "Installing OpenClaw...");

    result = await sshExec(sshConfig, "npm install -g openclaw@latest", { timeoutMs: 300_000 });

    if (result.code !== 0) {
      await failVM(
        vmId,
        "install_openclaw",
        `Exit code ${result.code}: ${result.stderr.slice(0, 500)}`,
      );
      return;
    }

    // Step 7a: Pre-install agentcenter-bridge plugin binary so enable-gateway
    // toggle only needs to write config (no ClawHub call at toggle time → no rate limits).
    await log(vmId, "Pre-installing agentcenter-bridge plugin...");
    const bridgeInstall = await ocExec(
      sshConfig,
      "openclaw plugins install clawhub:@agentcenter/agentcenter-bridge --force",
      { timeoutMs: 120_000 },
    );
    if (bridgeInstall.code !== 0) {
      // Non-fatal — plugin can be installed later when the user enables live gateway
      await log(
        vmId,
        `Warning: agentcenter-bridge pre-install failed — live gateway toggle will install on demand. ${(bridgeInstall.stderr + bridgeInstall.stdout).trim().slice(0, 300)}`,
        "warn",
      );
    } else {
      await log(vmId, "agentcenter-bridge plugin installed");
    }

    // Step 7b: Install Docker for sandbox isolation
    await setStep(vmId, CloudVmStatus.INSTALLING_DEPS, "install_docker", 68);
    await log(vmId, "Installing Docker for sandbox isolation...");

    result = await sshExec(
      sshConfig,
      ["curl -fsSL https://get.docker.com | sh", `usermod -aG docker ${VM_USER}`].join(" && "),
      { timeoutMs: 300_000 },
    );

    if (result.code !== 0) {
      await log(
        vmId,
        `Warning: Docker install failed (code ${result.code}): ${result.stderr.slice(0, 300)}. Sandbox isolation will be unavailable.`,
        "warn",
      );
    } else {
      // Configure Docker log rotation (json-file driver, 50MB max, 3 files = 150MB per container)
      const daemonJson = JSON.stringify({
        "log-driver": "json-file",
        "log-opts": { "max-size": "50m", "max-file": "3" },
      });
      result = await sshExec(
        sshConfig,
        [
          `mkdir -p /etc/docker`,
          `echo '${daemonJson}' > /etc/docker/daemon.json`,
          `systemctl restart docker`,
        ].join(" && "),
        { timeoutMs: 30_000 },
      );

      if (result.code !== 0) {
        await log(
          vmId,
          `Warning: Docker log rotation config failed: ${result.stderr.slice(0, 300)}`,
          "warn",
        );
      } else {
        await log(vmId, "Docker log rotation configured (50MB x 3 files per container)");
      }

      // Build the OpenClaw sandbox image
      result = await sshExec(sshConfig, "openclaw sandbox setup 2>&1 || true", {
        timeoutMs: 300_000,
      });
      if (result.code !== 0) {
        await log(
          vmId,
          `Warning: Sandbox image build failed: ${result.stderr.slice(0, 300)}`,
          "warn",
        );
      } else {
        await log(vmId, "Docker installed and sandbox image built");
      }
    }

    // Step 8: Set up OpenClaw home + workspace directories and write initial config
    await setStep(vmId, CloudVmStatus.CONFIGURING, "setup_workspace", 75);
    await log(vmId, "Setting up OpenClaw workspace...");

    const gatewayToken = generateSecureToken();
    const hooksToken = generateSecureToken();

    const initialConfig = JSON.stringify(
      {
        gateway: {
          mode: "local",
          bind: "loopback",
          auth: { mode: "token", token: gatewayToken },
          remote: { token: gatewayToken },
          http: { endpoints: { chatCompletions: { enabled: true } } },
          controlUi: {
            dangerouslyDisableDeviceAuth: false,
            dangerouslyAllowHostHeaderOriginFallback: false,
          },
        },
        session: {
          dmScope: "per-channel-peer",
        },
        agents: {
          defaults: {
            sandbox: {
              mode: "non-main",
            },
          },
          list: [],
        },
        tools: {
          deny: ["group:automation", "sessions_spawn", "sessions_send"],
          fs: { workspaceOnly: true },
          exec: { host: "sandbox" },
          elevated: { enabled: false },
        },
        hooks: {
          enabled: true,
          token: hooksToken,
          allowedSessionKeyPrefixes: ["hook:", "external:"],
        },
        plugins: { allow: [] },
        discovery: { mdns: { mode: "off" } },
        logging: { redactSensitive: "tools" },
      },
      null,
      2,
    );

    // Store gateway token in DB — live gateway is off by default (no liveGatewayTokenId)
    await updateVM(vmId, { gatewayToken });

    result = await sshExec(
      sshConfig,
      [
        `mkdir -p ${VM_CONFIG_DIR}`,
        `mkdir -p ${VM_WORKSPACE}`,
        `chmod 700 ${VM_CONFIG_DIR}`,
        `chown -R ${VM_USER}:${VM_USER} ${VM_HOME}`,
      ].join(" && "),
    );

    if (result.code !== 0) {
      await failVM(
        vmId,
        "setup_workspace",
        `Exit code ${result.code}: ${result.stderr.slice(0, 500)}`,
      );
      return;
    }

    // Write initial openclaw.json config
    await sshUploadFile(sshConfig, VM_CONFIG_PATH, initialConfig, 0o600);
    // Ensure correct ownership after root uploads file
    await sshExec(sshConfig, `chown ${VM_USER}:${VM_USER} ${VM_CONFIG_PATH}`);

    // Step 9: Start OpenClaw daemon via systemd
    await setStep(vmId, CloudVmStatus.STARTING_SERVICE, "start_daemon", 85);
    await log(vmId, "Starting OpenClaw daemon...");

    // Create a systemd service for OpenClaw — runs as dedicated non-root user
    const serviceUnit = [
      "[Unit]",
      "Description=OpenClaw Agent Gateway",
      "After=network.target",
      "",
      "[Service]",
      "Type=simple",
      `User=${VM_USER}`,
      `Group=${VM_USER}`,
      "ExecStart=/usr/bin/openclaw gateway",
      "Restart=always",
      "RestartSec=5",
      `Environment=HOME=${VM_HOME}`,
      `Environment=VM_CONFIG_PATH=${VM_CONFIG_PATH}`,
      "",
      "[Install]",
      "WantedBy=multi-user.target",
    ].join("\n");

    await sshUploadFile(sshConfig, "/etc/systemd/system/openclaw.service", serviceUnit);

    result = await sshExec(
      sshConfig,
      ["systemctl daemon-reload", "systemctl enable openclaw", "systemctl start openclaw"].join(
        " && ",
      ),
      { timeoutMs: 30_000 },
    );

    if (result.code !== 0) {
      await failVM(
        vmId,
        "start_daemon",
        `Exit code ${result.code}: ${result.stderr.slice(0, 500)}`,
      );
      return;
    }

    // Step 10: Run security audit
    await setStep(vmId, CloudVmStatus.CONFIGURING, "security_audit", 95);
    await log(vmId, "Running OpenClaw security audit...");

    const auditResult = await sshExec(
      sshConfig,
      `sudo -u ${VM_USER} openclaw security audit --fix 2>&1 || true`,
      { timeoutMs: 30_000 },
    );
    if (auditResult.stdout.trim()) {
      await log(vmId, `Security audit: ${auditResult.stdout.trim().slice(0, 500)}`);
    }

    // Step 11: Done!
    await updateVM(vmId, {
      status: CloudVmStatus.RUNNING,
      setupStep: null,
      setupProgress: 100,
      installedAt: new Date(),
    });
    await log(vmId, "VM provisioned and running — ready for agents (security hardened)");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await failVM(vmId, "unexpected", message);
  }
}

// ─── Cleanup Agent from Old VM ───────────────────────────────────────

/**
 * Remove an agent from a VM: cron jobs, agents list, workspace, gateway restart.
 * Used when moving an agent to a different VM.
 */
async function cleanupAgentFromVM(
  oldVmId: string,
  agent: { id: string; name: string; username: string | null },
): Promise<void> {
  const oldVm = await getCloudVMOrThrow(oldVmId).catch(() => null);
  if (!oldVm || oldVm.status !== CloudVmStatus.RUNNING || !oldVm.ipv4 || !oldVm.sshPrivateKey) {
    // Old VM is not reachable — just clear the DB reference
    await log(oldVmId, `Skipping cleanup for agent "${agent.name}" — old VM not reachable`);
    return;
  }

  const sshConfig = getVMSSHConfig(oldVm);
  const agentSlug = getAgentSlug(agent);

  try {
    // 1. Remove cron jobs
    const removedCrons = await removeAgentCrons(sshConfig, agentSlug);
    if (removedCrons > 0) {
      await log(oldVmId, `Removed ${removedCrons} cron job(s) for agent "${agent.name}"`);
    }

    // 2. Remove agent from openclaw.json agents list
    const config = await readVMConfig(sshConfig);
    const agentsObj = (config.agents as Record<string, unknown>) || {};
    const agentsList = (agentsObj.list as { id: string }[]) || [];
    agentsObj.list = agentsList.filter((a) => a.id !== agentSlug);
    config.agents = agentsObj;
    await writeVMConfig(sshConfig, config);

    // 3. Delete the agent workspace directory
    const workspacePath = `${VM_WORKSPACE}/${agentSlug}`;
    await sshExec(sshConfig, `rm -rf ${workspacePath}`);
    await log(oldVmId, `Deleted workspace for agent "${agent.name}" at ${workspacePath}`);

    // 4. Restart gateway to pick up config changes
    await restartGateway(sshConfig);
    await log(oldVmId, `Agent "${agent.name}" fully removed from VM`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await log(
      oldVmId,
      `Warning: cleanup of agent "${agent.name}" partially failed: ${message}`,
      "warn",
    );
    // Non-fatal — continue with reassignment
  }
}

// ─── Assign Agent to VM ─────────────────────────────────────────────

interface AssignAgentParams {
  agentId: string;
  cloudVmId: string;
}

export async function assignAgentToVM(params: AssignAgentParams): Promise<void> {
  const { agentId, cloudVmId } = params;

  const vm = await getCloudVMOrThrow(cloudVmId);
  if (vm.status !== CloudVmStatus.RUNNING) {
    throw new Error("Can only assign agents to a running VM");
  }

  const agent = await getAgentOrThrow(agentId);

  // If agent is on a different VM, clean up the old VM first
  if (agent.cloudVmId && agent.cloudVmId !== cloudVmId) {
    await cleanupAgentFromVM(agent.cloudVmId, agent);
  }

  // Generate fresh API key
  const { plainKey, hash, prefix } = generateApiKey();
  const agentSlug = getAgentSlug(agent);

  // Update agent in DB
  await updateAgent(agentId, {
    cloudVmId,
    hostingType: "cloudVM",
    apiKeyHash: hash,
    apiKeyPrefix: prefix,
    apiKeyCreatedAt: new Date(),
  });

  try {
    const sshConfig = getVMSSHConfig(vm);

    // Create workspace directory for this agent
    await log(cloudVmId, `Setting up workspace for agent "${agent.name}"...`);

    await ensureAgentWorkspace(sshConfig, agentSlug);

    // Generate and upload agent config files to workspace
    await uploadAgentConfigFiles(sshConfig, agent, agentSlug, {
      apiKey: plainKey,
      agentId: agent.id,
    });

    // Merge agent list into existing openclaw.json (preserving gateway.auth.token, env, etc.)
    const vmAgents = await findAgentsByCloudVmId(cloudVmId, {
      username: true,
      name: true,
      llmModel: true,
    });

    // Ensure gateway, hooks, security config AND agents list in a single config write
    // (avoids two writes that trigger OpenClaw's hot-reloader twice → double restart)
    await ensureGatewayConfig(sshConfig, {
      updateVMToken: async (token) => {
        await updateVM(cloudVmId, { gatewayToken: token });
      },
      agentsList: buildAgentsList(vmAgents),
    });

    // Fix ownership — SSH uploads as root, but gateway runs as agentcenter
    await sshExec(sshConfig, `chown -R ${VM_USER}:${VM_USER} ${VM_HOME}`);
    await log(cloudVmId, `Agent "${agent.name}" config files written`);

    // Restart gateway and verify agent is registered
    const registered = await restartGateway(sshConfig, { expectAgent: agentSlug });
    if (registered) {
      await log(cloudVmId, `Agent "${agentSlug}" verified in openclaw agents list`);
    } else {
      throw new Error(
        `Agent "${agentSlug}" not visible in openclaw agents list after gateway restart`,
      );
    }

    // Set up heartbeat cron directly via SSH (no AI bootstrap needed — saves tokens)
    const agentIndex = await computeAgentCronIndex(cloudVmId, agentSlug, vmAgents);
    const cronSchedule = computeCronSchedule(agentIndex);
    const cronResult = await ensureHeartbeatCron(sshConfig, agentSlug, cronSchedule);
    if (cronResult.ok) {
      await log(cloudVmId, `${cronResult.message} for "${agentSlug}"`);
    } else {
      throw new Error(`Failed to create heartbeat cron for "${agentSlug}": ${cronResult.message}`);
    }

    await log(cloudVmId, `Agent "${agent.name}" assigned and configured on VM`);
  } catch (err) {
    // Rollback: clean up VM state before resetting DB
    try {
      const sshConfig = getVMSSHConfig(vm);
      // 1. Remove agent's cron jobs
      await removeAgentCrons(sshConfig, agentSlug);
      // 2. Remove agent from openclaw.json agents list
      const rollbackConfig = await readVMConfig(sshConfig);
      const rollbackAgentsObj = (rollbackConfig.agents as Record<string, unknown>) || {};
      const rollbackList = (rollbackAgentsObj.list as { id: string }[]) || [];
      rollbackAgentsObj.list = rollbackList.filter((a) => a.id !== agentSlug);
      rollbackConfig.agents = rollbackAgentsObj;
      await writeVMConfig(sshConfig, rollbackConfig);
      // 3. Restart gateway to pick up config change
      await restartGateway(sshConfig);
      // Keep workspace for debugging
    } catch (rollbackErr) {
      console.error(`[cloud-vm] Rollback cleanup failed for agent "${agentSlug}":`, rollbackErr);
    }

    // 4. Reset agent in DB
    await updateAgent(agentId, { cloudVmId: null, hostingType: "selfHosted" });

    const message = err instanceof Error ? err.message : "Unknown error";
    await log(cloudVmId, `Failed to configure agent "${agent.name}" on VM: ${message}`, "error");
    throw new Error(`Failed to configure agent on VM: ${message}`);
  }
}

// ─── Unassign Agent ─────────────────────────────────────────────────

export async function unassignAgentFromVM(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.cloudVmId) {
    throw new Error("Agent is not assigned to any VM");
  }

  const vmId = agent.cloudVmId;

  // Clean up VM-side state: cron jobs, openclaw.json agents list, workspace,
  // gateway restart (which forces plugin to re-report and removes LiveAgentRoute entry)
  await cleanupAgentFromVM(vmId, agent);

  await updateAgent(agentId, { cloudVmId: null, hostingType: "selfHosted" });

  await log(vmId, `Agent "${agent.name}" unassigned from VM`);
}

// ─── Destroy Cloud VM ───────────────────────────────────────────────

export async function destroyCloudVM(vmId: string): Promise<void> {
  const vm = await getCloudVMOrThrow(vmId);
  if (vm.status === CloudVmStatus.DESTROYED) {
    throw new Error("VM is already destroyed");
  }

  await updateVM(vmId, { status: CloudVmStatus.DESTROYING });

  // Unassign all agents
  await updateManyAgentsByVm(vmId, { cloudVmId: null, hostingType: "selfHosted" });

  // Revoke the live gateway install token so the plugin can no longer reconnect
  if ((vm as any).liveGatewayTokenId) {
    await revokeLiveGatewayToken((vm as any).liveGatewayTokenId).catch(() => undefined);
  }

  // Terminate any live WS and delete connection records (+ cascaded routes/deliveries).
  await teardownLiveConnections(vm.serverName);

  await log(vmId, "Destroying server...");

  // Delete Hetzner server
  if (vm.externalServerId) {
    try {
      await deleteServer(vm.externalServerId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await log(vmId, `Warning: Failed to delete Hetzner server: ${message}`, "warn");
    }
  }

  // Clean up SSH key from Hetzner
  if (vm.hetznerSshKeyId) {
    try {
      await deleteSSHKey(vm.hetznerSshKeyId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await log(vmId, `Warning: Failed to delete SSH key: ${message}`, "warn");
    }
  }

  await updateVM(vmId, {
    status: CloudVmStatus.DESTROYED,
    destroyedAt: new Date(),
    sshPrivateKey: null,
    liveGatewayTokenId: null,
  });

  await log(vmId, "Server destroyed");
}

// ─── Stop / Start ───────────────────────────────────────────────────

export async function stopCloudVM(vmId: string): Promise<void> {
  const vm = await getCloudVMOrThrow(vmId);
  if (vm.status !== CloudVmStatus.RUNNING) {
    throw new Error("Can only stop a running VM");
  }
  if (!vm.externalServerId) {
    throw new Error("No server associated with this VM");
  }

  // Revoke live gateway token before powering off — live gateway is disabled on stop.
  // Re-enabling after restart is a manual action via the toggle button.
  if ((vm as any).liveGatewayTokenId) {
    await revokeLiveGatewayToken((vm as any).liveGatewayTokenId).catch(() => undefined);
  }
  // Terminate any live WS and delete connection records (+ cascaded routes/deliveries).
  // Heartbeat will re-sync any ASSIGNED tasks once the VM restarts.
  await teardownLiveConnections(vm.serverName);

  await powerOff(vm.externalServerId);
  await updateVM(vmId, {
    status: CloudVmStatus.STOPPED,
    stoppedAt: new Date(),
    liveGatewayTokenId: null,
  });

  await log(vmId, "Server powered off — live gateway disabled");
}

export async function startCloudVM(vmId: string): Promise<void> {
  const vm = await getCloudVMOrThrow(vmId);
  if (vm.status !== CloudVmStatus.STOPPED) {
    throw new Error("Can only start a stopped VM");
  }
  if (!vm.externalServerId) {
    throw new Error("No server associated with this VM");
  }

  await powerOn(vm.externalServerId);
  await updateVM(vmId, { status: CloudVmStatus.RUNNING, stoppedAt: null });
  await log(vmId, "Server powered on — use the Live Gateway toggle to re-enable if needed");
}

// ─── Configure LLM on VM ────────────────────────────────────────────

/** Validation endpoints for each provider — lightweight calls to verify API keys. */
const PROVIDER_VALIDATION: Record<
  string,
  { url: string; headers: (key: string) => Record<string, string> }
> = {
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    headers: () => ({}), // Anthropic headers are set inline in the validation function
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: () => ({}),
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  groq: {
    url: "https://api.groq.com/openai/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  deepseek: {
    url: "https://api.deepseek.com/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  cerebras: {
    url: "https://api.cerebras.ai/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
};

async function validateApiKey(providerId: string, apiKey: string): Promise<void> {
  const validation = PROVIDER_VALIDATION[providerId];
  if (!validation) return; // Skip validation for providers without a known endpoint

  try {
    let url = validation.url;
    const headers = validation.headers(apiKey);

    // Google uses query param auth
    if (providerId === "google") {
      url = `${url}?key=${apiKey}`;
    }

    // Anthropic — POST with minimal body; 401/403 = bad key, 400 = valid key (bad request body is expected)
    if (providerId === "anthropic") {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error("Invalid API key — authentication failed");
      }
      return;
    }

    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error("Invalid API key — authentication failed");
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Invalid API key")) {
      throw err;
    }
    // Network errors or timeouts — don't block config, just warn
    console.warn(`API key validation for ${providerId} failed (non-auth):`, err);
  }
}

interface ConfigureLLMParams {
  vmId: string;
  providerId: string;
  apiKey: string;
  model: string;
}

export async function configureLLMOnVM(params: ConfigureLLMParams): Promise<void> {
  const { vmId, providerId, apiKey, model } = params;

  const provider = LLM_PROVIDERS_MAP[providerId];
  if (!provider) {
    throw new Error(`Unknown LLM provider: ${providerId}`);
  }

  // Validate API key before deploying to VM
  await validateApiKey(providerId, apiKey);

  const vm = await getCloudVMOrThrow(vmId);
  if (vm.status !== CloudVmStatus.RUNNING) {
    throw new Error("Can only configure LLM on a running VM");
  }

  const sshConfig = getVMSSHConfig(vm);

  // Read current openclaw.json
  const config = await readVMConfig(sshConfig);
  if (Object.keys(config).length === 0) {
    throw new Error("Failed to read or parse openclaw.json on VM");
  }

  const envVarName = provider.envVar;

  // Set API key in env block (top-level) AND env.vars (nested) — docs show both patterns
  const envBlock = (config.env as Record<string, unknown>) || {};
  envBlock[envVarName] = apiKey;
  const vars = (envBlock.vars as Record<string, string>) || {};
  vars[envVarName] = apiKey;
  envBlock.vars = vars;
  config.env = envBlock;

  // Set default model — OpenClaw expects "provider/model" format
  // OpenClaw internally normalises "model" → "models" (plural), so write both keys
  const qualifiedModel = model.includes("/") ? model : `${providerId}/${model}`;
  const agents = (config.agents as Record<string, unknown>) || {};
  const defaults = (agents.defaults as Record<string, unknown>) || {};
  setDefaultModelInConfig(defaults, qualifiedModel);
  agents.defaults = defaults;
  config.agents = agents;

  // Write updated config back (single write — avoid redundant CLI set that triggers double hot-reload)
  await writeVMConfig(sshConfig, config);

  // Write API key to auth-profiles.json for all agent dirs
  const findAgentDirs = await sshExec(
    sshConfig,
    `ls -d ${VM_CONFIG_DIR}/agents/*/agent 2>/dev/null || true`,
  );
  const existingAgentPaths = findAgentDirs.stdout.trim().split("\n").filter(Boolean);

  const authDirPaths = new Set([`${VM_CONFIG_DIR}/agents/main/agent`]);
  for (const p of existingAgentPaths) authDirPaths.add(p);
  const agentsList = (agents.list as Array<{ id?: string; name?: string }>) || [];
  for (const a of agentsList) {
    const aid = a.id || a.name;
    if (aid) authDirPaths.add(`${VM_CONFIG_DIR}/agents/${aid}/agent`);
  }

  // auth-profiles.json — write the credential in every known format variant to cover all versions:
  // Docs show both flat and "profiles"-wrapped, with "type" or no "type" field
  const authProfileEntry = {
    type: "api_key",
    provider: providerId,
    key: apiKey,
  };

  for (const dirPath of authDirPaths) {
    const authProfilePath = `${dirPath}/auth-profiles.json`;
    await sshExec(sshConfig, `mkdir -p ${dirPath}`);

    // Read existing to preserve other providers' credentials
    const authRead = await sshExec(sshConfig, `cat ${authProfilePath} 2>/dev/null`);
    let existingFlat: Record<string, unknown> = {};
    if (authRead.code === 0 && authRead.stdout.trim()) {
      try {
        const parsed = JSON.parse(authRead.stdout);
        // Extract existing entries from either format
        if (parsed.profiles && typeof parsed.profiles === "object") {
          existingFlat = { ...parsed.profiles };
        }
        // Also grab any top-level provider entries (flat format)
        for (const [k, v] of Object.entries(parsed)) {
          if (k.includes(":") && typeof v === "object") existingFlat[k] = v;
        }
      } catch {
        /* start fresh */
      }
    }

    // Set our provider entry
    existingFlat[`${providerId}:default`] = authProfileEntry;

    // Write with "profiles" wrapper (model-failover docs say profiles are under "profiles" key)
    const authContent = JSON.stringify({ profiles: existingFlat }, null, 2);
    await sshUploadFile(sshConfig, authProfilePath, authContent);
    await sshExec(sshConfig, `chown -R ${VM_USER}:${VM_USER} ${dirPath}`);

    // Verify
    const verify = await sshExec(sshConfig, `cat ${authProfilePath}`);
    console.log(`[llm-config] Wrote ${authProfilePath}:`, verify.stdout.slice(0, 400));
  }

  // Set env var via systemd override as process-level fallback
  await sshExec(
    sshConfig,
    [
      "mkdir -p /etc/systemd/system/openclaw.service.d",
      `printf '[Service]\\nEnvironment=${envVarName}=${apiKey}\\n' > /etc/systemd/system/openclaw.service.d/llm-key.conf`,
      "systemctl daemon-reload",
    ].join(" && "),
  );

  // Fix ownership — SSH uploads as root, but gateway runs as agentcenter
  await sshExec(sshConfig, `chown -R ${VM_USER}:${VM_USER} ${VM_HOME}`);

  // Restart OpenClaw so changes take effect
  const restarted = await restartGateway(sshConfig);
  if (!restarted) {
    throw new Error("Failed to restart OpenClaw after LLM configuration");
  }

  // Update DB — no API key stored
  await updateVM(vmId, {
    llmConfigured: true,
    llmProvider: providerId,
    llmModel: model,
  });

  await log(vmId, `LLM configured: ${provider.name} / ${model}`);
}

// ─── Set VM Default Model ────────────────────────────────────────────

/**
 * Switch the VM-level default model (agents.defaults.model.primary).
 * Does NOT touch API keys — just switches which model all agents use by default.
 */
export async function setVMDefaultModel(vmId: string, model: string): Promise<void> {
  const vm = await getCloudVMOrThrow(vmId);
  if (vm.status !== CloudVmStatus.RUNNING) {
    throw new Error("Can only change model on a running VM");
  }

  const sshConfig = getVMSSHConfig(vm);
  const config = await readVMConfig(sshConfig);

  // Update agents.defaults model — OpenClaw uses "models" (plural) internally
  const agents = (config.agents as Record<string, unknown>) || {};
  const defaults = (agents.defaults as Record<string, unknown>) || {};
  setDefaultModelInConfig(defaults, model);
  agents.defaults = defaults;
  config.agents = agents;

  await writeVMConfig(sshConfig, config);

  // Restart gateway — reset failed state first in case it was crash-looping
  await sshExec(
    sshConfig,
    "systemctl reset-failed openclaw 2>/dev/null; systemctl restart openclaw",
    { timeoutMs: 30_000 },
  );
  const restarted = await waitForGateway(sshConfig, { maxAttempts: 20, intervalMs: 1_500 });
  if (!restarted) {
    throw new Error("Failed to restart OpenClaw after model change");
  }

  // Update DB
  await updateVM(vmId, { llmModel: model });
  await log(vmId, `VM default model changed to ${model}`);
}

// ─── Set Per-Agent Model ─────────────────────────────────────────────

/**
 * Set or clear a per-agent model override.
 * When `model` is non-null, that agent uses a specific model instead of the VM default.
 * When `model` is null, the agent reverts to using the VM default.
 */
export async function setAgentModelOnVM(
  vmId: string,
  agentSlug: string,
  model: string | null,
): Promise<void> {
  const vm = await getCloudVMOrThrow(vmId);
  if (vm.status !== CloudVmStatus.RUNNING) {
    throw new Error("Can only change agent model on a running VM");
  }

  // Find the agent in DB
  const agent = await findAgentByVmAndSlug(vmId, agentSlug);
  if (!agent) {
    throw new Error(`Agent "${agentSlug}" not found on VM`);
  }

  const sshConfig = getVMSSHConfig(vm);
  const config = await readVMConfig(sshConfig);

  // Find and update the agent entry in agents.list
  const agentsObj = (config.agents as Record<string, unknown>) || {};
  const agentsList = (agentsObj.list as Record<string, unknown>[]) || [];
  const entry = agentsList.find((a) => a.id === agentSlug || a.name === agentSlug);

  if (!entry) {
    throw new Error(`Agent "${agentSlug}" not found in VM config`);
  }

  if (model) {
    entry.model = model;
  } else {
    delete entry.model;
  }

  agentsObj.list = agentsList;
  config.agents = agentsObj;
  await writeVMConfig(sshConfig, config);

  // Restart gateway — reset failed state first in case it was crash-looping
  await sshExec(
    sshConfig,
    "systemctl reset-failed openclaw 2>/dev/null; systemctl restart openclaw",
    { timeoutMs: 30_000 },
  );
  const restarted = await waitForGateway(sshConfig, { maxAttempts: 20, intervalMs: 1_500 });
  if (!restarted) {
    throw new Error("Failed to restart OpenClaw after agent model change");
  }

  // Update DB
  await updateAgent(agent.id, { llmModel: model });

  await log(
    vmId,
    model
      ? `Agent "${agentSlug}" model set to ${model}`
      : `Agent "${agentSlug}" model reset to VM default`,
  );
}

/**
 * Full repair for a running VM:
 * 1. Fix systemd service (ExecStart, env vars)
 * 2. Fix openclaw.json (gateway.mode, hooks, remove invalid keys)
 * 3. Re-upload config files for assigned agents
 * 4. Restart service
 * 5. Send bootstrap messages to agents for cron + identity setup
 */
export async function repairOpenClawService(vmId: string): Promise<void> {
  const vm = await getCloudVMOrThrow(vmId);
  if (vm.status !== CloudVmStatus.RUNNING) {
    throw new Error("Can only repair a running VM");
  }

  const sshConfig = getVMSSHConfig(vm);

  // ── 1. Fix systemd service file ──
  const check = await sshExec(sshConfig, "grep '^ExecStart=' /etc/systemd/system/openclaw.service");
  const currentExec = check.stdout.trim();
  if (currentExec !== "ExecStart=/usr/bin/openclaw gateway") {
    await sshExec(
      sshConfig,
      "sed -i 's|ExecStart=.*|ExecStart=/usr/bin/openclaw gateway|' /etc/systemd/system/openclaw.service",
    );
    await log(vmId, `Fixed ExecStart: ${currentExec} → openclaw gateway`);
  }

  // Ensure service runs as dedicated user, not root
  const userCheck = await sshExec(sshConfig, "grep '^User=' /etc/systemd/system/openclaw.service");
  if (userCheck.stdout.trim() !== `User=${VM_USER}`) {
    await sshExec(
      sshConfig,
      `sed -i 's|^User=.*|User=${VM_USER}|' /etc/systemd/system/openclaw.service`,
    );
    // Add Group if missing
    const groupCheck = await sshExec(
      sshConfig,
      "grep '^Group=' /etc/systemd/system/openclaw.service",
    );
    if (groupCheck.code !== 0) {
      await sshExec(
        sshConfig,
        `sed -i '/^User=/a Group=${VM_USER}' /etc/systemd/system/openclaw.service`,
      );
    }
    await log(vmId, `Fixed service user: running as ${VM_USER}`);
  }

  const envCheck = await sshExec(
    sshConfig,
    "grep 'VM_HOME\\|/root/' /etc/systemd/system/openclaw.service",
  );
  if (envCheck.code === 0) {
    await sshExec(
      sshConfig,
      [
        `sed -i 's|Environment=VM_HOME=/root/.openclaw|Environment=VM_CONFIG_PATH=${VM_CONFIG_PATH}|' /etc/systemd/system/openclaw.service`,
        `sed -i 's|Environment=HOME=/root|Environment=HOME=${VM_HOME}|' /etc/systemd/system/openclaw.service`,
        `sed -i 's|Environment=VM_CONFIG_PATH=/root/.openclaw/openclaw.json|Environment=VM_CONFIG_PATH=${VM_CONFIG_PATH}|' /etc/systemd/system/openclaw.service`,
      ].join(" && "),
    );
    await log(vmId, "Fixed env paths to use dedicated user home");
  }

  // ── 2. Fix openclaw.json ──
  // Ensure dedicated user and directories exist
  await sshExec(
    sshConfig,
    [
      `id ${VM_USER} &>/dev/null || useradd -m -s /bin/bash ${VM_USER}`,
      `mkdir -p ${VM_CONFIG_DIR} ${VM_WORKSPACE}`,
    ].join(" && "),
  );
  // ── 3. Re-upload agent config files + rebuild agents list ──
  const vmAgents = await findAgentsByCloudVmId(vmId, {
    id: true,
    name: true,
    username: true,
    role: true,
    identityEmoji: true,
    personality: true,
    level: true,
    templateId: true,
    apiKeyHash: true,
    llmModel: true,
  });

  // Apply full gateway, hooks, security config AND agents list in a single config write
  // (avoids two writes that trigger OpenClaw's hot-reloader twice → double restart)
  await ensureGatewayConfig(sshConfig, {
    full: true,
    updateVMToken: async (token) => {
      await updateVM(vmId, { gatewayToken: token });
    },
    agentsList: vmAgents.length > 0 ? buildAgentsList(vmAgents) : undefined,
  });

  if (vmAgents.length > 0) {
    // Re-upload workspace config files for each agent
    for (const a of vmAgents) {
      const slug = getAgentSlug(a);
      await ensureAgentWorkspace(sshConfig, slug);
      await uploadAgentConfigFiles(sshConfig, a, slug, {
        agentId: a.id,
        apiKey: "$AGENT_KEY", // placeholder — agent already has key
        preserveMemory: true,
      });
      await log(vmId, `Updated config files for agent "${a.name}" (preserved MEMORY.md)`);
    }
  }

  // Ensure correct ownership
  await sshExec(sshConfig, `chown -R ${VM_USER}:${VM_USER} ${VM_HOME}`);
  await log(vmId, "Config repaired (gateway.mode, hooks, agents list)");

  // ── 4. Restart service ──
  const result = await sshExec(sshConfig, "systemctl daemon-reload && systemctl restart openclaw", {
    timeoutMs: 30_000,
  });
  if (result.code !== 0) {
    throw new Error(`Failed to restart service: ${result.stderr.slice(0, 500)}`);
  }
  await log(vmId, "OpenClaw service restarted");

  // ── 5. Set up heartbeat crons directly via SSH ──
  if (vmAgents.length > 0) {
    // Wait for gateway to come up — throw if it doesn't
    const gatewayUp = await waitForGateway(sshConfig);
    if (!gatewayUp) {
      throw new Error("Gateway did not become active after restart");
    }

    // Remove all existing crons to avoid duplicates, then recreate
    for (const a of vmAgents) {
      const slug = getAgentSlug(a);
      const agentIndex = await computeAgentCronIndex(vmId, slug, vmAgents);
      const cronSchedule = computeCronSchedule(agentIndex);
      const cronResult = await ensureHeartbeatCron(sshConfig, slug, cronSchedule);
      if (cronResult.ok) {
        await log(vmId, `${cronResult.message} for "${slug}"`);
      } else {
        await log(
          vmId,
          `Warning: failed to create heartbeat cron for "${slug}": ${cronResult.message}`,
          "warn",
        );
      }
    }
  }

  await log(vmId, "Repair complete");
}

// ─── Live Gateway Toggle ────────────────────────────────────────────

/**
 * Enable live gateway on a running VM.
 * Creates a fresh install token, writes the agentcenter-bridge plugin config
 * into openclaw.json, and installs the plugin. The daemon hot-reloads and
 * the plugin connects to the live gateway automatically.
 */
export async function enableVMLiveGateway(vmId: string): Promise<void> {
  const vm = await getCloudVMOrThrow(vmId);
  if (vm.status !== CloudVmStatus.RUNNING) {
    throw new Error("VM must be running to enable live gateway");
  }
  if ((vm as any).liveGatewayTokenId) {
    throw new Error("Live gateway is already enabled on this VM");
  }

  const sshConfig = getVMSSHConfig(vm);
  const { raw: liveRawToken, tokenId } = await createVMLiveGatewayToken(vmId);

  try {
    await installBridgePlugin(sshConfig, liveRawToken);
    await updateVM(vmId, { liveGatewayTokenId: tokenId });
    await log(vmId, "Live gateway enabled — agentcenter-bridge plugin installed");
  } catch (err) {
    // Clean up so next attempt gets a fresh token
    await revokeLiveGatewayToken(tokenId).catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    await log(vmId, `Failed to enable live gateway: ${message}`, "error");
    throw new Error(`Failed to enable live gateway: ${message}`);
  }
}

/**
 * Disable live gateway on a running VM.
 * Revokes the install token, sets the plugin to disabled in openclaw.json,
 * and clears liveGatewayTokenId. The daemon hot-reloads and the plugin stops.
 * Agents fall back to heartbeat polling — no task data is lost.
 */
export async function disableVMLiveGateway(vmId: string): Promise<void> {
  const vm = await getCloudVMOrThrow(vmId);
  if (vm.status !== CloudVmStatus.RUNNING) {
    throw new Error("VM must be running to disable live gateway");
  }
  if (!(vm as any).liveGatewayTokenId) {
    throw new Error("Live gateway is not enabled on this VM");
  }

  // Revoke token first — plugin can no longer authenticate after this
  await revokeLiveGatewayToken((vm as any).liveGatewayTokenId).catch(() => undefined);

  // Disable plugin entry in config (set enabled: false so daemon stops it on hot-reload)
  // Also delete connections so any active WS sessions are cleared from DB
  const sshConfig = getVMSSHConfig(vm);
  try {
    const cfg = await readVMConfig(sshConfig);
    const entries = ((cfg.plugins as any)?.entries ?? {}) as Record<string, unknown>;
    if (entries["agentcenter-bridge"]) {
      (entries["agentcenter-bridge"] as any).enabled = false;
      cfg.plugins = { allow: [], entries };
    } else {
      cfg.plugins = { allow: [] };
    }
    await writeVMConfig(sshConfig, cfg);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log(
      vmId,
      `Warning: could not update plugin config (${message}) — token is still revoked`,
      "warn",
    );
  }

  // Terminate any live WS and delete connection records (+ cascaded routes/deliveries).
  await teardownLiveConnections(vm.serverName);

  await updateVM(vmId, { liveGatewayTokenId: null });
  await log(vmId, "Live gateway disabled — agents will use heartbeat polling");
}

/**
 * Sync (update) the agentcenter-bridge plugin binary on a running VM.
 * Re-installs the plugin from ClawHub to get the latest version, then
 * re-writes the plugin config with the existing token and restarts the daemon.
 * No token rotation — active connections are not interrupted.
 */
export async function syncVMLiveGatewayPlugin(vmId: string): Promise<void> {
  const vm = await getCloudVMOrThrow(vmId);
  if (vm.status !== CloudVmStatus.RUNNING) {
    throw new Error("VM must be running to sync the live gateway plugin");
  }
  if (!(vm as any).liveGatewayTokenId) {
    throw new Error("Live gateway is not enabled — enable it first before syncing");
  }

  const sshConfig = getVMSSHConfig(vm);

  await log(vmId, "Syncing agentcenter-bridge plugin — updating to latest version...");

  // Try `update` first — already-installed plugins skip the security re-scan.
  // Fall back to `install` if update command is not available.
  let update: Awaited<ReturnType<typeof ocExec>> | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    update = await ocExec(sshConfig, "openclaw plugins update agentcenter-bridge", {
      timeoutMs: 120_000,
    });
    if (update.code === 0) break;
    const output = (update.stderr + update.stdout).toLowerCase();
    if ((output.includes("429") || output.includes("rate limit")) && attempt < 3) {
      await sleep(attempt * 8_000);
      continue;
    }
    // If update command itself is unrecognised, fall through to install
    if (output.includes("unknown command") || output.includes("not found")) break;
    break;
  }

  if (update!.code !== 0) {
    // Fallback: reinstall (requires plugin to be verified on ClawHub to pass security scan)
    await log(vmId, "plugins update not available — falling back to install...", "warn");
    let install: Awaited<ReturnType<typeof ocExec>> | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      install = await ocExec(
        sshConfig,
        "openclaw plugins install clawhub:@agentcenter/agentcenter-bridge --force",
        { timeoutMs: 120_000 },
      );
      if (install.code === 0) break;
      const output = (install.stderr + install.stdout).toLowerCase();
      if ((output.includes("429") || output.includes("rate limit")) && attempt < 3) {
        await sleep(attempt * 8_000);
        continue;
      }
      break;
    }
    if (install!.code !== 0) {
      const detail = (install!.stderr + "\n" + install!.stdout).trim().slice(0, 800);
      throw new Error(
        `Plugin sync failed — the plugin must be verified on ClawHub to allow reinstall.\n\n${detail}`,
      );
    }
  }

  // Ensure plugin is enabled in config (binary update may reset its state)
  const config = await readVMConfig(sshConfig);
  const entries = ((config.plugins as any)?.entries ?? {}) as Record<string, unknown>;
  if (entries["agentcenter-bridge"]) {
    (entries["agentcenter-bridge"] as any).enabled = true;
    config.plugins = { allow: ["agentcenter-bridge"], entries };
    await writeVMConfig(sshConfig, config);
  }

  // Restart daemon so it picks up the new binary
  await restartGateway(sshConfig);

  await log(vmId, "agentcenter-bridge plugin synced and daemon restarted");
}

/**
 * Repair all running VMs that have the wrong ExecStart.
 * Returns the count of VMs repaired.
 */
export async function repairAllRunningVMs(): Promise<number> {
  const vms = await listRunningCloudVMsForRepair();

  let repaired = 0;
  for (const vm of vms) {
    try {
      await repairOpenClawService(vm.id);
      repaired++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await log(vm.id, `Repair failed: ${message}`, "error");
    }
  }

  return repaired;
}
