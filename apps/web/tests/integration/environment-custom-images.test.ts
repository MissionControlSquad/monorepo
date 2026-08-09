import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { createEnvironment } from "../../src/server/services/environments";
import {
  captureCustomImage,
  rollbackToTemplate,
  disableTemplate,
  resolveActiveImageRef,
  getActiveTemplate,
  classifyActiveTemplateDrift,
} from "../../src/server/services/environment-custom-images";

const WS = "ws_cimg";

beforeAll(() => {
  process.env.SYSTEM_SECRET = "cimg-secret";
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE environment_custom_image_templates, environments CASCADE`,
  );
  invalidateFlagCache();
});

async function sandboxEnv(name: string, extraConfig: Record<string, unknown> = {}) {
  return createEnvironment(WS, {
    name,
    driver: "sandbox",
    config: { provider: "local", ...extraConfig },
  });
}

describe("custom image capture", () => {
  it("captures an active image; a second capture supersedes the first", async () => {
    const env = await sandboxEnv("Img");
    const t1 = await captureCustomImage(WS, env.id);
    expect(t1.status).toBe("active");
    expect(t1.templateRef).toMatch(/^local-image:/);

    const active1 = await getActiveTemplate(env.id, "local");
    expect(active1?.id).toBe(t1.id);

    const t2 = await captureCustomImage(WS, env.id);
    expect(t2.status).toBe("active");
    // the first is now superseded, pointing at the second
    const t1After = await prisma.environmentCustomImageTemplate.findUnique({
      where: { id: t1.id },
    });
    expect(t1After?.status).toBe("superseded");
    expect(t1After?.supersededByTemplateId).toBe(t2.id);
    // exactly one active
    expect(
      await prisma.environmentCustomImageTemplate.count({
        where: { environmentId: env.id, status: "active" },
      }),
    ).toBe(1);
  });

  it("resolveActiveImageRef returns the active template's ref", async () => {
    const env = await sandboxEnv("Img2");
    const t = await captureCustomImage(WS, env.id);
    expect(await resolveActiveImageRef(env.id, "local")).toBe(t.templateRef);
  });

  it("rollback reactivates an older template (superseding the current)", async () => {
    const env = await sandboxEnv("Img3");
    const t1 = await captureCustomImage(WS, env.id);
    const t2 = await captureCustomImage(WS, env.id);
    const rolled = await rollbackToTemplate(WS, t1.id);
    expect(rolled.status).toBe("active");
    expect(await resolveActiveImageRef(env.id, "local")).toBe(t1.templateRef);
    const t2After = await prisma.environmentCustomImageTemplate.findUnique({
      where: { id: t2.id },
    });
    expect(t2After?.status).toBe("superseded");
  });

  it("disable frees the active slot", async () => {
    const env = await sandboxEnv("Img4");
    const t = await captureCustomImage(WS, env.id);
    expect(await disableTemplate(WS, t.id)).toBe(true);
    expect(await getActiveTemplate(env.id, "local")).toBeNull();
    expect(await resolveActiveImageRef(env.id, "local")).toBeNull();
  });

  it("classifies config drift from the capture config (none/breaking)", async () => {
    const env = await sandboxEnv("Img5", { image: "base" });
    await captureCustomImage(WS, env.id);
    expect((await classifyActiveTemplateDrift(WS, env.id)).change).toBe("none");

    // Change a structural field → breaking.
    await prisma.environment.update({
      where: { id: env.id },
      data: { config: { provider: "local", image: "v2" } },
    });
    expect((await classifyActiveTemplateDrift(WS, env.id)).change).toBe("breaking");
  });

  it("rejects capture for a non-sandbox environment", async () => {
    const env = await createEnvironment(WS, { name: "Loc", driver: "local" });
    await expect(captureCustomImage(WS, env.id)).rejects.toThrow(/only supported for sandbox/i);
  });
});
