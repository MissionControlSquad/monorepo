import { describe, it, expect } from "vitest";
import { successResponse, errorResponse, handleError } from "../../app/api/_lib/json-response";

describe("successResponse", () => {
  it("returns 200 by default with JSON body", async () => {
    const res = successResponse({ ok: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("supports custom status codes", async () => {
    const res = successResponse({ id: "abc" }, 201);
    expect(res.status).toBe(201);
  });

  it("sets content-type to application/json", () => {
    const res = successResponse({});
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("errorResponse", () => {
  it("returns 500 by default", async () => {
    const res = errorResponse("something broke");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "something broke" });
  });

  it("supports custom status codes", async () => {
    const res = errorResponse("not found", 404);
    expect(res.status).toBe(404);
  });
});

describe("handleError", () => {
  it("handles structured { error, status } thrown by resolveAgent", async () => {
    const res = handleError({ error: "Invalid API key", status: 401 });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid API key" });
  });

  it("returns generic 500 for Error instances (does not leak message)", async () => {
    const res = handleError(new Error("Prisma connection failed on shard 3"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Internal server error" });
  });

  it("returns generic 500 for unknown error types", async () => {
    const res = handleError("string error");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Internal server error" });
  });

  it("returns generic 500 for null/undefined", async () => {
    const res = handleError(null);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Internal server error" });
  });
});
