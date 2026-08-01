import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { attributesAPI, productsAPI, variantGroupsAPI } from '../../services/api';

/**
 * The Variants tab.
 *
 * Two worlds:
 *  1. Products that already carry legacy per-row variation rows keep the
 *     classic matrix editor (passed in as `legacyEditor` so its props/state
 *     stay wired exactly as before — ProductAttributeVariations itself is
 *     untouched).
 *  2. Everything else manages variants as LINKED FULL PRODUCTS via
 *     /variant-groups: each variant is its own product (own price, images,
 *     SEO, stock) linked into a group; the storefront PDP shows the group as
 *     a variant switcher keyed on the group's display attribute.
 */

export interface VariantGroupMember {
  product_id: string;
  name: string;
  slug?: string;
  sku?: string;
  image?: string | null;
  attribute_value?: string;
  sort_order?: number;
  is_default?: boolean;
  mrp?: number | string | null;
  selling_price?: number | string | null;
  sale_price?: number | string | null;
  in_stock?: boolean;
  is_current?: boolean;
  is_active?: boolean;
}

export interface VariantGroupInfo {
  id: string;
  name: string;
  display_attribute_slug?: string | null;
  is_active?: boolean;
  members?: VariantGroupMember[];
}

interface ProductVariantGroupPanelProps {
  /** Resolved product UUID (NOT the slug URL param). Empty for unsaved products. */
  productId?: string;
  productName: string;
  hasLegacyVariations: boolean;
  /** The existing ProductAttributeVariations mount (props owned by ProductForm). */
  legacyEditor?: React.ReactNode;
  /** `variant_group` from the admin product detail (hydrated members), if any. */
  initialGroup?: VariantGroupInfo | null;
}

interface AttributeOpt { _id?: string; id?: string; name?: string; slug?: string }

const inputCls = 'px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400 w-full';
const money = (v: any) => (v == null || v === '' ? null : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }));

const extractProducts = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.data?.data)) return raw.data.data;
  return [];
};

const sortMembers = (members: VariantGroupMember[]): VariantGroupMember[] =>
  [...members].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

const ProductVariantGroupPanel: React.FC<ProductVariantGroupPanelProps> = ({
  productId, productName, hasLegacyVariations, legacyEditor, initialGroup,
}) => {
  const navigate = useNavigate();

  const [group, setGroup] = useState<VariantGroupInfo | null>(initialGroup || null);
  const [members, setMembers] = useState<VariantGroupMember[]>(sortMembers(initialGroup?.members || []));
  const [membersDirty, setMembersDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group meta (editable alongside members — same PUT)
  const [groupName, setGroupName] = useState(initialGroup?.name || '');
  const [displayAttr, setDisplayAttr] = useState(initialGroup?.display_attribute_slug || '');

  // Attribute picker options
  const [attributes, setAttributes] = useState<AttributeOpt[]>([]);

  // Create-group form
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  // Add-variant modal
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [variantValue, setVariantValue] = useState('');
  const [variantName, setVariantName] = useState('');
  const [variantNameTouched, setVariantNameTouched] = useState(false);
  const [addingVariant, setAddingVariant] = useState(false);

  // Link-existing search
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<any[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    attributesAPI.list({ isActive: true }).then((list: any[]) => setAttributes(Array.isArray(list) ? list : []));
  }, []);

  // Re-sync when the product (re)loads and brings its variant_group along.
  useEffect(() => {
    setGroup(initialGroup || null);
    setMembers(sortMembers(initialGroup?.members || []));
    setGroupName(initialGroup?.name || '');
    setDisplayAttr(initialGroup?.display_attribute_slug || '');
    setMembersDirty(false);
  }, [initialGroup?.id]); // eslint-disable-line

  useEffect(() => {
    if (!createName) setCreateName(productName || '');
  }, [productName]); // eslint-disable-line

  const refreshGroup = async (groupId: string) => {
    setLoading(true);
    setError(null);
    try {
      const g: any = await variantGroupsAPI.getById(groupId);
      const fresh: VariantGroupInfo | null = g?.id ? g : (g?.data?.id ? g.data : null);
      if (!fresh) throw new Error('Group not found');
      const freshMembers = sortMembers(fresh.members || []);
      // If THIS product is no longer a member, the panel is back to "no group".
      if (productId && !freshMembers.some(m => m.product_id === productId)) {
        setGroup(null); setMembers([]); setMembersDirty(false);
        return;
      }
      setGroup(fresh);
      setMembers(freshMembers);
      setGroupName(fresh.name || '');
      setDisplayAttr(fresh.display_attribute_slug || '');
      setMembersDirty(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load variant group');
    } finally {
      setLoading(false);
    }
  };

  // ── actions ────────────────────────────────────────────────────────────────

  const handleCreateGroup = async () => {
    if (!productId) return;
    const name = (createName || productName || '').trim();
    if (!name) { setError('Group name is required'); return; }
    setCreating(true);
    setError(null);
    try {
      const res: any = await variantGroupsAPI.create({
        name,
        displayAttributeSlug: displayAttr.trim() || undefined,
        isActive: true,
        members: [{ productId, attributeValue: '', sortOrder: 0, isDefault: true }],
      });
      const created = res?.id ? res : (res?.data?.id ? res.data : null);
      if (!created?.id) throw new Error('Create returned no group');
      await refreshGroup(created.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to create variant group');
    } finally {
      setCreating(false);
    }
  };

  const updateMember = (idx: number, patch: Partial<VariantGroupMember>) => {
    setMembers(prev => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
    setMembersDirty(true);
  };

  const setDefault = (idx: number) => {
    setMembers(prev => prev.map((m, i) => ({ ...m, is_default: i === idx })));
    setMembersDirty(true);
  };

  const move = (idx: number, dir: -1 | 1) => {
    setMembers(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setMembersDirty(true);
  };

  const handleSaveMembers = async () => {
    if (!group) return;
    setSaving(true);
    setError(null);
    try {
      await variantGroupsAPI.update(group.id, {
        name: groupName.trim() || group.name,
        displayAttributeSlug: displayAttr.trim() || undefined,
        isActive: group.is_active !== false,
        members: members.map((m, i) => ({
          productId: m.product_id,
          attributeValue: (m.attribute_value || '').trim(),
          sortOrder: i,
          isDefault: !!m.is_default,
        })),
      });
      await refreshGroup(group.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save members');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (member: VariantGroupMember) => {
    if (!group) return;
    const label = member.is_current ? 'this product' : `"${member.name}"`;
    if (!window.confirm(`Remove ${label} from the variant group? The product itself is NOT deleted.`)) return;
    setError(null);
    try {
      await variantGroupsAPI.removeMember(group.id, member.product_id);
      await refreshGroup(group.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to remove member');
    }
  };

  const openAddVariant = () => {
    setVariantValue('');
    setVariantName('');
    setVariantNameTouched(false);
    setShowAddVariant(true);
  };

  const handleAddVariant = async () => {
    if (!group || !productId) return;
    const value = variantValue.trim();
    if (!value) { setError('Attribute value is required'); return; }
    setAddingVariant(true);
    setError(null);
    try {
      const created: any = await productsAPI.duplicateAsVariant(productId, {
        name: (variantName.trim() || `${productName} ${value}`).trim(),
        joinGroupId: group.id,
        attributeValue: value,
      });
      const p = created?.id || created?.slug ? created : (created?.data ?? created);
      if (!p?.id && !p?.slug) throw new Error('Duplicate returned no product');
      setShowAddVariant(false);
      alert('Variant created as a draft product — set its price/images and activate it.');
      navigate(`/products/${p.slug || p.id}/edit`);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to create variant');
    } finally {
      setAddingVariant(false);
    }
  };

  const runLinkSearch = async (q: string) => {
    if (!q.trim()) { setLinkResults([]); return; }
    setLinkSearching(true);
    try {
      const res: any = await productsAPI.getAll({ search: q.trim(), limit: 10 });
      const memberIds = new Set(members.map(m => m.product_id));
      setLinkResults(extractProducts(res)
        .map((p: any) => ({ id: p.id ?? p._id, name: p.name, slug: p.slug, sku: p.sku, image: p.images?.[0] }))
        .filter((p: any) => p.id && !memberIds.has(p.id)));
    } catch {
      setLinkResults([]);
    } finally {
      setLinkSearching(false);
    }
  };

  const onLinkQueryChange = (q: string) => {
    setLinkQuery(q);
    if (linkTimer.current) clearTimeout(linkTimer.current);
    linkTimer.current = setTimeout(() => runLinkSearch(q), 350);
  };

  const handleLinkProduct = async (p: any) => {
    if (!group) return;
    setLinking(true);
    setError(null);
    try {
      await variantGroupsAPI.addMember(group.id, { productId: p.id, attributeValue: '' });
      setLinkQuery('');
      setLinkResults([]);
      setShowLinkSearch(false);
      await refreshGroup(group.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to link product');
    } finally {
      setLinking(false);
    }
  };

  // ── render: legacy matrix ──────────────────────────────────────────────────

  if (hasLegacyVariations) {
    return (
      <div className="space-y-4">
        <div className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          This product uses the <span className="font-semibold">classic variation matrix</span>.
          New products can manage variants as linked full products.
        </div>
        {legacyEditor}
      </div>
    );
  }

  // ── render: linked-products manager ───────────────────────────────────────

  const attrPicker = (value: string, onChange: (v: string) => void) => (
    attributes.length > 0 ? (
      <select className={inputCls} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— none —</option>
        {attributes.map(a => {
          const slug = a.slug || a.name || '';
          return <option key={a._id || a.id || slug} value={slug}>{a.name || slug}</option>;
        })}
        {value && !attributes.some(a => (a.slug || a.name) === value) && (
          <option value={value}>{value}</option>
        )}
      </select>
    ) : (
      <input className={inputCls} value={value} onChange={e => onChange(e.target.value)}
        placeholder="e.g. brand or potency" />
    )
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Variants — linked products</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Each variant is a full product (own price, images, stock, SEO) linked into a group.
          The product page shows the group as a variant switcher.
        </p>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">{error}</p>}

      {!productId ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-sm text-gray-500">Save the product first, then link its variants here.</p>
        </div>
      ) : loading ? (
        <p className="text-sm text-gray-400 py-4">Loading variant group…</p>
      ) : !group ? (
        /* ── Create group ── */
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-gray-800">Create variant group</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Group name</label>
              <input className={inputCls} value={createName} onChange={e => setCreateName(e.target.value)}
                placeholder={productName || 'e.g. Arnica Montana'} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Display attribute</label>
              {attrPicker(displayAttr, setDisplayAttr)}
              <p className="text-[11px] text-gray-400 mt-0.5">The attribute whose value labels each variant in the switcher.</p>
            </div>
          </div>
          <button type="button" onClick={handleCreateGroup} disabled={creating}
            className="px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {creating ? 'Creating…' : 'Create variant group'}
          </button>
          <p className="text-[11px] text-gray-400">This product becomes the group's first (default) variant.</p>
        </div>
      ) : (
        /* ── Group manager ── */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Group name</label>
              <input className={inputCls} value={groupName}
                onChange={e => { setGroupName(e.target.value); setMembersDirty(true); }} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Display attribute</label>
              {attrPicker(displayAttr, v => { setDisplayAttr(v); setMembersDirty(true); })}
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Product</th>
                  <th className="px-3 py-2 text-left font-medium">SKU</th>
                  <th className="px-3 py-2 text-left font-medium">Price</th>
                  <th className="px-3 py-2 text-left font-medium">Stock</th>
                  <th className="px-3 py-2 text-left font-medium">Attribute value</th>
                  <th className="px-3 py-2 text-center font-medium">Default</th>
                  <th className="px-3 py-2 text-center font-medium">Order</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((m, idx) => (
                  <tr key={m.product_id} className={m.is_current ? 'bg-red-50/40' : undefined}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {m.image ? (
                          <img src={m.image} alt="" className="w-8 h-8 rounded object-cover border border-gray-200 shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-100 border border-gray-200 shrink-0" />
                        )}
                        <div className="min-w-0">
                          {m.is_current ? (
                            <span className="font-medium text-gray-900 truncate block">{m.name} <span className="text-[10px] text-red-600 font-semibold">(this product)</span></span>
                          ) : (
                            <Link to={`/products/${m.slug || m.product_id}/edit`}
                              className="font-medium text-blue-700 hover:underline truncate block">{m.name}</Link>
                          )}
                          {m.is_active === false && <span className="text-[10px] text-amber-600 font-medium">Draft / inactive</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{m.sku || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {money(m.sale_price) != null ? (
                        <>
                          <span className="font-semibold text-gray-900">₹{money(m.sale_price)}</span>
                          {money(m.selling_price) != null && <span className="text-xs text-gray-400 line-through ml-1">₹{money(m.selling_price)}</span>}
                        </>
                      ) : money(m.selling_price) != null ? (
                        <span className="font-semibold text-gray-900">₹{money(m.selling_price)}</span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {m.in_stock === false
                        ? <span className="text-[10px] font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Out of stock</span>
                        : <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">In stock</span>}
                    </td>
                    <td className="px-3 py-2 w-40">
                      <input className={inputCls} value={m.attribute_value || ''}
                        onChange={e => updateMember(idx, { attribute_value: e.target.value })}
                        placeholder="e.g. SBL / 30 CH" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="radio" name="vg-default" checked={!!m.is_default}
                        onChange={() => setDefault(idx)} className="w-4 h-4 text-red-600" />
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                        className="px-1.5 py-0.5 text-gray-500 hover:text-gray-900 disabled:opacity-25" title="Move up">↑</button>
                      <button type="button" onClick={() => move(idx, 1)} disabled={idx === members.length - 1}
                        className="px-1.5 py-0.5 text-gray-500 hover:text-gray-900 disabled:opacity-25" title="Move down">↓</button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => handleRemoveMember(m)}
                        className="text-gray-300 hover:text-red-500" title="Remove from group (does not delete the product)">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={openAddVariant}
              className="px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700">
              + Add variant
            </button>
            <button type="button" onClick={() => setShowLinkSearch(v => !v)}
              className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">
              Link existing product
            </button>
            <div className="flex-1" />
            <button type="button" onClick={handleSaveMembers} disabled={saving || !membersDirty}
              className="px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-40"
              title={membersDirty ? 'Save attribute values, order & default' : 'No member changes'}>
              {saving ? 'Saving…' : 'Save Members'}
            </button>
          </div>

          {showLinkSearch && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Search a product to link into this group</label>
              <input className={inputCls} value={linkQuery} onChange={e => onLinkQueryChange(e.target.value)}
                placeholder="Search by name or SKU…" autoFocus />
              {linkSearching && <p className="text-xs text-gray-400">Searching…</p>}
              {!linkSearching && linkResults.length > 0 && (
                <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded">
                  {linkResults.map(p => (
                    <button key={p.id} type="button" onClick={() => handleLinkProduct(p)} disabled={linking}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50">
                      {p.image
                        ? <img src={p.image} alt="" className="w-7 h-7 rounded object-cover border border-gray-200" />
                        : <div className="w-7 h-7 rounded bg-gray-100 border border-gray-200" />}
                      <span className="font-medium text-gray-800 truncate">{p.name}</span>
                      {p.sku && <span className="text-xs font-mono text-gray-400">{p.sku}</span>}
                    </button>
                  ))}
                </div>
              )}
              {!linkSearching && linkQuery.trim() && linkResults.length === 0 && (
                <p className="text-xs text-gray-400">No matching products (already-linked products are hidden).</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Add-variant modal ── */}
      {showAddVariant && group && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Add variant</h3>
            <p className="text-xs text-gray-500 mb-4">
              Creates an inactive copy of this product and links it into the group. You'll be taken to the copy to set its price, images and stock.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Attribute value <span className="text-red-500">*</span>
                </label>
                <input className={inputCls} value={variantValue} autoFocus
                  onChange={e => {
                    setVariantValue(e.target.value);
                    if (!variantNameTouched) setVariantName(`${productName} ${e.target.value}`.trim());
                  }}
                  placeholder='e.g. "SBL" or "200 CH"'
                  onKeyDown={e => e.key === 'Enter' && handleAddVariant()} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Name (optional override)</label>
                <input className={inputCls} value={variantName}
                  onChange={e => { setVariantName(e.target.value); setVariantNameTouched(true); }}
                  placeholder={`${productName} <value>`} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={handleAddVariant} disabled={addingVariant || !variantValue.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {addingVariant ? 'Creating…' : 'Create draft variant'}
              </button>
              <button type="button" onClick={() => setShowAddVariant(false)}
                className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductVariantGroupPanel;
