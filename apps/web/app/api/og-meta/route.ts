import { NextResponse } from "next/server";

/**
 * Block private/internal IP ranges to prevent SSRF attacks.
 */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname;

    // Block common internal hostnames
    if (
      hostname === "localhost" ||
      hostname === "[::1]" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return true;
    }

    // Block private IPv4 ranges
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (
        a === 10 || // 10.0.0.0/8
        a === 127 || // 127.0.0.0/8
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
        (a === 192 && b === 168) || // 192.168.0.0/16
        (a === 169 && b === 254) || // 169.254.0.0/16 (AWS metadata)
        a === 0 // 0.0.0.0/8
      ) {
        return true;
      }
    }

    // Block non-http(s) schemes
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * GET /api/og-meta?url=<encoded-url>
 * Fetches Open Graph metadata for a given URL.
 * Returns: { title, description, image, siteName, url }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  try {
    new URL(url); // validate
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (isPrivateUrl(url)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "bot (AgentCenter link preview)",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok || !res.headers.get("content-type")?.includes("text/html")) {
      return NextResponse.json({ error: "Not an HTML page" }, { status: 422 });
    }

    // Only read first 50KB to extract meta tags
    const reader = res.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "No body" }, { status: 422 });
    }

    let html = "";
    const decoder = new TextDecoder();
    let bytesRead = 0;
    const maxBytes = 50_000;

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      bytesRead += value.byteLength;
    }
    reader.cancel();

    const meta = extractOgMeta(html, url);

    if (!meta.title && !meta.description && !meta.image) {
      return NextResponse.json({ error: "No metadata found" }, { status: 422 });
    }

    return NextResponse.json(meta, {
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.name === "AbortError" ? "Timeout" : "Failed to fetch" },
      { status: 502 },
    );
  }
}

function extractOgMeta(html: string, originalUrl: string) {
  const get = (property: string): string | null => {
    // Match <meta property="og:..." content="..."> or <meta name="..." content="...">
    const regex = new RegExp(
      `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
      "i",
    );
    const match = html.match(regex);
    if (match) return match[1];

    // Also try content before property (some sites reverse attribute order)
    const regex2 = new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
      "i",
    );
    const match2 = html.match(regex2);
    return match2 ? match2[1] : null;
  };

  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);

  return {
    title: get("og:title") || get("twitter:title") || titleTag?.[1]?.trim() || null,
    description: get("og:description") || get("twitter:description") || get("description") || null,
    image: get("og:image") || get("twitter:image") || null,
    siteName: get("og:site_name") || null,
    url: get("og:url") || originalUrl,
  };
}
