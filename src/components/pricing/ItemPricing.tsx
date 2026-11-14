/**
 * One item's automatic pricing on the product form (PRICING-AUTO lane D, DEC-089): the item is a
 * product's variation (its option; a simple product has exactly one). The shared PolicyForm at the
 * variation scope, with the item's own facts (today's price, MRP, cost, lowest allowed).
 *
 *   ProductForm, Pricing tab          a simple product's one variation
 *   ProductAttributeVariations        each option's quick edit (opened on demand)
 *   VariationEditPage                 the full option editor
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { FieldGroup } from '@/components/product/FormField';
import { isUuid } from '@/lib/uuid';
import { PRICING_PERMS } from '@/lib/v2/pricing';
import PolicyForm from './PolicyForm';

const DESCRIPTION =
  "Competitive pricing and Google discounts for this item only. Each value inherits from the item's brand, then the whole website (Catalog, Pricing), unless set here. Saved with its own Save pricing button, not with the product.";

const ItemPricing: React.FC<{
  /** The variation's id; an unsaved option has none yet. */
  variationId?: string | null;
  /** Fold it away until opened (the option's quick edit). */
  collapsible?: boolean;
  className?: string;
}> = ({ variationId, collapsible = false, className }) => {
  const { hasPerm } = useAuth();
  const [open, setOpen] = useState(false);
  const saved = isUuid(variationId);
  const canManage = hasPerm(PRICING_PERMS.manage);

  const body = saved
    ? <PolicyForm scope="variation" id={variationId} canManage={canManage} />
    : <p className="text-xs text-gray-500">Save the product first; this option gets its pricing once it is saved.</p>;

  if (!collapsible) {
    return (
      <FieldGroup title="Automatic pricing" description={DESCRIPTION} className={className}>
        {body}
      </FieldGroup>
    );
  }
  return (
    <section className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-800 hover:text-gray-950"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
        Automatic pricing for this option
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-gray-500">{DESCRIPTION}</p>
          {body}
        </div>
      )}
    </section>
  );
};

export default ItemPricing;
