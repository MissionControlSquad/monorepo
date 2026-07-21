import { describe, it, expect } from "vitest";
import {
  assertPublicRemoteHttpEndpoint,
  parseRemoteHttpEndpoint,
  guardError,
  type RemoteHttpEndpointLookup,
} from "@agentcenter/utils/remote-http-endpoint-guard";

const lookupTo =
  (address: string, family = 4): RemoteHttpEndpointLookup =>
  async () => [{ address, family }];

describe("remote HTTP endpoint guard (SSRF, parity #138)", () => {
  describe("parseRemoteHttpEndpoint", () => {
    it("rejects missing / empty / non-string URLs", () => {
      expect(() => parseRemoteHttpEndpoint("")).toThrow(/URL/);
      expect(() => parseRemoteHttpEndpoint(null)).toThrow(/URL/);
      expect(() => parseRemoteHttpEndpoint("   ")).toThrow(/URL/);
    });

    it("rejects non-http(s) schemes (file:, gopher:, data:)", () => {
      for (const u of ["file:///etc/passwd", "gopher://x", "data:text/plain,hi", "ftp://x/y"]) {
        expect(() => parseRemoteHttpEndpoint(u)).toThrow(/http or https/);
      }
    });

    it("accepts http and https", () => {
      expect(parseRemoteHttpEndpoint("https://example.com/x").protocol).toBe("https:");
      expect(parseRemoteHttpEndpoint("http://example.com/x").protocol).toBe("http:");
    });
  });

  describe("assertPublicRemoteHttpEndpoint", () => {
    it("blocks hostnames that resolve to private (RFC-1918) addresses", async () => {
      await expect(
        assertPublicRemoteHttpEndpoint(new URL("https://internal.example/x"), {
          lookup: lookupTo("10.0.0.12"),
        }),
      ).rejects.toMatchObject({ code: "remote_http_private_endpoint" });
    });

    it("blocks cloud metadata IP 169.254.169.254", async () => {
      await expect(
        assertPublicRemoteHttpEndpoint(new URL("http://169.254.169.254/latest/meta-data/")),
      ).rejects.toMatchObject({ code: "remote_http_private_endpoint" });
    });

    it("blocks localhost + *.localhost + loopback literals", async () => {
      for (const u of ["http://localhost/x", "http://api.localhost/x", "http://127.0.0.1/x"]) {
        await expect(assertPublicRemoteHttpEndpoint(new URL(u))).rejects.toMatchObject({
          code: "remote_http_private_endpoint",
        });
      }
    });

    it("blocks CGNAT (100.64/10) and link-local literals", async () => {
      for (const u of ["http://100.64.1.1/x", "http://169.254.1.1/x"]) {
        await expect(assertPublicRemoteHttpEndpoint(new URL(u))).rejects.toMatchObject({
          code: "remote_http_private_endpoint",
        });
      }
    });

    it.each([
      "http://[::1]/x",
      "http://[fd00::1]/x",
      "http://[fe80::1]/x",
      "http://[2001:20::1]/x",
      "http://[64:ff9b:1::1]/x",
      "http://[::ffff:10.0.0.1]/x",
    ])("blocks reserved IPv6 endpoint %s", async (url) => {
      await expect(assertPublicRemoteHttpEndpoint(new URL(url))).rejects.toMatchObject({
        code: "remote_http_private_endpoint",
      });
    });

    it("allows a hostname when every resolved address is public", async () => {
      await expect(
        assertPublicRemoteHttpEndpoint(new URL("https://public.example/x"), {
          lookup: lookupTo("93.184.216.34"),
        }),
      ).resolves.toBeUndefined();
    });

    it("allows a public IP literal", async () => {
      await expect(
        assertPublicRemoteHttpEndpoint(new URL("https://93.184.216.34/x")),
      ).resolves.toBeUndefined();
    });

    it("blocks when ANY resolved address is private (DNS with mixed answers)", async () => {
      const mixed: RemoteHttpEndpointLookup = async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.1.2.3", family: 4 },
      ];
      await expect(
        assertPublicRemoteHttpEndpoint(new URL("https://rebind.example/x"), { lookup: mixed }),
      ).rejects.toMatchObject({ code: "remote_http_private_endpoint" });
    });

    it("fails closed on DNS resolution error / empty answer", async () => {
      await expect(
        assertPublicRemoteHttpEndpoint(new URL("https://nope.example/x"), {
          lookup: async () => {
            throw new Error("ENOTFOUND");
          },
        }),
      ).rejects.toMatchObject({ code: "remote_http_dns_failed" });
      await expect(
        assertPublicRemoteHttpEndpoint(new URL("https://empty.example/x"), {
          lookup: async () => [],
        }),
      ).rejects.toMatchObject({ code: "remote_http_dns_failed" });
    });

    it("respects the allowPrivateNetwork bypass", async () => {
      await expect(
        assertPublicRemoteHttpEndpoint(new URL("http://10.0.0.1/x"), { allowPrivateNetwork: true }),
      ).resolves.toBeUndefined();
    });
  });

  it("guardError attaches a machine-readable code", () => {
    const e = guardError("nope", "remote_http_url_invalid");
    expect(e).toBeInstanceOf(Error);
    expect((e as Error & { code: string }).code).toBe("remote_http_url_invalid");
  });
});
