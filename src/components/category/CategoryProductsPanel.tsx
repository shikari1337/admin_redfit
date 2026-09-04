/**
 * CategoryProductsPanel — put products (or individual SKUs) into a category
 * from the CATEGORY side.
 *
 * Until now the link could only be made from the other end: open a product,
 * find its Categories chip-picker, tick the box, save. Filling a category with
 * fifty remedies meant fifty round trips through the product form.
 *
 * Two grains, because the catalogue has two:
 *   • Product — writes `product_categories`. EVERY variation of that product
 *     that has no category links of its own appears in the category.
 *   • SKU     — writes `variation_categories`. Only that one pack appears
 *     (Arnica 30CH → Dilutions while its mother tincture stays out).
 *
 * ⚠️ The inheritance rule that makes the SKU grain dangerous, straight from
 * `buildVariationListingSql` (db/queries/products.ts):
 *
 *     a variation matches a category when it is EXPLICITLY linked to it,
 *     OR when it has NO explicit links at all and its PRODUCT is linked.
 *
 * So the moment a variation gets its first explicit link it stops inheriting —
 * silently dropping out of every other category its product put it in. Adding
 * one SKU to one category could therefore remove that SKU from five others.
 * "Keep its current categories" (on by default) copies the product's categories
 * onto the variation alongside the new one, so nothing disappears. Turning it
 * off is the deliberate "this pack belongs ONLY here" choice.
 *
 * No new endpoints: product links ride `PUT /products/:id { categories }` and
 * SKU links ride `PUT /products/:id/variations/:variationId { categories }`,
 * both of which already apply categories as a partial update.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, Plus, Trash2, Loader2, Package, Boxes, ExternalLink,
  ChevronLeft, ChevronRight, AlertTriangle, Check,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { productsAPI, searchAPI } from '../../services/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const PAGE_SIZE = 25;

/** Category refs arrive as objects ({id,_id,name}) or bare ids depending on the endpoint. */
const catId = (c: any): string => String(c?.id ?? c?._id ?? c ?? '');

interface Row {
  variationId: string;
  productId: string;
  name: string;
  sku?: string;
  image?: string;
  /** The PRODUCT's categories, as returned on the listing row. */
  productCategoryIds: string[];
  isActive?: boolean;
}

interface Hit {
  key: string;
  productId: string;
  variationId?: string;
  name: string;
  sku?: string;
  image?: string;
}

interface Props {
  categoryId: string | null;
  categoryName: string;
  canManage: boolean;
}

const CategoryProductsPanel: React.FC<Props> = ({ categoryId, categoryName, canManage }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [grain, setGrain] = useState<'product' | 'sku'>('product');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [keepInherited, setKeepInherited] = useState(true);

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const debounce = useRef<any>(null);

  // ── Current contents ──────────────────────────────────────────────────────
  // Exactly what the storefront category page resolves: one row per SKU, so a
  // product whose variations are split across categories reads honestly here.
  const load = useCallback(async () => {
    if (!categoryId) { setRows([]); setTotal(0); return; }
    setLoading(true);
    setListError(null);
    try {
      const res: any = await productsAPI.getAll({
        category: categoryId,
        expand: 'variations',
        group: 'none',
        limit: PAGE_SIZE,
        skip: page * PAGE_SIZE,
      } as any);
      const list: any[] = Array.isArray(res) ? res : (res?.data ?? []);
      setRows(list.map((r) => ({
        variationId: String(r.variation_id ?? r.id ?? ''),
        productId: String(r.product_id ?? r.id ?? ''),
        name: r.name ?? r.title ?? '(unnamed)',
        sku: r.sku,
        image: Array.isArray(r.images) ? r.images[0] : undefined,
        productCategoryIds: (Array.isArray(r.categories) ? r.categories : []).map(catId),
        isActive: r.is_active,
      })));
      // `total` rides the response envelope as a non-enumerable array property
      // (services/api.ts normalizeResponse) — it is not a visible field.
      setTotal(Number((Array.isArray(res) ? (res as any).total : res?.total) ?? 0));
    } catch (e: any) {
      console.error('Failed to load category products', e);
      setListError(e?.message || 'Could not load the products in this category');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [categoryId, page]);

  useEffect(() => { load(); }, [load]);
  // A different category was selected — go back to its first page.
  useEffect(() => { setPage(0); setQuery(''); setHits([]); setNotice(null); }, [categoryId]);

  // ── Search for something to add ───────────────────────────────────────────
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < searchAPI.MIN_LENGTH) { setHits([]); setSearching(false); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        if (grain === 'product') {
          // Unified search service — never an ad-hoc filter (COMMON_MISTAKES #16).
          const found = await searchAPI.query('product', q, 12);
          setHits((found as any[]).map((r) => ({
            key: String(r.id ?? r._id),
            productId: String(r.id ?? r._id),
            name: r.label ?? r.name ?? '(unnamed)',
            sku: r.sublabel ?? r.sku,
            image: r.image ?? r.image_url,
          })));
        } else {
          // One row per sellable pack, with the store's real SKU and the full
          // pack name — the parent product's name would be the wrong label here.
          const found = await productsAPI.searchVariations(q, 12);
          setHits((found as any[]).map((r) => ({
            key: String(r.variation_id ?? r.id),
            productId: String(r.product_id ?? r.id),
            variationId: String(r.variation_id ?? r.id),
            name: r.name ?? '(unnamed)',
            sku: r.sku,
            image: Array.isArray(r.images) ? r.images[0] : undefined,
          })));
        }
      } catch (e) {
        console.error('Category product search failed', e);
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, grain]);

  const inCategory = new Set(rows.map((r) => r.variationId));

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addProduct = async (hit: Hit) => {
    if (!categoryId) return;
    setBusy(hit.key);
    setNotice(null);
    try {
      const p: any = await productsAPI.getById(hit.productId);
      const ids = (Array.isArray(p?.categories) ? p.categories : []).map(catId).filter(Boolean);
      if (ids.includes(categoryId)) {
        setNotice({ kind: 'ok', text: `"${hit.name}" is already in ${categoryName}.` });
      } else {
        await productsAPI.update(hit.productId, { categories: [...ids, categoryId] });
        setNotice({ kind: 'ok', text: `Added "${hit.name}" to ${categoryName}.` });
        await load();
      }
    } catch (e: any) {
      console.error('Failed to add product to category', e);
      setNotice({ kind: 'err', text: e?.message || 'Could not add that product' });
    } finally {
      setBusy(null);
    }
  };

  const addSku = async (hit: Hit) => {
    if (!categoryId || !hit.variationId) return;
    setBusy(hit.key);
    setNotice(null);
    try {
      const p: any = await productsAPI.getById(hit.productId);
      const variation = (Array.isArray(p?.variations) ? p.variations : [])
        .find((v: any) => String(v?.id) === hit.variationId);
      const own = (Array.isArray(variation?.categories) ? variation.categories : []).map(catId).filter(Boolean);
      const productIds = (Array.isArray(p?.categories) ? p.categories : []).map(catId).filter(Boolean);

      if (own.includes(categoryId)) {
        setNotice({ kind: 'ok', text: `${hit.sku || hit.name} is already linked to ${categoryName}.` });
        return;
      }
      // Already here by inheritance. Writing a link would show nothing new while
      // converting an inherited membership into an explicit one — which is the
      // very change that makes the pack stop following its product from now on.
      if (!own.length && productIds.includes(categoryId)) {
        setNotice({
          kind: 'ok',
          text: `${hit.sku || hit.name} is already in ${categoryName} through its product — nothing to change.`,
        });
        return;
      }
      // No links yet = this pack is currently INHERITING its product's categories.
      // Writing the first link ends that inheritance, so carry them over unless
      // the merchant explicitly asked for this category only.
      const base = own.length ? own : (keepInherited ? productIds : []);
      await productsAPI.updateVariation(hit.productId, hit.variationId, {
        categories: [...base, categoryId],
      });
      const carried = !own.length && keepInherited && productIds.length;
      setNotice({
        kind: 'ok',
        text: `Linked ${hit.sku || hit.name} to ${categoryName}` +
          (carried ? `, keeping its ${productIds.length} inherited categor${productIds.length === 1 ? 'y' : 'ies'}.` : '.'),
      });
      await load();
    } catch (e: any) {
      console.error('Failed to link SKU to category', e);
      setNotice({ kind: 'err', text: e?.message || 'Could not link that SKU' });
    } finally {
      setBusy(null);
    }
  };

  const removeRow = async (row: Row) => {
    if (!categoryId) return;
    const viaProduct = row.productCategoryIds.includes(categoryId);
    const question = viaProduct
      ? `"${row.name}" is in ${categoryName} through its PRODUCT.\n\nRemoving it takes every pack of that product out of this category. Continue?`
      : `Unlink ${row.sku || row.name} from ${categoryName}?`;
    if (!confirm(question)) return;

    setBusy(row.variationId);
    setNotice(null);
    try {
      // Both branches are a read-modify-write of a category list, so read the
      // AUTHORITATIVE set from the product rather than the listing row: the row's
      // copy is shaped for display, and writing a display-shaped list back would
      // silently drop anything the listing chose not to include.
      const p: any = await productsAPI.getById(row.productId);
      if (viaProduct) {
        const ids = (Array.isArray(p?.categories) ? p.categories : []).map(catId).filter(Boolean);
        await productsAPI.update(row.productId, {
          categories: ids.filter((id: string) => id !== categoryId),
        });
      } else {
        // Only an explicit variation link can put a row here when its product
        // is not in the category — write the set back minus this one, so the
        // pack's OTHER links survive.
        const variation = (Array.isArray(p?.variations) ? p.variations : [])
          .find((v: any) => String(v?.id) === row.variationId);
        const own = (Array.isArray(variation?.categories) ? variation.categories : []).map(catId).filter(Boolean);
        await productsAPI.updateVariation(row.productId, row.variationId, {
          categories: own.filter((id: string) => id !== categoryId),
        });
      }
      setNotice({ kind: 'ok', text: `Removed from ${categoryName}.` });
      await load();
    } catch (e: any) {
      console.error('Failed to remove from category', e);
      setNotice({ kind: 'err', text: e?.message || 'Could not remove that item' });
    } finally {
      setBusy(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!categoryId) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <Boxes className="mx-auto h-7 w-7 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">Save the category first</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Products can be added once the category exists and has an id.
        </p>
      </div>
    );
  }

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const thumb = (src?: string, alt = '') =>
    src
      ? <img src={src} alt={alt} className="h-9 w-9 shrink-0 rounded border object-cover bg-muted" />
      : <div className="h-9 w-9 shrink-0 rounded border bg-muted grid place-items-center">
          <Package className="h-4 w-4 text-muted-foreground/50" />
        </div>;

  return (
    <div className="space-y-5">
      {/* ── Add ───────────────────────────────────────────────────────────── */}
      {canManage && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add to this category</span>
            <div className="ml-auto inline-flex rounded-md border bg-background p-0.5">
              {([
                { key: 'product', label: 'Whole product', icon: Package },
                { key: 'sku', label: 'Single SKU', icon: Boxes },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setGrain(key); setHits([]); }}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                    grain === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {grain === 'product'
              ? 'Adds every pack of the product to this category (packs that carry their own category links keep those instead).'
              : 'Links one specific pack. Use this when a product’s sizes or potencies belong in different categories.'}
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={grain === 'product' ? 'Search products by name or SKU…' : 'Search packs by name, SKU, potency or size…'}
              className="h-9 pl-9"
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>

          {grain === 'sku' && (
            <label className="flex items-start gap-2 rounded border border-amber-300/70 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900 cursor-pointer dark:bg-amber-950/30 dark:text-amber-200">
              <input
                type="checkbox"
                checked={keepInherited}
                onChange={(e) => setKeepInherited(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-600"
              />
              <span>
                <strong>Keep its current categories.</strong> A pack with no category links of its own
                inherits its product’s. Its first explicit link ends that, so it would vanish from every
                other category unless they are copied across. Untick only if this pack should appear
                <em> here and nowhere else</em>.
              </span>
            </label>
          )}

          {query.trim().length >= searchAPI.MIN_LENGTH && !searching && hits.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted-foreground">Nothing matches “{query.trim()}”.</p>
          )}

          {hits.length > 0 && (
            <div className="max-h-64 divide-y overflow-y-auto rounded border bg-background">
              {hits.map((h) => {
                const already = h.variationId ? inCategory.has(h.variationId) : false;
                return (
                  <div key={h.key} className="flex items-center gap-2.5 px-2.5 py-2">
                    {thumb(h.image, h.name)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{h.name}</p>
                      {h.sku && <p className="truncate font-mono text-[11px] text-muted-foreground">{h.sku}</p>}
                    </div>
                    {already ? (
                      <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                        <Check className="h-3 w-3" /> In category
                      </Badge>
                    ) : (
                      <Button
                        type="button" size="sm" variant="outline"
                        className="h-7 shrink-0 px-2 text-xs"
                        disabled={busy === h.key}
                        onClick={() => (grain === 'product' ? addProduct(h) : addSku(h))}
                      >
                        {busy === h.key
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <><Plus className="mr-1 h-3.5 w-3.5" /> Add</>}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {notice && (
        <div
          className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
            notice.kind === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-destructive/50 bg-destructive/10 text-destructive'
          }`}
        >
          {notice.kind === 'ok' ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* ── Current contents ──────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            In this category
          </p>
          <span className="text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${total.toLocaleString('en-IN')} SKU${total === 1 ? '' : 's'}`}
          </span>
        </div>

        {listError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
            {listError}
          </div>
        )}

        <div className="divide-y rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading products…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nothing is in this category yet.
            </div>
          ) : (
            rows.map((r) => {
              // A row can only be here two ways. If its PRODUCT is linked, that
              // is what put it here (or inheritance from it). If the product is
              // NOT linked, the pack must carry its own explicit link.
              const viaProduct = r.productCategoryIds.includes(categoryId);
              return (
                <div key={r.variationId} className="flex items-center gap-2.5 px-2.5 py-2">
                  {thumb(r.image, r.name)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm">{r.name}</p>
                      {r.isActive === false && <Badge variant="secondary" className="shrink-0 text-[10px]">Inactive</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      {r.sku && <p className="truncate font-mono text-[11px] text-muted-foreground">{r.sku}</p>}
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[10px] ${viaProduct ? '' : 'border-violet-300 text-violet-700 dark:text-violet-300'}`}
                        title={viaProduct
                          ? 'Linked through the product — all of its packs are in this category'
                          : 'This pack carries its own link to this category'}
                      >
                        {viaProduct ? 'Product' : 'SKU'}
                      </Badge>
                    </div>
                  </div>
                  <Link
                    to={`/products/${r.productId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Open the product in a new tab"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  {canManage && (
                    <Button
                      type="button" size="sm" variant="ghost"
                      className="h-7 w-7 shrink-0 p-0 text-destructive"
                      disabled={busy === r.variationId}
                      onClick={() => removeRow(r)}
                      aria-label={`Remove ${r.name} from ${categoryName}`}
                    >
                      {busy === r.variationId
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {total > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString('en-IN')}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button" variant="outline" size="sm" className="h-7 px-2"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <span>Page {page + 1} of {lastPage + 1}</span>
              <Button
                type="button" variant="outline" size="sm" className="h-7 px-2"
                disabled={page >= lastPage || loading}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Changes here save immediately to the product, not with the category form below.
        {' '}The Filter tab can still narrow what this category shows on the storefront.
      </p>
    </div>
  );
};

export default CategoryProductsPanel;
