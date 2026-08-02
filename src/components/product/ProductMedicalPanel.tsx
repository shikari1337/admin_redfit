import React from 'react';
import { FieldGroup, Field, SwitchRow, fieldInputCls } from './FormField';

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
    <FieldGroup title="Medical & pharmacy"
      description="Regulatory fields for medicines. Per-variation dosage & important information are edited on each variation.">
      <div className="space-y-5">

        {/* Requires Prescription */}
        <div className="divide-y divide-gray-100 border-b border-gray-100 pb-2">
          <SwitchRow id="medRequiresPrescription" label="Needs a prescription"
            help="Customer must upload a valid prescription before checkout."
            checked={requiresPrescription}
            onCheckedChange={onRequiresPrescriptionChange} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Shelf Life */}
          <Field label="Shelf life (months)" htmlFor="medExpiryMonths"
            help="Months from manufacture until expiry — used for batch/expiry defaults.">
            <input id="medExpiryMonths" type="number" min="1" value={expiryMonths || ''}
              onChange={e => onExpiryMonthsChange(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="24"
              className={`${fieldInputCls} !w-40`} />
          </Field>

          {/* License Number */}
          <Field label="License number" htmlFor="medLicenseNumber"
            help="Drug license / FSSAI number printed on the label.">
            <input id="medLicenseNumber" type="text" value={licenseNumber || ''}
              onChange={e => onLicenseNumberChange(e.target.value)}
              placeholder="Drug license / FSSAI etc."
              className={fieldInputCls} />
          </Field>
        </div>

      </div>
    </FieldGroup>
  );
};

export default ProductMedicalPanel;
