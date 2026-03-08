/**
 * Centralised path and user constants for Cloud VM provisioning.
 *
 * Every file that touches the remote VM file-system should import from here
 * so a rename or restructure is a single-line change.
 */

/** Dedicated non-root user that runs OpenClaw on every VM. */
export const VM_USER = "agentcenter";

export const VM_HOME = `/home/${VM_USER}`;
export const VM_CONFIG_DIR = `${VM_HOME}/.openclaw`;
export const VM_CONFIG_PATH = `${VM_CONFIG_DIR}/openclaw.json`;
export const VM_WORKSPACE = `${VM_HOME}/workspace`;

/**
 * Prefix for running openclaw CLI commands over SSH.
 * SSH connects as root, but openclaw config lives under VM_USER's home.
 * Without this, the CLI looks in /root/.openclaw/ and finds no token.
 */
export const OPENCLAW_CMD_PREFIX = `HOME=${VM_HOME}`;
