import React from 'react';

/**
 * Medical / pharmacy fields — one home for the fields the `pharmacy_fields`
 * module governs at product level. These previously lived in three places
 * (Requires Prescription in Display Options, Shelf Life as its own card,
 * License Number inside Product Identifiers); they are RE-HOMED here so the
 * form has a single Medical tab. formData keys are unchanged
 * (requiresPrescription / expiryMonths / licenseNumber).
 *
 * The panel is only mounted when canAccess('pharmacy_fields') — with the
 * module off the backend strips these writes anyway, and the loaded values
 * still round-trip untouched through the payload builder.
 */
interface ProductMedicalPanelProps {
  requiresPrescription: boolean;
  expiryMonths?: number;
  licenseNumber: string;
  onRequiresPrescriptionChange: (value: boolean) => void;
  onExpiryMonthsChange: (value: number | undefined) => void;
  onLicenseNumberChange: (value: string) => void;
}

const ProductMedicalPanel: React.FC<ProductMedicalPanelProps> = ({
  requiresPrescription, expiryMonths, licenseNumber,
  onRequiresPrescriptionChange, onExpiryMonthsChange, onLicenseNumberChange,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Medical &amp; Pharmacy</h2>
      <p className="text-xs text-gray-500 mb-4">
        Regulatory fields for medicines. Per-variation dosage &amp; important information are edited on each variation.
      </p>

      <div className="space-y-4">
        {/* Requires Prescription */}
        <div className="flex items-center justify-between py-2 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-sm font-medium text-gray-700">Requires Prescription</p>
            <p className="text-xs text-gray-500 mt-0.5">Customer must upload a valid prescription before checkout</p>
          </div>
          <label htmlFor="medRequiresPrescription" className="relative inline-flex items-center cursor-pointer shrink-0">
            <input id="medRequiresPrescription" type="checkbox" checked={requiresPrescription}
              onChange={e => onRequiresPrescriptionChange(e.target.checked)} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
          </label>
        </div>

        {/* Shelf Life */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Shelf Life (months)</label>
          <input type="number" min="1" value={expiryMonths || ''}
            onChange={e => onExpiryMonthsChange(e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="24"
            className="w-40 px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
          <p className="text-xs text-gray-400 mt-1">Months from manufacture until expiry (used for batch/expiry defaults).</p>
        </div>

        {/* License Number */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">License Number</label>
          <input type="text" value={licenseNumber || ''}
            onChange={e => onLicenseNumberChange(e.target.value)}
            placeholder="Drug license / FSSAI etc."
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
        </div>
      </div>
    </div>
  );
};

export default ProductMedicalPanel;
