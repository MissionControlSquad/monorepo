/**
 * Sanitize user/agent-provided strings to prevent stored XSS.
 * Escapes HTML special characters so content renders as text, not markup.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validate and parse a childTasks payload from the approve route.
 * Accepts a JSON string or an already-parsed array.
 * Returns a validated array or throws with a descriptive message.
 */
export function parseChildTasks(
  raw: unknown,
): Array<{ title: string; description?: string; priority?: string; assigneeIds?: string[] }> {
  let parsed: unknown;

  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("childTasks is not valid JSON");
    }
  } else {
    parsed = raw;
  }

  if (!Array.isArray(parsed)) {
    throw new Error("childTasks must be an array");
  }

  return parsed.map((item, i) => {
    if (!item || typeof item !== "object") {
      throw new Error(`childTasks[${i}] must be an object`);
    }
    if (typeof item.title !== "string" || !item.title.trim()) {
      throw new Error(`childTasks[${i}].title is required`);
    }
    return {
      title: item.title.trim(),
      description:
        typeof item.description === "string" && item.description.trim()
          ? item.description.trim()
          : undefined,
      priority: typeof item.priority === "string" ? item.priority : undefined,
      assigneeIds: Array.isArray(item.assigneeIds)
        ? item.assigneeIds.filter((id: unknown) => typeof id === "string")
        : undefined,
    };
  });
}
