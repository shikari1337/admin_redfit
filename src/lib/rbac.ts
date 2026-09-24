/**
 * ERP RBAC — frontend mirror of backend/src/kernel/rbac/roles.ts.
 * The backend is authoritative (/auth/me returns effective_permissions +
 * workspaces); this mirror only paints UI while that response loads or for
 * legacy sessions that predate the fields.
 */

export type ErpRole =
  | 'admin' | 'staff' | 'accountant' | 'auditor' | 'store_manager' | 'warehouse_manager'
  | 'marketing_manager' | 'warehouse_worker' | 'dispatcher' | 'purchasing_officer'
  | 'pos_operator'
  // Growcord Warehouse (program 11, W2) — the shift lead.
  | 'warehouse_supervisor'
  // Growcord Ship — the courier shop / aggregator organisation's own staff.
  | 'ship_counter' | 'ship_ops' | 'ship_finance';

export const ROLE_LABELS: Record<ErpRole, string> = {
  admin: 'Administrator',
  staff: 'Staff',
  accountant: 'Accountant',
  auditor: 'Auditor (read-only)',
  store_manager: 'Store Manager',
  warehouse_manager: 'Warehouse Manager',
  warehouse_supervisor: 'Warehouse Supervisor (shift lead)',
  marketing_manager: 'Marketing Manager',
  warehouse_worker: 'Warehouse Worker (scanner)',
  dispatcher: 'Dispatcher (shipments)',
  purchasing_officer: 'Purchasing Officer',
  pos_operator: 'POS Operator (counter sales)',
  ship_counter: 'Ship Counter Clerk',
  ship_ops: 'Ship Operations',
  ship_finance: 'Ship Finance',
};

export const ASSIGNABLE_ROLES: ErpRole[] = [
  'staff', 'accountant', 'auditor', 'store_manager', 'warehouse_manager',
  'warehouse_supervisor', 'marketing_manager', 'warehouse_worker', 'dispatcher',
  'purchasing_officer', 'pos_operator',
  'ship_counter', 'ship_ops', 'ship_finance',
];

/**
 * MUST stay identical to backend/src/kernel/rbac/roles.ts ROLE_PERMISSIONS.
 * `read` is implied by every other action on the same area (see
 * withImpliedReads below), so it is only listed where a role gets read only.
 *
 * Growcord People (`hr.*`, `payroll.*`, migrations 146/147) is deliberately
 * absent from every role here, mirroring the backend: salary data is granted
 * per user from Settings → Staff, never inherited by a role. Only `admin`
 * (via `*`) has it by default.
 */
const ROLE_PERMISSIONS: Record<ErpRole, string[]> = {
  admin: ['*'],
  // Staff may export/import the Inventory tab (stock, MRP, selling/sale
  // price, flat B2B price) — 2026-08-17 owner decision. `inventory.adjust`
  // implies `inventory.read` (see withImpliedReads below).
  staff: ['orders.manage', 'products.read', 'customers.read', 'content.read',
          'inventory.adjust', 'shipments.read', 'returns.read'],
  accountant: ['accounting.post', 'gst.read', 'audit.read', 'orders.read',
               'customers.read', 'reports.read', 'billing.read',
               'purchasing.read', 'inventory.read', 'settings.read'],
  auditor: ['accounting.read', 'gst.read', 'audit.read', 'orders.read',
            'reports.read', 'inventory.read', 'purchasing.read', 'billing.read',
            'customers.read', 'products.read', 'settings.read',
            // Where the stock physically is, is audit evidence.
            'warehouse.read'],
  store_manager: ['orders.manage', 'orders.delete', 'orders.approve', 'shipments.manage',
                  'returns.manage', 'products.manage', 'products.delete',
                  'content.manage', 'content.delete',
                  'customers.manage', 'inventory.read',
                  'marketing.manage', 'marketing.send', 'marketing.delete',
                  'channels.manage', 'b2b.manage', 'b2b.delete',
                  'reports.read', 'purchasing.manage', 'settings.read',
                  'staff.read', 'billing.read',
                  // READ only, mirroring their existing `inventory.read`: a
                  // store manager must be able to see where stock is without
                  // being able to re-plan the racking or accept a variance.
                  'warehouse.read',
                  // Deliberate default (widen or narrow per store): running a
                  // partnership day to day is operational work, so `manage`
                  // (which implies `partner.read`) sits here — but `partner.grant`
                  // stays with `admin` alone, because issuing a scope exposes this
                  // organisation's data outward and arming auto-accept lets another
                  // company's documents write here with no human reading them.
                  'partner.manage'],
  warehouse_manager: ['inventory.adjust', 'inventory.manage', 'orders.read',
                      'shipments.manage', 'returns.manage', 'reports.read',
                      'purchasing.receive', 'products.read', 'settings.read',
                      // The floor, plus the two acts nobody below them may do:
                      // accept a counted variance, and destroy value.
                      'warehouse.operate', 'warehouse.manage',
                      'warehouse.count_approve', 'warehouse.dispose'],
  marketing_manager: ['marketing.manage', 'marketing.send', 'marketing.delete',
                      'ads.manage', 'customers.read', 'reports.read',
                      'content.manage', 'content.delete', 'channels.read',
                      'products.read'],
  // GATE WH6, taken 2026-09-24: the picker LOSES the blanket `inventory.adjust`
  // and gets `warehouse.operate` instead. The whole of a picker's day — putaway,
  // pick, move, count entry, pack — is `warehouse.operate`; writing stock off,
  // accepting a variance and editing prices are not, and used to be one and the
  // same permission. `/wms/*` accepts EITHER during the dual-accept window
  // (W2.5), so nothing on the floor breaks the day this ships.
  warehouse_worker: ['warehouse.operate', 'products.read'],
  // The shift lead: the floor, plus accepting a counted variance (gate WH7 —
  // the counter never accepts their own). Deliberately NOT `warehouse.dispose`:
  // deciding that stock is worthless is the manager's call. `orders.read`
  // because raising the day's picking wave reads the order book.
  warehouse_supervisor: ['warehouse.operate', 'warehouse.count_approve',
                         'orders.read', 'products.read', 'reports.read'],
  // "read + pack": `warehouse.read` to see the floor, and the pack/dispatch
  // routes they already reach through `shipments.manage`. Deliberately NOT
  // `warehouse.operate` — that would also hand them picking, counting and
  // moving stock, which is not a dispatcher's job.
  dispatcher: ['orders.read', 'shipments.manage', 'returns.read',
               'inventory.read', 'customers.read', 'warehouse.read'],
  purchasing_officer: ['purchasing.manage', 'purchasing.receive',
                       'inventory.read', 'products.read', 'accounting.read',
                       'reports.read'],
  pos_operator: ['orders.manage', 'products.read',
                 'customers.manage', 'inventory.read'],
  // Growcord Ship. `ship.*` is the OPERATOR running the courier business, not a
  // merchant booking its own parcels (that is `shipments.*`). Default-deny
  // everywhere else: a Ship employee who reaches a merchant panel reads nothing.
  // The counter clerk also needs the POS till, which is orders/customers.
  ship_counter: ['ship.book', 'orders.manage', 'customers.manage', 'products.read'],
  ship_ops: ['ship.ops', 'ship.book'],
  ship_finance: ['ship.finance', 'ship.read', 'billing.read', 'accounting.read', 'reports.read'],
};

// `run` (payroll.run) implies payroll.read — mirrors the backend's IMPLIES_READ.
// `grant` (partner.grant) likewise implies partner.read: you cannot sensibly
// hand a partner a scope without being able to see the partnership.
// Growcord Ship's verbs (book/ops/finance/admin) are acts on the `ship` area, so
// each implies ship.read — mirroring the backend's own IMPLIES_READ exactly.
const IMPLIES_READ = ['manage', 'delete', 'post', 'adjust', 'receive', 'send', 'approve', 'run', 'grant',
                      'book', 'ops', 'finance', 'admin',
                      // Growcord Warehouse. `operate` is a picker's whole day;
                      // without the implied read they could pick a line they
                      // cannot see. `count_approve`/`dispose` likewise.
                      'operate', 'count_approve', 'dispose'];

function withImpliedReads(perms: string[]): string[] {
  const out = new Set(perms);
  for (const p of perms) {
    const dot = p.lastIndexOf('.');
    if (dot < 0) continue;
    if (IMPLIES_READ.includes(p.slice(dot + 1))) out.add(p.slice(0, dot) + '.read');
  }
  return [...out];
}

export function effectivePermissionsFor(role?: string, extra: string[] = []): string[] {
  const matrix = ROLE_PERMISSIONS[(role ?? '') as ErpRole];
  if (!matrix) return withImpliedReads(extra);
  if (matrix[0] === '*') return ['*'];
  return withImpliedReads([...new Set([...matrix, ...extra])]);
}

export function hasPermIn(perms: string[], perm: string): boolean {
  return perms.includes('*') || perms.includes(perm);
}

/** The panels. Each is a separate shell: own base path, nav, home. */
export type WorkspaceKey = 'commerce' | 'orders' | 'inventory' | 'purchasing' | 'accounting' | 'marketing';

export const WORKSPACES: Record<WorkspaceKey, { title: string; home: string; blurb: string }> = {
  commerce: { title: 'E-commerce', home: '/dashboard', blurb: 'Catalog, storefront, settings' },
  orders: { title: 'Orders & Fulfilment', home: '/panel/orders', blurb: 'Orders, shipments, returns' },
  inventory: { title: 'Inventory', home: '/panel/inventory', blurb: 'Stock, warehouses, movements' },
  purchasing: { title: 'Purchasing', home: '/panel/purchasing', blurb: 'Vendors, POs, GRNs, bills' },
  accounting: { title: 'Accounting', home: '/panel/accounting', blurb: 'Books, journals, GST' },
  marketing: { title: 'Marketing', home: '/panel/marketing', blurb: 'Campaigns, audiences, ads, analytics' },
};

export const ROLE_WORKSPACES: Record<ErpRole, WorkspaceKey[]> = {
  admin: ['commerce', 'orders', 'inventory', 'purchasing', 'accounting', 'marketing'],
  staff: ['commerce', 'orders'],
  accountant: ['accounting'],
  auditor: ['accounting'],
  store_manager: ['orders', 'commerce', 'purchasing', 'marketing'],
  warehouse_manager: ['inventory', 'orders', 'purchasing'],
  warehouse_supervisor: ['inventory', 'orders'],
  marketing_manager: ['marketing', 'commerce'],
  warehouse_worker: ['inventory'],
  dispatcher: ['orders'],
  purchasing_officer: ['purchasing'],
  pos_operator: ['orders'],
  // Ship's people work in the Ship panel, not this admin. `orders`/`accounting`
  // is only where "Exit" lands them; there is no `ship` workspace here and
  // inventing one would be a shell with nothing in it.
  ship_counter: ['orders'],
  ship_ops: ['orders'],
  ship_finance: ['accounting'],
};

export function workspacesFor(role?: string): WorkspaceKey[] {
  return ROLE_WORKSPACES[(role ?? '') as ErpRole] ?? ['commerce'];
}

/**
 * Device-first roles land straight on their full-screen surface instead of a
 * dashboard: scanning and selling are the whole job — no sidebar detour.
 */
export const ROLE_SURFACE: Partial<Record<ErpRole, string>> = {
  warehouse_worker: '/scan',
  pos_operator: '/pos',
};

/** Which panel a pathname belongs to (drives the shell/nav rendered). */
export function workspaceFromPath(pathname: string): WorkspaceKey {
  if (pathname.startsWith('/panel/accounting')) return 'accounting';
  if (pathname.startsWith('/panel/inventory')) return 'inventory';
  if (pathname.startsWith('/panel/purchasing')) return 'purchasing';
  if (pathname.startsWith('/panel/orders')) return 'orders';
  if (pathname.startsWith('/panel/marketing')) return 'marketing';
  return 'commerce';
}
