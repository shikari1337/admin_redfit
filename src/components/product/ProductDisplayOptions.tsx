import React from 'react';
import { FieldGroup, SwitchRow } from './FormField';

interface ProductDisplayOptionsProps {
  disableVariants: boolean;
  showOutOfStockVariants: boolean;
  isActive: boolean;
  isFeatured?: boolean;
  isDigital?: boolean;
  requiresPrescription?: boolean;
  /** ProductForm re-homes this toggle into the Medical tab (pharmacy_fields
   *  module) — pass false to hide the row here and avoid a duplicate control. */
  showRequiresPrescription?: boolean;
  onDisableVariantsChange: (value: boolean) => void;
  onShowOutOfStockVariantsChange: (value: boolean) => void;
  onIsActiveChange: (value: boolean) => void;
  onIsFeaturedChange?: (value: boolean) => void;
  onIsDigitalChange?: (value: boolean) => void;
  onRequiresPrescriptionChange?: (value: boolean) => void;
}

const ProductDisplayOptions: React.FC<ProductDisplayOptionsProps> = ({
  disableVariants, showOutOfStockVariants, isActive,
  isFeatured = false, isDigital = false, requiresPrescription = false,
  showRequiresPrescription = true,
  onDisableVariantsChange, onShowOutOfStockVariantsChange, onIsActiveChange,
  onIsFeaturedChange, onIsDigitalChange, onRequiresPrescriptionChange,
}) => {
  return (
    <FieldGroup title="Display options" description="Switch things on or off — changes apply after you save.">
      <div className="divide-y divide-gray-100">

        <SwitchRow id="isActive" label="Show in store"
          help="Customers can see and buy this product."
          checked={isActive} onCheckedChange={onIsActiveChange} />

        <SwitchRow id="isFeatured" label="Feature this product"
          help="Give it a spot in featured sections and on the homepage."
          checked={isFeatured} onCheckedChange={v => onIsFeaturedChange && onIsFeaturedChange(v)} />

        <SwitchRow id="isDigital" label="Digital product"
          help="Nothing to ship — delivered by download or email."
          checked={isDigital} onCheckedChange={v => onIsDigitalChange && onIsDigitalChange(v)} />

        {showRequiresPrescription && (
        <SwitchRow id="requiresPrescription" label="Needs a prescription"
          help="Customer must upload a valid prescription before buying."
          checked={requiresPrescription} onCheckedChange={v => onRequiresPrescriptionChange && onRequiresPrescriptionChange(v)} />
        )}

        <SwitchRow id="disableVariants" label="Hide the option picker"
          help="Don't show variant choices (size, potency…) on the product page."
          checked={disableVariants} onCheckedChange={onDisableVariantsChange} />

        <SwitchRow id="showOosVariants" label="Show sold-out options"
          help="Sold-out variants appear greyed-out instead of disappearing."
          checked={showOutOfStockVariants} onCheckedChange={onShowOutOfStockVariantsChange} />

      </div>
    </FieldGroup>
  );
};

export default ProductDisplayOptions;
