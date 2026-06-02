import type { Node, Edge } from "@xyflow/react";

const NODE_W = 200;
const GAP_X = 60;
const GAP_Y = 180;

export function layoutTopDown(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    const list = children.get(e.source) || [];
    list.push(e.target);
    children.set(e.source, list);
    hasParent.add(e.target);
  }

  const roots = nodes.filter((n) => !hasParent.has(n.id)).map((n) => n.id);
  if (roots.length === 0) roots.push(nodes[0].id);

  const level = new Map<string, number>();
  const queue = [...roots];
  for (const r of roots) level.set(r, 0);
  while (queue.length) {
    const id = queue.shift()!;
    const lvl = level.get(id)!;
    for (const child of children.get(id) || []) {
      const existing = level.get(child) ?? -1;
      if (lvl + 1 > existing) level.set(child, lvl + 1);
      queue.push(child);
    }
  }
  for (const n of nodes) if (!level.has(n.id)) level.set(n.id, 0);

  const levels = new Map<number, string[]>();
  for (const [id, lvl] of level) {
    const list = levels.get(lvl) || [];
    list.push(id);
    levels.set(lvl, list);
  }

  const maxLevel = Math.max(...levels.keys());
  const positioned = new Map<string, { x: number; y: number }>();

  let maxLevelWidth = 0;
  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const ids = levels.get(lvl) || [];
    const w = ids.length * NODE_W + (ids.length - 1) * GAP_X;
    if (w > maxLevelWidth) maxLevelWidth = w;
  }
  const centerX = maxLevelWidth / 2;

  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const ids = levels.get(lvl) || [];
    const totalW = ids.length * NODE_W + (ids.length - 1) * GAP_X;
    const startX = centerX - totalW / 2;
    ids.forEach((id, i) => {
      positioned.set(id, { x: startX + i * (NODE_W + GAP_X), y: 40 + lvl * GAP_Y });
    });
  }

  return nodes.map((n) => ({
    ...n,
    position: positioned.get(n.id) || n.position,
  }));
}
