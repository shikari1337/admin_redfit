/**
 * Warehouse layout — the admin side of migration 212 (program 11).
 *
 * The API speaks millimetres and millilitres; people speak centimetres and
 * litres. The conversion happens HERE, once, and nowhere else on this screen
 * (COMMON_MISTAKES #226: one unit per layer, converted at the edge).
 */

export type NodeRole = 'area' | 'storage' | 'dock' | 'staging';

export interface Loc {
  id: string;
  warehouse_id: string;
  parent_id: string | null;
  kind: string;
  code: string;
  name: string | null;
  status: string;
  pickable: boolean;
  flags: Record<string, boolean> | null;
  max_units: number | null;
  /** Refill threshold (migration 035). Read by replenishment; settable since W1.4.2. */
  min_units?: number | null;
  max_weight_g: number | null;
  max_volume_ml: number | null;
  pick_sequence: number | null;
  current_units: number;
  sku_count: number;
  used_volume_ml: number;
  used_weight_g: number;
  unsized_units: number;
  descendant_bins: number;
  // migration 212 — absent on a database without it
  level_code?: string | null;
  node_role?: NodeRole | null;
  depth?: number | null;
  path_codes?: string | null;
  storage_type?: string | null;
  w_mm?: number | null;
  d_mm?: number | null;
  h_mm?: number | null;
  usable_pct?: number | null;
  volume_from_dims?: boolean | null;
  grid_row?: number | null;
  grid_col?: number | null;
  max_pallets?: number | null;
  reach_height_mm?: number | null;
  temperature_class?: string | null;
  unit_of_capacity?: string | null;
  /** Floor-plan position, in mm. NULL = not placed — never guessed (#226). */
  x_mm?: number | null;
  y_mm?: number | null;
  rotation_deg?: number | null;
  owner_party_id?: string | null;
}

export interface LevelDef { position: number; level_code: string; label: string; default_node_role: NodeRole }
export interface LevelTemplate { id: string; code: string; name: string; description: string | null; is_system: boolean; levels: LevelDef[] }
export interface StorageType { code: string; label: string; capacity: string; temperature: string; description: string }

export interface LayoutMeta {
  modelAvailable: boolean;
  template: LevelTemplate | null;
  templates: LevelTemplate[];
  storageTypes: StorageType[];
  storageLevel?: LevelDef | null;
  reason?: string;
}

/** The classic five, used when the database does not have migration 212 yet. */
export const CLASSIC_TEMPLATE: LevelTemplate = {
  id: 'classic', code: 'classic', name: 'Classic (zone › aisle › rack › shelf › bin)', description: null, is_system: true,
  levels: [
    { position: 0, level_code: 'zone', label: 'Zone', default_node_role: 'area' },
    { position: 1, level_code: 'aisle', label: 'Aisle', default_node_role: 'area' },
    { position: 2, level_code: 'rack', label: 'Rack', default_node_role: 'area' },
    { position: 3, level_code: 'shelf', label: 'Shelf', default_node_role: 'area' },
    { position: 4, level_code: 'bin', label: 'Bin', default_node_role: 'storage' },
  ],
};

export const num = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));
export const levelOf = (l: Loc): string => l.level_code ?? l.kind;
export const isStorage = (l: Loc): boolean => (l.node_role ? l.node_role === 'storage' : l.kind === 'bin');

// ── units ────────────────────────────────────────────────────────────────────
export const cmToMm = (cm: string | number | null | undefined): number | null => {
  if (cm == null || String(cm).trim() === '') return null;
  const n = Number(cm);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) : null;
};
export const mmToCm = (mm: number | null | undefined): string => (mm == null ? '' : String(Math.round(Number(mm)) / 10));
export const litres = (ml: number | null | undefined, digits = 1): string =>
  ml == null ? '—' : `${(Number(ml) / 1000).toLocaleString('en-IN', { maximumFractionDigits: digits })} L`;
export const kg = (g: number | null | undefined): string =>
  g == null ? '—' : `${(Number(g) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`;

/** Inside w × d × h (cm) × usable % → litres. The same rule the server applies. */
export function volumeFromCm(w: string, d: string, h: string, usablePct: string | number = 100): number | null {
  const W = Number(w), D = Number(d), H = Number(h);
  if (!(W > 0 && D > 0 && H > 0)) return null;
  const pct = Math.min(100, Math.max(1, Number(usablePct) || 100));
  return Math.round(W * D * H * (pct / 100)); // cm³ = ml
}

export const sizeLabel = (l: Pick<Loc, 'w_mm' | 'd_mm' | 'h_mm'>): string | null =>
  l.w_mm && l.d_mm && l.h_mm ? `${mmToCm(l.w_mm)} × ${mmToCm(l.d_mm)} × ${mmToCm(l.h_mm)} cm` : null;

// ── fill ─────────────────────────────────────────────────────────────────────
/** How full a slot is, 0–1, by the tightest limit it has. Null = no limit to measure against. */
export function fillRatio(l: Loc): number | null {
  const ratios: number[] = [];
  if (l.max_units != null) ratios.push(num(l.current_units) / Math.max(1, num(l.max_units)));
  if (l.max_volume_ml != null) ratios.push(num(l.used_volume_ml) / Math.max(1, num(l.max_volume_ml)));
  if (l.max_weight_g != null) ratios.push(num(l.used_weight_g) / Math.max(1, num(l.max_weight_g)));
  return ratios.length ? Math.max(...ratios) : null;
}

export type FillTone = 'blocked' | 'empty' | 'open' | 'low' | 'mid' | 'high';
export function fillTone(l: Loc): FillTone {
  if (l.status !== 'active') return 'blocked';
  if (num(l.current_units) === 0) return 'empty';
  const r = fillRatio(l);
  if (r == null) return 'open';
  return r >= 0.9 ? 'high' : r >= 0.6 ? 'mid' : 'low';
}

// ── tree ─────────────────────────────────────────────────────────────────────
export function indexTree(locs: Loc[]) {
  const byId = new Map(locs.map((l) => [l.id, l]));
  const kids = new Map<string | null, Loc[]>();
  for (const l of locs) {
    const k = l.parent_id && byId.has(l.parent_id) ? l.parent_id : null;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k)!.push(l);
  }
  const bySeq = (a: Loc, b: Loc) =>
    (num(a.grid_row) - num(b.grid_row)) || (num(a.grid_col) - num(b.grid_col)) ||
    a.code.localeCompare(b.code, 'en', { numeric: true });
  for (const list of kids.values()) list.sort(bySeq);
  const pathOf = (l: Loc): Loc[] => {
    const out: Loc[] = []; let cur: Loc | undefined = l;
    while (cur) { out.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    return out;
  };
  const descendants = (id: string | null): Loc[] => {
    const out: Loc[] = []; const stack = [...(kids.get(id) ?? [])];
    while (stack.length) { const n = stack.pop()!; out.push(n); stack.push(...(kids.get(n.id) ?? [])); }
    return out;
  };
  return { byId, kids, pathOf, descendants };
}

/**
 * A RACK, for drawing: an area whose storage slots can be laid out as a grid.
 * Built by the rack builder it is rack → rows → slots (row/column recorded);
 * a hand-built or classic tree is shelf → bins, drawn as ONE row in order.
 * Returns the slots with the (row, col) they are drawn at.
 */
export interface RackView { rack: Loc; rows: number; cols: number; cells: Array<{ slot: Loc; row: number; col: number }> }

export function asRack(node: Loc, kids: Map<string | null, Loc[]>): RackView | null {
  if (isStorage(node)) return null;
  const direct = kids.get(node.id) ?? [];
  const directSlots = direct.filter(isStorage);
  let slots: Array<{ slot: Loc; row: number; col: number }> = [];
  if (directSlots.length) {
    const positioned = directSlots.every((s) => s.grid_col != null);
    slots = directSlots.map((s, i) => ({ slot: s, row: positioned ? num(s.grid_row) || 1 : 1, col: positioned ? num(s.grid_col) : i + 1 }));
  } else {
    // rack → rows → slots: every child is an area and each holds slots
    const rowsWithSlots = direct.filter((r) => !isStorage(r) && (kids.get(r.id) ?? []).some(isStorage));
    if (!rowsWithSlots.length || rowsWithSlots.length !== direct.length) return null;
    rowsWithSlots.forEach((r, ri) => {
      const rowNo = num(r.grid_row) || ri + 1;
      (kids.get(r.id) ?? []).filter(isStorage).forEach((s, ci) => {
        slots.push({ slot: s, row: num(s.grid_row) || rowNo, col: num(s.grid_col) || ci + 1 });
      });
    });
  }
  if (!slots.length) return null;
  return {
    rack: node,
    rows: Math.max(...slots.map((c) => c.row)),
    cols: Math.max(...slots.map((c) => c.col)),
    cells: slots,
  };
}

/**
 * The rack a node belongs to, for drawing: walk UP while the parent is itself
 * drawable as a rack. A rack built with rows is rack → rows → slots, and each
 * row on its own also looks like a one-row rack — without this, selecting a
 * slot re-centred on its shelf row, and the rack was drawn twice (once whole,
 * once per row). Null when the node is not inside any rack.
 */
export function rackRoot(node: Loc, tree: ReturnType<typeof indexTree>): Loc | null {
  let found: Loc | null = asRack(node, tree.kids) ? node : null;
  let cur: Loc = node;
  while (cur.parent_id) {
    const p = tree.byId.get(cur.parent_id);
    if (!p || !asRack(p, tree.kids)) break;
    found = p; cur = p;
  }
  return found;
}

/** Every rack under (and including) a node, grouped by what they stand in. */
export function racksUnder(root: Loc | null, locs: Loc[], tree: ReturnType<typeof indexTree>) {
  const scope = root ? [root, ...tree.descendants(root.id)] : locs;
  const racks: RackView[] = [];
  for (const n of scope) {
    const r = asRack(n, tree.kids);
    if (!r) continue;
    // A row of a rack is part of its rack, never a rack of its own.
    const parent = n.parent_id ? tree.byId.get(n.parent_id) : undefined;
    if (parent && asRack(parent, tree.kids)) continue;
    racks.push(r);
  }
  const groups = new Map<string, { parent: Loc | null; racks: RackView[] }>();
  for (const r of racks) {
    const key = r.rack.parent_id ?? '__top';
    if (!groups.has(key)) groups.set(key, { parent: r.rack.parent_id ? tree.byId.get(r.rack.parent_id) ?? null : null, racks: [] });
    groups.get(key)!.racks.push(r);
  }
  return [...groups.values()];
}

export const levelLabel = (t: LevelTemplate | null, code: string): string =>
  t?.levels.find((l) => l.level_code === code)?.label ?? code.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Levels a new node may take under `parent` (strictly deeper in the structure). */
export function childLevels(t: LevelTemplate, parent: Loc | null): LevelDef[] {
  if (!parent) return t.levels;
  const pos = t.levels.find((l) => l.level_code === levelOf(parent))?.position ?? -1;
  return t.levels.filter((l) => l.position > pos);
}

/** Rack code pattern → a code, mirroring the server's rackSlotCode exactly. */
export function slotCode(pattern: string, rack: string, row: number, col: number, colPad = 2): string {
  const letter = (n: number) => { let s = ''; let x = n; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); } return s; };
  return (pattern || '{rack}-{row}-{col}')
    .replace(/\{rack\}/g, rack).replace(/\{ROW\}/g, letter(row)).replace(/\{row\}/g, String(row))
    .replace(/\{col\}/g, String(col).padStart(Math.min(4, Math.max(1, colPad)), '0')).trim();
}

export const apiError = (e: any): string =>
  e?.response?.data?.message ?? e?.response?.data?.error?.message ?? e?.message ?? 'Something went wrong';
