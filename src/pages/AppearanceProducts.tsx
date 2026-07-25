import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaBoxOpen } from 'react-icons/fa';
import api from '../services/api';

interface ProductSettings {
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
}

const DEFAULTS: ProductSettings = {
  saleTimer: true, perUnitPrice: true, offers: true, tags: true, reviews: true,
  socialShare: true, relatedProducts: true, recentlyViewed: true, pincodeChecker: true,
  specifications: true, aplusContent: true, brand: true, stockStatus: true,
  deliveryEstimate: true, savingsBadge: true,
};

type Key = keyof ProductSettings;

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductSettings>(DEFAULTS);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/settings/admin');
      const data = res.data?.data ?? res.data ?? {};
      setForm({ ...DEFAULTS, ...(data.productSettings || {}) });
    } catch {
      setForm(DEFAULTS);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key: Key) => setForm((f) => ({ ...f, [key]: !f[key] }));

  const save = async () => {
    setSaving(true);
    try {
      // Public so the storefront can read it (is_public = true).
      await api.put('/settings/productSettings', { value: form, is_public: true, group_name: 'appearance' });
      alert('Product page settings saved! Your storefront will reflect these changes.');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-gray-500">Loading…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
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
                <div key={item.key} className="flex items-start justify-between gap-4 py-3.5">
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
