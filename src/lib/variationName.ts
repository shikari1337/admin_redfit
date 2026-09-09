/**
 * The catalogue's ONE product-naming rule — admin's copy.
 *
 * ⚠️ DO NOT EDIT THE SHARED BODY BELOW. The original lives at
 * `backend/src/utils/variationName.ts`; everything between the SHARED BODY
 * markers is byte-identical across the backend, the storefront
 * (`storefront/src/lib/cart.ts`) and this file, and drift fails
 * `backend/tests/catalog-naming-smoke.ts` section A.
 *
 * Admin does not name products — the API resolves every label it renders. This
 * copy exists for ONE reason: the Settings Center's `catalogNaming` preview has
 * to show the merchant what an unsaved config WOULD produce, before it is saved
 * and therefore before any server has composed anything. Re-deriving that by
 * hand is how a fifth naming convention gets born, which is the exact problem
 * this setting exists to end.
 */

// ─────────────────────── SHARED BODY START ───────────────────────
/** The catalogue's own `product-form` vocabulary (attribute values, migration-backfilled). */
const CANONICAL_FORMS = [
  'Dilution', 'Mother Tincture', 'Trituration', 'Biochemic Tablet', 'Tablets',
  'Drops', 'Ointment / Cream', 'Syrup / Tonic', 'Gel', 'Powder', 'Oil',
  'Capsules', 'Others',
];
const FORM_BY_LOWER = new Map(CANONICAL_FORMS.map((f) => [f.toLowerCase(), f]));

/** Forms that name nothing — printing them would only add noise. */
const SKIP_FORMS = new Set(['others', 'other', '']);

function titleCaseWords(s: string): string {
  return s.split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

/**
 * The form as it should read. The attribute holds a few case variants
 * ("dilution", "trituration", "drops" — 70 rows on homeomead) that must print
 * identically to the 44k that are already Title Case.
 */
export function canonicalForm(raw: unknown): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  return FORM_BY_LOWER.get(t.toLowerCase()) ?? titleCaseWords(t);
}

/**
 * The trade's abbreviations for a form, as they appear inside product names
 * ("Bp Syp Syrup", "Relax H Tab", "Aidotons Cap 4"). Expanded before the
 * redundancy test so "Relax H Tab" + "Tablets" doesn't print "Tab Tablets".
 *
 * Kept as an explicit map rather than prefix-matching on purpose: "gel" is a
 * prefix of "Gelsemium", one of the most common remedies in this catalogue, so
 * a prefix rule would strip the real form from every Gelsemium row.
 */
const FORM_ABBREVIATIONS: Record<string, string> = {
  tab: 'tablets', tabs: 'tablets', tablet: 'tablets',
  syp: 'syrup', syr: 'syrup',
  oint: 'ointment', ment: 'ointment',
  cap: 'capsules', caps: 'capsules', capsule: 'capsules',
  crm: 'cream',
};

/**
 * Does the product name already say what the form says?
 *
 * A large slice of the catalogue bakes the form into the product name
 * ("Livosin Syrup", "Belacalendula Cream", "Bellytone Tablets", "Allen A90
 * Ovarian Cysts Drops"). Appending the form there produces "Livosin Syrup
 * Syrup / Tonic". Matching on any single significant word of the form is what
 * catches the compound labels ("Syrup / Tonic" vs a name carrying only "Syrup").
 */
export function formIsRedundant(form: string, product: string): boolean {
  const words = String(product ?? '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .flatMap((w) => (FORM_ABBREVIATIONS[w] ? [w, FORM_ABBREVIATIONS[w]] : [w]));
  const p = ` ${words.join(' ')} `;
  return String(form).toLowerCase().split(/[^a-z]+/)
    .filter((w) => w.length >= 3)
    .some((w) => p.includes(` ${w} `));
}

/** The pack size, wherever this catalogue happens to keep it. */
export function variationSizeValue(attributes: any): string {
  const a = attributes || {};
  return String(a.packagename ?? a.size ?? a.volume ?? a.pack ?? '').trim();
}

/**
 * Normalise a measurement so "75 GMS", "75gm" and "75 g" compare equal.
 * Ported from the storefront PDP's own `normaliseMeasure`, which has guarded
 * this since the same import was found to bake pack sizes into parent names.
 */
function normaliseMeasure(raw: string): string {
  return String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/(\d)(grams|gram|gms|gm)\b/g, '$1g')
    .replace(/(\d)(millilitres|millilitre|mls)\b/g, '$1ml')
    .replace(/(\d)(litres|litre|ltr)\b/g, '$1l');
}

/**
 * Does the product name ALREADY state this potency or pack size?
 *
 * 180 homeomead parents were imported with the size inside the name
 * ("GRAPHITES OINTMENT 25 GM", "Adven A 126 DROPS 30 ML"), so appending the
 * size attribute on top printed it twice — "…OINTMENT 25 GM 25 GM". The
 * storefront PDP has guarded this for a while (`nameAlreadyStates`); the
 * composer needs the same rule or it writes the doubled string into the column.
 *
 * The digit-run guard matters: "75g" must not count as present inside "175g".
 */
export function nameAlreadyStates(name: string, value: string): boolean {
  const v = normaliseMeasure(value);
  if (!v) return false;
  const n = normaliseMeasure(name);
  const idx = n.indexOf(v);
  if (idx < 0) return false;
  return !/\d/.test(idx > 0 ? n[idx - 1] : '');
}

export interface VariationNameParts {
  /** The brand's full registered name — `brands.name`, never a shorthand code. */
  brand?: string | null;
  /** The parent product's name (`products.name`) — the remedy/family name. */
  product?: string | null;
  attributes?: Record<string, any> | null;
}

/** The five parts a variation name can be built from. */
export type CatalogNamePart = 'brand' | 'product' | 'form' | 'potency' | 'size';

/**
 * Drives the ORDER and INCLUSION of `canonicalVariationName`'s parts. Optional
 * everywhere — a caller passing nothing gets `DEFAULT_CATALOG_NAMING_CONFIG`,
 * which reproduces the fixed `brand · product · form · potency · size` order
 * this function has always used. Backed by `settingsRegistry.ts` key
 * `catalogNaming` (per-surface overrides for website/admin/seo/channels); see
 * that key's `resolver` for how a store's stored config becomes one of these.
 */
export interface CatalogNamingConfig {
  /** The part sequence. An empty/missing array falls back to the default order. */
  order: CatalogNamePart[];
  /** Which parts to print at all. A part missing from this map defaults to `true`. */
  include: Partial<Record<CatalogNamePart, boolean>>;
}

export const DEFAULT_CATALOG_NAME_ORDER: CatalogNamePart[] = ['brand', 'product', 'form', 'potency', 'size'];

export const DEFAULT_CATALOG_NAMING_CONFIG: CatalogNamingConfig = {
  order: DEFAULT_CATALOG_NAME_ORDER,
  include: { brand: true, product: true, form: true, potency: true, size: true },
};

/**
 * brand · product · form · potency · size — the canonical order (default; see
 * `CatalogNamingConfig` above for how a store can reorder or drop a part).
 *
 * Empty parts collapse (36,386 of 44,087 homeomead variations carry a potency;
 * the rest are syrups/ointments/cosmetics that legitimately have none), and the
 * product name alone is the floor: this never returns an empty string for a row
 * that has a product — REGARDLESS of config, since dropping `product` from
 * `include` would otherwise silently produce an unlabelled line.
 */
export function canonicalVariationName(
  parts: VariationNameParts,
  config: CatalogNamingConfig = DEFAULT_CATALOG_NAMING_CONFIG,
): string {
  const a = parts.attributes || {};
  const product = String(parts.product ?? '').trim();
  const include = { ...DEFAULT_CATALOG_NAMING_CONFIG.include, ...(config.include || {}) };
  const order = config.order && config.order.length ? config.order : DEFAULT_CATALOG_NAME_ORDER;

  let form = include.form === false ? '' : canonicalForm(a['product-form'] ?? a.form);
  if (form && (SKIP_FORMS.has(form.toLowerCase()) || formIsRedundant(form, product))) form = '';

  const potency = include.potency === false ? '' : String(a.potency ?? '').trim().toUpperCase();
  const size = include.size === false ? '' : variationSizeValue(a);

  const byPart: Record<CatalogNamePart, string> = {
    brand: include.brand === false ? '' : String(parts.brand ?? '').trim(),
    product: include.product === false ? '' : product,
    form,
    potency: nameAlreadyStates(product, potency) ? '' : potency,
    size: nameAlreadyStates(product, size) ? '' : size,
  };

  return order.map((k) => byPart[k] ?? '').filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim() || product;
}

/**
 * Is there actually anything to order?
 *
 * A variation with no brand and no form/potency/size composes down to the bare
 * product name — every ziptron row, and any tenant not shaped like the
 * homeopathy catalogue. Overwriting there would silently replace a hand-written
 * variant label ("CI Smoke A", "Black / 128GB") with its parent's name, so the
 * writers leave those rows exactly as they found them.
 */
export function hasNameParts(brand: unknown, attributes: any): boolean {
  const a = attributes || {};
  return Boolean(
    String(brand ?? '').trim()
    || String(a['product-form'] ?? a.form ?? '').trim()
    || String(a.potency ?? '').trim()
    || variationSizeValue(a),
  );
}
// ──────────────────────── SHARED BODY END ────────────────────────
