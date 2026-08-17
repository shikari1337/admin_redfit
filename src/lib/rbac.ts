/**
 * ERP RBAC — frontend mirror of backend/src/kernel/rbac/roles.ts.
 * The backend is authoritative (/auth/me returns effective_permissions +
 * workspaces); this mirror only paints UI while that response loads or for
 * legacy sessions that predate the fields.
 */

export type ErpRole =
  | 'admin' | 'staff' | 'accountant' | 'auditor' | 'store_manager' | 'warehouse_manager'
  | 'marketing_manager' | 'warehouse_worker' | 'dispatcher' | 'purchasing_officer'
  | 'pos_operator';

export const ROLE_LABELS: Record<ErpRole, string> = {
  admin: 'Administrator',
  staff: 'Staff',
  accountant: 'Accountant',
  auditor: 'Auditor (read-only)',
  store_manager: 'Store Manager',
  warehouse_manager: 'Warehouse Manager',
  marketing_manager: 'Marketing Manager',
  warehouse_worker: 'Warehouse Worker (scanner)',
  dispatcher: 'Dispatcher (shipments)',
  purchasing_officer: 'Purchasing Officer',
  pos_operator: 'POS Operator (counter sales)',
};

export const ASSIGNABLE_ROLES: ErpRole[] = [
  'staff', 'accountant', 'auditor', 'store_manager', 'warehouse_manager',
  'marketing_manager', 'warehouse_worker', 'dispatcher', 'purchasing_officer',
  'pos_operator',
];

/**
 * MUST stay identical to backend/src/kernel/rbac/roles.ts ROLE_PERMISSIONS.
 * `read` is implied by every other action on the same area (see
 * withImpliedReads below), so it is only listed where a role gets read only.
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
            'customers.read', 'products.read', 'settings.read'],
  store_manager: ['orders.manage', 'orders.delete', 'shipments.manage',
                  'returns.manage', 'products.manage', 'products.delete',
                  'content.manage', 'content.delete',
                  'customers.manage', 'inventory.read',
                  'marketing.manage', 'marketing.send', 'marketing.delete',
                  'channels.manage', 'b2b.manage', 'b2b.delete',
                  'reports.read', 'purchasing.manage', 'settings.read',
                  'staff.read', 'billing.read'],
  warehouse_manager: ['inventory.adjust', 'inventory.manage', 'orders.read',
                      'shipments.manage', 'returns.manage', 'reports.read',
                      'purchasing.receive', 'products.read', 'settings.read'],
  marketing_manager: ['marketing.manage', 'marketing.send', 'marketing.delete',
                      'ads.manage', 'customers.read', 'reports.read',
                      'content.manage', 'content.delete', 'channels.read',
                      'products.read'],
  warehouse_worker: ['inventory.adjust', 'products.read'],
  dispatcher: ['orders.read', 'shipments.manage', 'returns.read',
               'inventory.read', 'customers.read'],
  purchasing_officer: ['purchasing.manage', 'purchasing.receive',
                       'inventory.read', 'products.read', 'accounting.read',
                       'reports.read'],
  pos_operator: ['orders.manage', 'products.read',
                 'customers.manage', 'inventory.read'],
};

const IMPLIES_READ = ['manage', 'delete', 'post', 'adjust', 'receive', 'send', 'approve'];

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
  marketing_manager: ['marketing', 'commerce'],
  warehouse_worker: ['inventory'],
  dispatcher: ['orders'],
  purchasing_officer: ['purchasing'],
  pos_operator: ['orders'],
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
