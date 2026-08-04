/**
 * Org-chart SVG renderer (Domain 14 #16) — pure, shared via @agentcenter/utils. Renders the tidy
 * layout from computeOrgLayout into a standalone, shareable/embeddable SVG string (used by a
 * GraphQL/REST endpoint and by the company-export README's diagram). No DOM/network; XML-escapes all
 * text so agent names can't break the markup.
 */
import { computeOrgLayout, type OrgLayoutInput, type OrgLayoutOptions } from "./org-layout";

export interface OrgSvgNode extends OrgLayoutInput {
  name: string;
  role?: string | null;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export interface OrgSvgOptions extends OrgLayoutOptions {
  padding?: number;
  /** Include a theme-neutral inline stylesheet. Default true. */
  styled?: boolean;
}

/**
 * Pure: render agents (with reportsTo edges) to an SVG document string. Empty input yields a minimal
 * empty SVG. Deterministic (no timestamps/randomness), so identical input → identical output.
 */
export function renderOrgChartSvg(nodes: OrgSvgNode[], opts: OrgSvgOptions = {}): string {
  const pad = opts.padding ?? 24;
  const layout = computeOrgLayout(nodes, opts);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const w = Math.max(layout.width + pad * 2, 120);
  const h = Math.max(layout.height + pad * 2, 80);

  const edges = layout.edges
    .map((e) => {
      const from = layout.nodes[e.from];
      const to = layout.nodes[e.to];
      if (!from || !to) return "";
      const x1 = from.x + layout.nodeWidth / 2 + pad;
      const y1 = from.y + layout.nodeHeight + pad;
      const x2 = to.x + layout.nodeWidth / 2 + pad;
      const y2 = to.y + pad;
      const midY = (y1 + y2) / 2;
      // orthogonal elbow connector
      return `<path class="edge" d="M ${x1} ${y1} V ${midY} H ${x2} V ${y2}" fill="none" />`;
    })
    .join("");

  const cards = Object.values(layout.nodes)
    .map((ln) => {
      const node = byId.get(ln.id);
      if (!node) return "";
      const x = ln.x + pad;
      const y = ln.y + pad;
      const name = esc(truncate(node.name, 24));
      const role = node.role ? esc(truncate(node.role, 26)) : "";
      return (
        `<g class="node" transform="translate(${x} ${y})">` +
        `<rect class="card" width="${layout.nodeWidth}" height="${layout.nodeHeight}" rx="8" />` +
        `<text class="name" x="${layout.nodeWidth / 2}" y="26" text-anchor="middle">${name}</text>` +
        (role
          ? `<text class="role" x="${layout.nodeWidth / 2}" y="46" text-anchor="middle">${role}</text>`
          : "") +
        `</g>`
      );
    })
    .join("");

  const style =
    opts.styled === false
      ? ""
      : `<style>
    .edge{stroke:#94a3b8;stroke-width:1.5}
    .card{fill:#ffffff;stroke:#cbd5e1;stroke-width:1}
    .name{font:600 13px system-ui,sans-serif;fill:#0f172a}
    .role{font:400 11px system-ui,sans-serif;fill:#64748b}
    @media (prefers-color-scheme:dark){.card{fill:#1e293b;stroke:#334155}.name{fill:#f1f5f9}.role{fill:#94a3b8}.edge{stroke:#475569}}
  </style>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Org chart">` +
    style +
    edges +
    cards +
    `</svg>`
  );
}
