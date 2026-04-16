/**
 * Open an interactive SSH terminal into a Cloud VM.
 *
 * Usage:
 *   npx dotenv -e .env -- tsx scripts/ssh-vm.ts              # pick from list
 *   npx dotenv -e .env -- tsx scripts/ssh-vm.ts <name-or-ip> # connect directly
 *
 * The script:
 *   1. Queries the DB for running VMs
 *   2. Decrypts the stored SSH private key
 *   3. Writes it to a temp file (mode 0600)
 *   4. Spawns: ssh -i <tmpKey> root@<ipv4>
 *   5. Cleans up the temp file on exit
 */

import { prisma } from "../src/server/prisma";
import { decryptPrivateKey } from "../src/server/services/ssh-keys";
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as readline from "readline";

const SSH_KEY_SECRET = process.env.SSH_KEY_ENCRYPTION_SECRET;

async function pickVM(hint?: string) {
  const vms = await prisma.cloudVM.findMany({
    where: {
      status: { not: "destroyed" },
      ipv4: { not: null },
      sshPrivateKey: { not: null },
    },
    select: {
      id: true,
      name: true,
      serverName: true,
      ipv4: true,
      status: true,
      sshPrivateKey: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (vms.length === 0) {
    console.error("No VMs with an IP address found in the database.");
    process.exit(1);
  }

  if (hint) {
    const match = vms.find(
      (v) => v.ipv4 === hint || v.name === hint || v.serverName === hint || v.id === hint,
    );
    if (!match) {
      console.error(`No VM matched "${hint}". Available VMs:`);
      for (const v of vms) {
        console.error(`  ${v.name ?? v.serverName ?? v.id}  ${v.ipv4}  [${v.status}]`);
      }
      process.exit(1);
    }
    return match;
  }

  if (vms.length === 1) return vms[0];

  // Interactive picker
  console.log("\nAvailable VMs:\n");
  vms.forEach((v, i) => {
    const label = v.name ?? v.serverName ?? v.id;
    console.log(`  [${i + 1}] ${label}  —  ${v.ipv4}  [${v.status}]`);
  });
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question("Select VM number: ", (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });

  const idx = parseInt(answer, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= vms.length) {
    console.error("Invalid selection.");
    process.exit(1);
  }

  return vms[idx];
}

async function run() {
  const hint = process.argv[2];
  const vm = await pickVM(hint);

  const label = vm.name ?? vm.serverName ?? vm.id;
  console.log(`\nConnecting to ${label} (${vm.ipv4}) ...\n`);

  // Decrypt the private key
  if (!SSH_KEY_SECRET) {
    console.error("ERROR: SSH_KEY_ENCRYPTION_SECRET is not set in your environment.");
    console.error("Make sure you are running: npx dotenv -e .env -- tsx scripts/ssh-vm.ts");
    process.exit(1);
  }

  let privateKey: string;
  try {
    if (!vm.sshPrivateKey) throw new Error("No SSH private key stored for this VM");
    privateKey = decryptPrivateKey(vm.sshPrivateKey, SSH_KEY_SECRET);
  } catch (err) {
    console.error("Failed to decrypt SSH key:", err instanceof Error ? err.message : err);
    console.error(
      "Make sure SSH_KEY_ENCRYPTION_SECRET in your .env matches the key used during VM creation.",
    );
    process.exit(1);
  }

  // Sanity check: must look like a PEM private key
  if (!privateKey.includes("-----BEGIN")) {
    console.error("Decryption produced invalid output — does not look like a PEM key.");
    console.error("First 60 chars:", privateKey.slice(0, 60));
    process.exit(1);
  }
  console.log("Key decrypted OK —", privateKey.split("\n")[0]);

  // Write to temp file
  const tmpKey = join(tmpdir(), `mc-vm-${vm.id}.pem`);
  writeFileSync(tmpKey, privateKey, { mode: 0o600, encoding: "utf8" });

  const cleanup = () => {
    try {
      unlinkSync(tmpKey);
    } catch {
      /* ignore */
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  // Spawn interactive SSH
  // IdentitiesOnly=yes: use ONLY our temp key, ignore SSH agent and ~/.ssh defaults
  const result = spawnSync(
    "ssh",
    [
      "-i",
      tmpKey,
      "-F",
      "/dev/null",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "LogLevel=ERROR",
      "-o",
      "IdentitiesOnly=yes",
      `root@${vm.ipv4}`,
    ],
    { stdio: "inherit" },
  );

  cleanup();
  process.exit(result.status ?? 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
