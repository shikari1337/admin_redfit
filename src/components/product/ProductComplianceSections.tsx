import React, { useState } from 'react';

/**
 * Config-driven compliance / specification sections.
 *
 * Structure comes from the store's vertical config (GET /settings/product-config),
 * so a homeopathy store, electronics store, fashion store etc. each render their own
 * mandatory fields with ZERO code change here — only the backend template differs.
 *
 * Values are stored in the product's `specifications` JSONB as:
 *   [{ key, heading, items: [{ key, label, value }] }]
 */

export interface ComplianceField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'country' | 'manufacturer' | 'select';
  options?: string[];
  default?: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
}
export interface ComplianceSection {
  key: string;
  title: string;
  mandatory?: boolean;
  fields: ComplianceField[];
}
export interface ProductConfig {
  vertical: string;
  label: string;
  complianceSections: ComplianceSection[];
}
export interface SpecSectionValue {
  key: string;
  heading: string;
  items: Array<{ key: string; label: string; value: string }>;
}

interface Props {
  config: ProductConfig | null;
  value: SpecSectionValue[];
  onChange: (sections: SpecSectionValue[]) => void;
  manufacturers: Array<{ _id: string; name: string }>;
}

// Compact country list (India first). Extend as needed.
const COUNTRIES = ['India', 'China', 'Germany', 'United States', 'United Kingdom', 'France', 'Japan', 'South Korea', 'Italy', 'Switzerland', 'Bangladesh', 'Vietnam', 'Thailand', 'Indonesia', 'UAE', 'Other'];

const inputCls = 'w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400';

// Fallback so the compliance fields always render even if the store config endpoint
// hasn't resolved yet. Mirrors the backend 'generic' vertical.
const FALLBACK_CONFIG: ProductConfig = {
  vertical: 'generic',
  label: 'Generic',
  complianceSections: [
    {
      key: 'compliance', title: 'Compliance & Regulatory', mandatory: true,
      fields: [
        { key: 'country_of_origin', label: 'Country of Origin', type: 'country', default: 'India', required: true },
        { key: 'manufacturer', label: 'Manufacturer', type: 'manufacturer', required: true },
        { key: 'marketed_by', label: 'Marketed By', type: 'text' },
        { key: 'packed_by', label: 'Packed By', type: 'text' },
        { key: 'imported_by', label: 'Imported By', type: 'text' },
        { key: 'net_quantity', label: 'Net Quantity', type: 'text', placeholder: 'e.g. 30 ml, 25 g' },
        { key: 'consumer_care', label: 'Consumer Care / Customer Care', type: 'text' },
      ],
    },
  ],
};

const ProductComplianceSections: React.FC<Props> = ({ config, value, onChange, manufacturers }) => {
  const [disabledSections, setDisabledSections] = useState<Set<string>>(new Set());
  const activeConfig = config && config.complianceSections?.length ? config : FALLBACK_CONFIG;

  const getVal = (sk: string, fk: string): string =>
    value.find(s => s.key === sk)?.items.find(i => i.key === fk)?.value ?? '';

  const setVal = (section: ComplianceSection, field: ComplianceField, v: string) => {
    const next = [...value];
    let sec = next.find(s => s.key === section.key);
    if (!sec) { sec = { key: section.key, heading: section.title, items: [] }; next.push(sec); }
    else { sec.heading = section.title; }
    const item = sec.items.find(i => i.key === field.key);
    if (item) { item.value = v; item.label = field.label; }
    else sec.items.push({ key: field.key, label: field.label, value: v });
    // prune empty items so we don't store blanks
    sec.items = sec.items.filter(i => i.value !== '');
    onChange(next.filter(s => s.items.length > 0 || s.key === section.key));
  };

  const renderField = (section: ComplianceSection, field: ComplianceField) => {
    const val = getVal(section.key, field.key) || (getVal(section.key, field.key) === '' && !value.find(s => s.key === section.key) ? (field.default || '') : getVal(section.key, field.key));
    const common = { value: val, onChange: (e: any) => setVal(section, field, e.target.value) };
    switch (field.type) {
      case 'textarea':
        return <textarea rows={2} className={inputCls} placeholder={field.placeholder} {...common} />;
      case 'country':
        return (
          <select className={inputCls} value={val || field.default || ''} onChange={e => setVal(section, field, e.target.value)}>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        );
      case 'manufacturer':
        return (
          <>
            <input className={inputCls} list={`mfg-${section.key}-${field.key}`} placeholder="Select or type a manufacturer…" {...common} />
            <datalist id={`mfg-${section.key}-${field.key}`}>
              {manufacturers.map(m => <option key={m._id} value={m.name} />)}
            </datalist>
          </>
        );
      case 'select':
        return (
          <select className={inputCls} {...common}>
            <option value="">Select…</option>
            {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      default:
        return <input className={inputCls} placeholder={field.placeholder} {...common} />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Compliance & Specifications</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Fields for <span className="font-medium">{activeConfig.label}</span> stores. Configurable per store vertical from Super Admin.
        </p>
      </div>

      {activeConfig.complianceSections.map(section => {
        const off = disabledSections.has(section.key);
        return (
          <div key={section.key} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{section.title}</span>
                {section.mandatory
                  ? <span className="text-[10px] uppercase tracking-wide bg-red-50 text-red-600 px-1.5 py-0.5 rounded">Required</span>
                  : <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Optional</span>}
              </div>
              {!section.mandatory && (
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  <input type="checkbox" checked={!off}
                    onChange={e => setDisabledSections(prev => { const s = new Set(prev); e.target.checked ? s.delete(section.key) : s.add(section.key); return s; })} />
                  Include
                </label>
              )}
            </div>
            {!off && (
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {section.fields.map(field => (
                  <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                      {field.help && <span className="ml-1 text-gray-400 font-normal">— {field.help}</span>}
                    </label>
                    {renderField(section, field)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ProductComplianceSections;
