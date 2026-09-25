/**
 * THE GST RATE A PRODUCT OR SKU IS ACTUALLY CHARGED AT — for display.
 *
 * Mirrors the server's precedence exactly (COMMON_MISTAKES #218):
 *   the variation's own tax rule → the product's tax rule → the store default.
 * Nothing here computes tax; it only names which rule is in force and its rate,
 * so the product form and the variation editor say the same thing.
 */
export interface TaxRuleLike { _id?: string; id?: string; name: string; rate?: number }

export interface ResolvedTaxRate {
  /** The rule's rate, or null when only the store default applies (unknown here). */
  rate: number | null;
  ruleName: string | null;
  source: 'variation' | 'product' | 'store default';
}

export function resolveTaxRate(
  rules: TaxRuleLike[],
  productRuleId?: string | null,
  variationRuleId?: string | null,
): ResolvedTaxRate {
  const find = (id?: string | null) => (id ? rules.find((r) => (r._id || r.id) === id) : undefined);
  const own = find(variationRuleId);
  if (own) return { rate: own.rate != null ? Number(own.rate) : null, ruleName: own.name, source: 'variation' };
  const prod = find(productRuleId);
  if (prod) return { rate: prod.rate != null ? Number(prod.rate) : null, ruleName: prod.name, source: 'product' };
  return { rate: null, ruleName: null, source: 'store default' };
}

/** One sentence for under the field. */
export function describeTaxRate(r: ResolvedTaxRate): string {
  const from = r.source === 'store default' ? 'the store default' : `this ${r.source}'s rule`;
  return r.rate != null
    ? `Charged at ${r.rate}% GST (from ${from}). CGST+SGST or IGST follows the delivery address.`
    : 'Charged at the store default rate. CGST+SGST or IGST follows the delivery address.';
}
