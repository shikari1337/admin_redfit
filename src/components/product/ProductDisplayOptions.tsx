import React from 'react';

interface ProductDisplayOptionsProps {
  disableVariants: boolean;
  showOutOfStockVariants: boolean;
  isActive: boolean;
  isFeatured?: boolean;
  isDigital?: boolean;
  requiresPrescription?: boolean;
  onDisableVariantsChange: (value: boolean) => void;
  onShowOutOfStockVariantsChange: (value: boolean) => void;
  onIsActiveChange: (value: boolean) => void;
  onIsFeaturedChange?: (value: boolean) => void;
  onIsDigitalChange?: (value: boolean) => void;
  onRequiresPrescriptionChange?: (value: boolean) => void;
}

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; id?: string }> = ({ checked, onChange, id }) => (
  <label htmlFor={id} className="relative inline-flex items-center cursor-pointer shrink-0">
    <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
  </label>
);

const Row: React.FC<{ id: string; label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }> = ({ id, label, desc, checked, onChange }) => (
  <div className="flex items-center justify-between py-2">
    <div className="flex-1 min-w-0 pr-3">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
    </div>
    <Toggle id={id} checked={checked} onChange={onChange} />
  </div>
);

const ProductDisplayOptions: React.FC<ProductDisplayOptionsProps> = ({
  disableVariants, showOutOfStockVariants, isActive,
  isFeatured = false, isDigital = false, requiresPrescription = false,
  onDisableVariantsChange, onShowOutOfStockVariantsChange, onIsActiveChange,
  onIsFeaturedChange, onIsDigitalChange, onRequiresPrescriptionChange,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Product Status & Display</h2>
      <div className="divide-y divide-gray-100">

        <Row id="isActive" label="Active / Published"
          desc="Visible to customers when active"
          checked={isActive} onChange={onIsActiveChange} />

        <Row id="isFeatured" label="Featured Product"
          desc="Show in featured sections and homepage"
          checked={isFeatured} onChange={v => onIsFeaturedChange && onIsFeaturedChange(v)} />

        <Row id="isDigital" label="Digital Product"
          desc="No shipping required; deliver via download/email"
          checked={isDigital} onChange={v => onIsDigitalChange && onIsDigitalChange(v)} />

        <Row id="requiresPrescription" label="Requires Prescription"
          desc="Customer must upload a valid prescription"
          checked={requiresPrescription} onChange={v => onRequiresPrescriptionChange && onRequiresPrescriptionChange(v)} />

        <Row id="disableVariants" label="Disable Variant Picker"
          desc="Hide variant selection on product page"
          checked={disableVariants} onChange={onDisableVariantsChange} />

        <Row id="showOosVariants" label="Show Out-of-Stock Variants"
          desc="Display unavailable variants as disabled swatches"
          checked={showOutOfStockVariants} onChange={onShowOutOfStockVariantsChange} />

      </div>
    </div>
  );
};

export default ProductDisplayOptions;
