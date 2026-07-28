import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Page, PageHeader } from '../components/erp';
import {
  Store, Warehouse, Users, Package2, ShieldCheck, Plug, BookOpen, Truck, Landmark, HelpCircle,
} from 'lucide-react';

/**
 * Setup Guide — how an organisation gets from empty store to running ERP.
 * Every step links to the live screen. Steps marked "coming" describe the
 * documented roadmap (never fake buttons for features that don't exist yet).
 */
const steps = [
  {
    icon: Store, title: '1 · Store profile & configuration',
    what: 'Business identity, contact details, branding, policies — drives the storefront footer, invoices and emails.',
    links: [{ to: '/settings/store-config', label: 'Store Configuration wizard' }, { to: '/settings', label: 'General settings' }],
  },
  {
    icon: Landmark, title: '2 · GST & statutory setup',
    what: 'Set your GSTIN, default GST behaviour and per-product tax rules. Then run the Rate Check — it compares your config against the statutory rules registry (dated + cited law) and flags problems for you and your CA.',
    links: [
      { to: '/settings/gst', label: 'GST display settings' },
      { to: '/settings/tax-rules', label: 'Tax rules' },
      { to: '/panel/accounting/rate-check', label: 'Run GST Rate Check' },
    ],
  },
  {
    icon: Warehouse, title: '3 · Warehouses',
    what: 'Create each physical location with its address, GSTIN and pickup details (couriers pick up per-warehouse). Stock is tracked per warehouse today; zones → aisles → racks → bins (full warehouse layout with putaway) arrive with the WMS phase and will nest under these warehouses.',
    links: [{ to: '/warehouses', label: 'Warehouses' }],
  },
  {
    icon: Users, title: '4 · Vendors',
    what: 'Suppliers you buy from: legal name, GSTIN/PAN, bank details. Vendors feed purchase orders and vendor bills (3-way match).',
    links: [{ to: '/vendors', label: 'Vendors' }],
  },
  {
    icon: Package2, title: '5 · Catalog',
    what: 'Products, variations, brands, categories, HSN codes. Bulk import via the multi-sheet workbook. HSN + tax rule per product is what makes GST and GSTR-1 correct.',
    links: [{ to: '/products', label: 'Products' }, { to: '/products/import-export', label: 'Import / Export' }],
  },
  {
    icon: ShieldCheck, title: '6 · Team & role panels',
    what: 'Invite your people with the right role — each role logs into its own panel: Accountant & Auditor → Accounting; Warehouse Manager → Inventory; Store Manager → Orders. Auditor is read-only by construction.',
    links: [{ to: '/settings/staff', label: 'Staff & Access' }],
  },
  {
    icon: Plug, title: '7 · Sales channels (API + offline)',
    what: 'Connect API marketplaces (Amazon, Flipkart, Meesho…) for automatic sync. For channels WITHOUT an API — shop counter, WhatsApp, exhibitions, offline resellers — add an Offline/Manual channel: record its orders with Manual Order and correct stock with ledgered inventory adjustments; everything stays attributed per channel.',
    links: [
      { to: '/channels', label: 'Channels' },
      { to: '/orders/new', label: 'Manual order entry' },
      { to: '/inventory', label: 'Manual stock adjustment' },
    ],
  },
  {
    icon: BookOpen, title: '8 · Accounting books',
    what: 'Your chart of accounts is pre-seeded (Cash, Bank, AR/AP, Inventory, GST Input/Output, GRIR, COGS, Rounding-Off). Keep GL auto-posting OFF until your CA reviews the mapping — then every payment, GRN and bill posts itself, double-entry, immutable.',
    links: [
      { to: '/panel/accounting', label: 'Accounting panel' },
      { to: '/panel/accounting/settings', label: 'Accounting settings (auto-posting)' },
    ],
  },
  {
    icon: Truck, title: '9 · Purchasing flow',
    what: 'Raise a PO (gapless PO number on issue) → receive goods (GRN posts to the stock ledger, weighted-average cost updates) → record the vendor bill (3-way match flags mismatches) → approve (GRIR clears into AP) → pay.',
    links: [
      { to: '/panel/inventory/purchasing', label: 'Purchasing' },
      { to: '/panel/accounting/bills', label: 'Vendor Bills (AP)' },
    ],
  },
];

const SetupGuide: React.FC = () => {
  const { canAccess } = useAuth();
  return (
    <Page>
      <PageHeader
        icon={HelpCircle}
        title="Setup Guide"
        description={<>From empty store to running ERP, in order. Full written guide: <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">docs/SETUP_GUIDE.md</code> in the project repository.</>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {steps.map((s) => (
          <div key={s.title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 font-semibold text-gray-900">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900/5 text-gray-700">
                <s.icon className="h-5 w-5" />
              </span>
              <span>{s.title}</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">{s.what}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {s.links
                .filter((l) => !l.to.startsWith('/channels') || canAccess('channel_sync'))
                .map((l) => (
                  <Link key={l.to} to={l.to}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50">
                    {l.label} →
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
};

export default SetupGuide;
