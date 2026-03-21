import { readFileSync } from "fs";
import { join } from "path";
import { successResponse, errorResponse } from "../../../../_lib/json-response";
import { TEMPLATES } from "@/lib/agent-wizard-templates";

const SKILLS_DIR = join(process.cwd(), "src", "server", "agent-templates", "skills");

/**
 * GET /api/agents/templates/[templateId]/skills
 * Returns the markdown skill guide with template variables interpolated.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;

  try {
    const filePath = join(SKILLS_DIR, `${templateId}.md`);
    let content = readFileSync(filePath, "utf-8");

    // Interpolate template variables from the matching wizard template
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      content = content
        .replace(/\{\{agent\.name\}\}/g, template.name)
        .replace(/\{\{agent\.role\}\}/g, template.role)
        .replace(/\{\{capabilities\}\}/g, template.capabilities.map((c) => `- ${c}`).join("\n"));
    }

    return successResponse({ content });
  } catch {
    return errorResponse("Skill guide not found", 404);
  }
}
