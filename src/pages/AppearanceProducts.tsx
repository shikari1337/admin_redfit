import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaBoxOpen } from 'react-icons/fa';
import api, { settingsRegistryAPI } from '../services/api';
import { useSettingsSection } from '../hooks/useSettingsSection';
import { Textarea } from '@/components/ui/textarea';

interface Switches {
  saleTimer: boolean;
  perUnitPrice: boolean;
  offers: boolean;
  tags: boolean;
  reviews: boolean;
  socialShare: boolean;
  relatedProducts: boolean;
  recentlyViewed: boolean;
  pincodeChecker: boolean;
  specifications: boolean;
  aplusContent: boolean;
  brand: boolean;
  stockStatus: boolean;
  deliveryEstimate: boolean;
  savingsBadge: boolean;
  disclaimer: boolean;
}

interface ProductSettings extends Switches {
  /** The disclaimer line: the store's own text, else the registry's seeded default (the one copy of it).
   *  Undefined while neither could be read; an undefined text is not sent, so a save never blanks it. */
  disclaimerText?: string;
}

const DEFAULTS: ProductSettings = {
  saleTimer: true, perUnitPrice: true, offers: true, tags: true, reviews: true,
  socialShare: true, relatedProducts: true, recentlyViewed: true, pincodeChecker: true,
  specifications: true, aplusContent: true, brand: true, stockStatus: true,
  deliveryEstimate: true, savingsBadge: true, disclaimer: true,
};

type Key = keyof Switches;

/** The seeded default of `productSettings.disclaimerText` as the registry declares it. */
function seededDisclaimer(def: any): string | undefined {
  const field = (def?.fields ?? []).find((f: any) => f?.path === 'disclaimerText');
  return typeof field?.default === 'string' ? field.default : undefined;
}

const GROUPS: { title: string; items: { key: Key; label: string; desc: string }[] }[] = [
  {
    title: 'Sale & Pricing',
    items: [
      { key: 'saleTimer', label: 'Sale countdown timer', desc: 'Show a live "Sale ends in…" timer when a product has a sale end date.' },
      { key: 'savingsBadge', label: 'Savings badge', desc: 'Show the "You save ₹X" amount next to the price.' },
      { key: 'perUnitPrice', label: 'Per-unit price', desc: 'Show the derived per-ml / per-unit price under the price.' },
      { key: 'offers', label: 'Offers block', desc: 'Show the bank/coupon/combo offers section.' },
    ],
  },
  {
    title: 'Product Information',
    items: [
      { key: 'brand', label: 'Brand', desc: 'Show the brand name / logo on the product page.' },
      { key: 'stockStatus', label: 'Stock status', desc: 'Show In stock / Only N left / Out of stock.' },
      { key: 'specifications', label: 'Specifications', desc: 'Show the product specifications table.' },
      { key: 'disclaimer', label: 'Disclaimer line', desc: 'Show the text below as one quiet line under the product details, on every product page.' },
      { key: 'aplusContent', label: 'A+ content', desc: 'Show rich A+ content sections.' },
      { key: 'tags', label: 'Tags', desc: 'Show product tags.' },
      { key: 'deliveryEstimate', label: 'Delivery estimate', desc: 'Show the estimated delivery time.' },
      { key: 'pincodeChecker', label: 'Pincode checker', desc: 'Show the delivery pincode/serviceability checker.' },
    ],
  },
  {
    title: 'Social & Discovery',
    items: [
      { key: 'reviews', label: 'Customer reviews', desc: 'Show the reviews section and rating breakdown.' },
      { key: 'socialShare', label: 'Social share', desc: 'Show the share-to-social buttons.' },
      { key: 'relatedProducts', label: 'Related products', desc: 'Show the related / similar products carousel.' },
      { key: 'recentlyViewed', label: 'Recently viewed', desc: 'Show the recently viewed products row.' },
    ],
  },
];

const AppearanceProducts: React.FC = () => {
  const navigate = useNavigate();
  // The registry's default disclaimer text, for "Use the default text"; undefined when the registry cannot be read.
  const [seededText, setSeededText] = useState<string | undefined>(undefined);

  const { formData: form, setFormData: setForm, loading, saving, handleSubmit } = useSettingsSection<ProductSettings>({
    defaults: DEFAULTS,
    // The store's settings as before, plus the registry's own definition for the seeded disclaimer text
    // (a caller without settings.read still gets the page; the text then stays as saved, or unsent).
    fetcher: async () => {
      const [settings, def] = await Promise.all([
        api.get('/settings/admin').then((r) => r.data),
        settingsRegistryAPI.definition('productSettings').catch(() => null),
      ]);
      return settings ? { settings, seeded: seededDisclaimer(def) } : null;
    },
    parse: ({ settings, seeded }) => {
      const saved = settings.productSettings || {};
      const own = typeof saved.disclaimerText === 'string' ? saved.disclaimerText : undefined;
      return { ...DEFAULTS, ...saved, disclaimerText: own ?? seeded };
    },
    onLoaded: ({ seeded }) => setSeededText(seeded),
    // `productSettings` is a public registry setting whose fields are these switches, the disclaimer text (and the
    // filter order, sent back as loaded). On v2 the only write is the registry's own (`PATCH /settings/registry/productSettings`),
    // which `PUT /settings` reaches section by section; the old `PUT /settings/productSettings` is not served.
    submitter: async (data) => {
      await api.put('/settings', { productSettings: data });
    },
    successMessage: 'Product page settings saved! Your storefront will reflect these changes.',
    onError: (e: any) => alert(e?.response?.data?.message || 'Failed to save settings'),
  });

  const toggle = (key: Key) => setForm((f) => ({ ...f, [key]: !f[key] }));
  const save = () => handleSubmit();

  if (loading) {
    return <div className="p-8 text-gray-500">Loading…</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/appearance/style')} className="text-gray-500 hover:text-gray-800">
            <FaArrowLeft />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-teal-100 rounded-lg flex items-center justify-center">
              <FaBoxOpen className="text-teal-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Product Page</h1>
              <p className="text-sm text-gray-500">Show, hide and configure elements on the storefront product page.</p>
            </div>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-teal-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-60"
        >
          <FaSave /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="space-y-6">
        {GROUPS.map((group) => (
          <div key={group.title} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-4">{group.title}</h2>
            <div className="divide-y divide-gray-100">
              {group.items.map((item) => (
                <div key={item.key} className="py-3.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{item.desc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form[item.key]}
                      onClick={() => toggle(item.key)}
                      className={`relative w-12 h-6.5 rounded-full transition-colors shrink-0 mt-0.5 ${form[item.key] ? 'bg-teal-600' : 'bg-gray-300'}`}
                      style={{ height: '1.6rem', width: '3rem' }}
                    >
                      <span
                        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                        style={{ transform: form[item.key] ? 'translateX(1.35rem)' : 'translateX(0)' }}
                      />
                    </button>
                  </div>
                  {item.key === 'disclaimer' && form.disclaimer && (
                    <div className="mt-3">
                      <label htmlFor="product-disclaimer-text" className="block text-xs font-semibold text-gray-700 mb-1">Disclaimer text</label>
                      <Textarea
                        id="product-disclaimer-text"
                        rows={4}
                        value={form.disclaimerText ?? ''}
                        placeholder={form.disclaimerText === undefined ? 'The default text shows on the website until you type your own.' : undefined}
                        onChange={(e) => setForm((f) => ({ ...f, disclaimerText: e.target.value }))}
                      />
                      <div className="mt-1 flex items-start justify-between gap-3">
                        <p className="text-gray-500 text-xs">Plain text, the same on every product page. Leave it empty to show nothing.</p>
                        {seededText !== undefined && form.disclaimerText !== seededText && (
                          <button
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, disclaimerText: seededText }))}
                            className="shrink-0 text-xs font-semibold text-teal-700 hover:underline"
                          >
                            Use the default text
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-teal-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-60"
        >
          <FaSave /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default AppearanceProducts;
