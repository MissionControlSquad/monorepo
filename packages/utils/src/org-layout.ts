/**
 * Org-chart tree layout (Epic #19) — shared pure geometry for the graphical org canvas. Import from
 * @agentcenter/utils. Given agents with a reportsTo edge, computes a tidy top-down forest layout
 * (node positions + connector edges + canvas size). Deterministic; cycles and dangling managers are
 * broken by promoting the offending node to a root so layout always terminates. No I/O.
 */

export interface OrgLayoutInput {
  id: string;
  reportsToAgentId: string | null;
}

export interface OrgLayoutNode {
  id: string;
  x: number; // top-left, px
  y: number;
  depth: number;
}

export interface OrgLayoutEdge {
  from: string; // parent id
  to: string; // child id
}

export interface OrgLayout {
  nodes: Record<string, OrgLayoutNode>;
  edges: OrgLayoutEdge[];
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
}

export interface OrgLayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  hGap?: number;
  vGap?: number;
}

/** Pure: tidy top-down forest layout. Roots are laid out left-to-right; each parent centers over its
 * children. Handles empty input, dangling/self managers, and cycles. */
export function computeOrgLayout(agents: OrgLayoutInput[], opts: OrgLayoutOptions = {}): OrgLayout {
  const nodeWidth = opts.nodeWidth ?? 190;
  const nodeHeight = opts.nodeHeight ?? 64;
  const hGap = opts.hGap ?? 28;
  const vGap = opts.vGap ?? 56;
  const colW = nodeWidth + hGap;
  const rowH = nodeHeight + vGap;

  const ids = new Set(agents.map((a) => a.id));
  // Effective parent: a real, in-set, non-self manager; otherwise this node is a root.
  const parentOf = new Map<string, string | null>();
  const children = new Map<string, string[]>();
  for (const a of agents) {
    const p =
      a.reportsToAgentId && a.reportsToAgentId !== a.id && ids.has(a.reportsToAgentId)
        ? a.reportsToAgentId
        : null;
    parentOf.set(a.id, p);
  }
  for (const a of agents) {
    const p = parentOf.get(a.id) ?? null;
    if (p) children.set(p, [...(children.get(p) ?? []), a.id]);
  }

  const nodes: Record<string, OrgLayoutNode> = {};
  const edges: OrgLayoutEdge[] = [];
  const positioned = new Set<string>();
  let nextLeafCol = 0;
  let maxDepth = 0;

  // Returns the node's column (x in colW units) so a parent can center over its children.
  function place(id: string, depth: number): number {
    positioned.add(id);
    maxDepth = Math.max(maxDepth, depth);
    const kids = (children.get(id) ?? []).filter((k) => !positioned.has(k));
    let col: number;
    if (kids.length === 0) {
      col = nextLeafCol++;
    } else {
      const cols = kids.map((k) => place(k, depth + 1));
      col = (cols[0] + cols[cols.length - 1]) / 2;
      for (const k of kids) edges.push({ from: id, to: k });
    }
    nodes[id] = { id, x: col * colW, y: depth * rowH, depth };
    return col;
  }

  // Roots first (stable order = input order), then any remaining nodes (cycles) as roots.
  for (const a of agents) if (parentOf.get(a.id) === null && !positioned.has(a.id)) place(a.id, 0);
  for (const a of agents) if (!positioned.has(a.id)) place(a.id, 0);

  const maxX = Object.values(nodes).reduce((m, n) => Math.max(m, n.x), 0);
  return {
    nodes,
    edges,
    width: agents.length ? maxX + nodeWidth : 0,
    height: agents.length ? (maxDepth + 1) * rowH - vGap : 0,
    nodeWidth,
    nodeHeight,
  };
}
