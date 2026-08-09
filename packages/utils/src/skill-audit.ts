/**
 * Skill security audit (Domain 5 GAP-D) — pure, shared via @agentcenter/utils. Statically scans a
 * skill bundle (entry markdown + files) for risky content: hardcoded secrets, dangerous shell/exec
 * patterns, path traversal, and raw network fetches. Returns a verdict (pass | warning | fail) with
 * coded findings. A `fail` (hard-stop) blocks update/reset; `warning` is advisory. No execution, no I/O.
 */

export type SkillAuditSeverity = "info" | "warning" | "critical";
export type SkillAuditVerdict = "pass" | "warning" | "fail";

export interface SkillAuditFinding {
  code: string;
  severity: SkillAuditSeverity;
  message: string;
  path: string | null; // null = entry markdown / whole bundle
}

export interface SkillAuditResult {
  verdict: SkillAuditVerdict;
  findings: SkillAuditFinding[];
}

interface Rule {
  code: string;
  severity: SkillAuditSeverity;
  message: string;
  re: RegExp;
  /** Only scan files whose path matches (default: all + entry). */
  scriptsOnly?: boolean;
}

const RULES: Rule[] = [
  {
    code: "hardcoded_aws_key",
    severity: "critical",
    message: "Looks like a hardcoded AWS access key id.",
    re: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    code: "hardcoded_token",
    severity: "critical",
    message: "Looks like a hardcoded secret/token (ghp_/sk-/xox…).",
    re: /\b(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/,
  },
  {
    code: "curl_pipe_shell",
    severity: "critical",
    message: "Pipes a remote download straight into a shell (curl|bash).",
    re: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b/,
  },
  {
    code: "destructive_rm",
    severity: "warning",
    message: "Destructive recursive delete (rm -rf).",
    re: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/,
  },
  {
    code: "eval_exec",
    severity: "warning",
    message: "Dynamic code execution (eval / exec).",
    re: /\b(eval|exec)\s*\(/,
  },
  {
    code: "path_traversal",
    severity: "warning",
    message: "Path traversal outside the bundle (../).",
    re: /\.\.\//,
  },
];

const SEVERITY_RANK: Record<SkillAuditSeverity, number> = { info: 0, warning: 1, critical: 2 };

/** Pure: audit a skill bundle. `fail` when any critical finding; `warning` when only warnings. */
export function auditSkill(input: {
  markdown: string;
  files: { path: string; content: string }[];
}): SkillAuditResult {
  const findings: SkillAuditFinding[] = [];
  const scan = (text: string, path: string | null) => {
    for (const rule of RULES) {
      if (rule.re.test(text)) {
        findings.push({ code: rule.code, severity: rule.severity, message: rule.message, path });
      }
    }
  };

  scan(input.markdown ?? "", null);
  for (const f of input.files) scan(f.content ?? "", f.path);

  let worst = 0;
  for (const f of findings) worst = Math.max(worst, SEVERITY_RANK[f.severity]);
  const verdict: SkillAuditVerdict = worst >= 2 ? "fail" : worst === 1 ? "warning" : "pass";
  return { verdict, findings };
}

/** Pure: a hard-stop (fail) blocks skill update/reset. */
export function auditHardStops(result: SkillAuditResult): boolean {
  return result.verdict === "fail";
}
