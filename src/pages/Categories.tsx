/**
 * Categories — hierarchy manager for the storefront.
 *
 * Layout: a searchable parent/child TREE on the left, a TABBED editor on the
 * right (Basics · SEO · Filter · Featured). The page previously listed every
 * category flat — with 560+ of them the hierarchy was invisible — and stacked
 * every field into one long scroll, so the attribute filter and SEO fields sat
 * below the fold and were routinely missed.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Save, RotateCcw, Trash2, Search, ChevronRight, ChevronDown,
  Star, EyeOff, FolderTree, ExternalLink, Filter as FilterIcon, Boxes, Circle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { categoriesAPI, attributesAPI } from '../services/api';
import ImageInputWithActions from '../components/common/ImageInputWithActions';
import IconPicker, { getIconComponent } from '../components/IconPicker';
import CategoryFeaturedPicker, { FeaturedMode, FeaturedValue } from '../components/category/CategoryFeaturedPicker';
import CategoryProductsPanel from '../components/category/CategoryProductsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
  isPublic?: boolean;
  parent?: string | null;
  featuredMode?: FeaturedMode;
  featuredProductIds?: string[];
  featuredBrandIds?: string[];
  featuredLimit?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * GET /categories returns RAW snake_case rows — `id`, `parent_id`, `is_active`,
 * `image_url`, `display_order`, `meta_*` — with no camelCase transform in
 * `categoriesAPI`. Reading `_id` / `parent` / `isActive` therefore silently
 * yielded undefined, which had a nasty consequence: because `parent` was always
 * undefined, the edit form fell back to "none" and every save posted
 * `parent: null`, DETACHING the category from its parent. 536 of the 566
 * categories here have a parent, so editing any of them quietly flattened the
 * tree.
 *
 * Normalising once, on fetch, is the fix: everything below this line works with
 * one predictable shape. Both spellings are accepted so the page keeps working
 * if a camelCase transform is ever added upstream.
 */
function normalizeCategory(raw: any): Category {
  const g = (camel: string, snake: string, fallback: any = undefined) =>
    raw?.[camel] ?? raw?.[snake] ?? fallback;
  const parent = g('parent', 'parent_id', null);
  return {
    _id: String(raw?._id ?? raw?.id ?? ''),
    name: raw?.name ?? '',
    slug: raw?.slug ?? '',
    description: raw?.description ?? '',
    imageUrl: g('imageUrl', 'image_url', '') ?? '',
    icon: raw?.icon ?? '',
    displayOrder: Number(g('displayOrder', 'display_order', 0)) || 0,
    isActive: g('isActive', 'is_active', true) !== false,
    isPublic: g('isPublic', 'is_public', true) !== false,
    parent: parent ? String(parent) : null,
    featuredMode: (g('featuredMode', 'featured_mode', 'off') || 'off') as FeaturedMode,
    featuredProductIds: g('featuredProductIds', 'featured_product_ids', []) ?? [],
    featuredBrandIds: g('featuredBrandIds', 'featured_brand_ids', []) ?? [],
    featuredLimit: Number(g('featuredLimit', 'featured_limit', 10)) || 10,
    // Carried through for the editor (SEO + attribute filter tabs).
    ...{
      metaTitle: g('metaTitle', 'meta_title', ''),
      metaDesc: g('metaDesc', 'meta_desc', ''),
      ogImageUrl: g('ogImageUrl', 'og_image_url', ''),
      filterAttributeSlug: g('filterAttributeSlug', 'filter_attribute_slug', ''),
      filterAttributeValue: g('filterAttributeValue', 'filter_attribute_value', ''),
    } as any,
  };
}

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  imageUrl: '',
  icon: '',
  displayOrder: '',
  parent: 'none',
  isActive: true,
  isPublic: true,
  metaTitle: '',
  metaDesc: '',
  ogImageUrl: '',
  // Category → attribute FILTER: show only / hide variations whose attribute value matches.
  filterAttributeSlug: '',
  filterAttributeValue: '',
  filterAttributeMode: 'only', // 'only' (show only matching) | 'exclude' (hide matching)
};

const emptyFeatured: FeaturedValue = { mode: 'off', productIds: [], brandIds: [], limit: 10 };

/** Where a saved category can be previewed. Same env var Settings/PageBuilder read. */
const STOREFRONT_URL = (import.meta as any).env?.VITE_STOREFRONT_URL || 'http://localhost:3000';

/** Read a field that may arrive camelCase (admin transform) or snake_case (raw row). */
const pick = (o: any, camel: string, snake: string, fallback: any = undefined) =>
  o?.[camel] ?? o?.[snake] ?? fallback;

const Categories: React.FC = () => {
  const { hasPerm } = useAuth();
  // Backend requires products.manage for create/update, products.delete for
  // removal (routes/categories.ts) — this page had NO client-side gating at
  // all before, so every staff member with just page-level access saw fully
  // live create/edit/delete controls regardless of their actual permissions.
  const canManageCategories = hasPerm('products.manage');
  const canDeleteCategories = hasPerm('products.delete');
  const [categories, setCategories] = useState<Category[]>([]);
  const [attributes, setAttributes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState({ ...emptyForm });
  const [featured, setFeatured] = useState<FeaturedValue>({ ...emptyFeatured });
  const [error, setError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [tab, setTab] = useState('basics');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /**
   * Snapshot of the form as it was loaded, so an unsaved edit can be detected.
   * Clicking another category in the tree used to blow away in-progress typing
   * with no warning at all — easy to do on a 566-row tree.
   */
  const baseline = useRef<string>(JSON.stringify({ ...emptyForm, __f: emptyFeatured }));
  const dirty = JSON.stringify({ ...formState, __f: featured }) !== baseline.current;

  /** Ask before throwing away unsaved edits; returns false to cancel the switch. */
  const confirmDiscard = () =>
    !dirty || confirm('You have unsaved changes on this category. Discard them?');

  useEffect(() => {
    fetchCategories();
    attributesAPI.list({ isActive: true })
      .then((a: any) => setAttributes(Array.isArray(a) ? a : []))
      .catch(() => setAttributes([]));
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response = await categoriesAPI.list();
      let rows: any[] = [];
      if (Array.isArray(response)) rows = response;
      else if (Array.isArray(response?.data)) rows = response.data;
      else if (Array.isArray(response?.data?.data)) rows = response.data.data;
      setCategories(rows.map(normalizeCategory).filter((c) => c._id));
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch categories', err);
      setError(err?.message || 'Failed to fetch categories');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedId(null);
    setFormState({ ...emptyForm });
    setFeatured({ ...emptyFeatured });
    baseline.current = JSON.stringify({ ...emptyForm, __f: emptyFeatured });
    setError(null);
    setImageError(null);
    setImageUploading(false);
    setTab('basics');
  };

  const handleEdit = (category: any) => {
    setSelectedId(category._id);
    const rawFilterValue = String(pick(category, 'filterAttributeValue', 'filter_attribute_value', '') ?? '');
    const loaded = {
      name: category.name || '',
      slug: category.slug || '',
      description: category.description || '',
      imageUrl: category.imageUrl || '',
      icon: category.icon || '',
      displayOrder:
        category.displayOrder !== undefined && category.displayOrder !== null
          ? String(category.displayOrder) : '',
      parent: category.parent ? String(category.parent) : 'none',
      isActive: category.isActive !== false,
      isPublic: category.isPublic !== false,
      metaTitle: pick(category, 'metaTitle', 'meta_title', '') ?? '',
      metaDesc: pick(category, 'metaDesc', 'meta_desc', '') ?? '',
      ogImageUrl: pick(category, 'ogImageUrl', 'og_image_url', '') ?? '',
      filterAttributeSlug: pick(category, 'filterAttributeSlug', 'filter_attribute_slug', '') ?? '',
      // A leading "!" in the stored value means EXCLUDE (hide matching); else INCLUDE.
      filterAttributeValue: rawFilterValue.replace(/^!/, ''),
      filterAttributeMode: rawFilterValue.startsWith('!') ? 'exclude' : 'only',
    };
    const loadedFeatured: FeaturedValue = {
      mode: (category.featuredMode || 'off') as FeaturedMode,
      productIds: category.featuredProductIds ?? [],
      brandIds: category.featuredBrandIds ?? [],
      limit: Number(category.featuredLimit) || 10,
    };
    setFormState(loaded);
    setFeatured(loadedFeatured);
    baseline.current = JSON.stringify({ ...loaded, __f: loadedFeatured });
    setError(null);
    setImageError(null);
    setImageUploading(false);
    setTab('basics');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formState.name.trim()) {
      setError('Category name is required');
      setTab('basics');
      return;
    }
    if (imageUploading) {
      setError('Please wait for the image upload to finish before saving.');
      return;
    }
    if (imageError) {
      setError(imageError);
      return;
    }
    // Catch a half-configured shelf here rather than letting it save as a
    // silently-inactive setting the merchant thinks is live.
    if (featured.mode === 'manual' && featured.productIds.length === 0) {
      setError('Pick at least one product for the featured shelf, or switch it back to Default order.');
      setTab('featured');
      return;
    }
    if (featured.mode === 'brand' && featured.brandIds.length === 0) {
      setError('Pick at least one brand for the featured shelf, or switch it back to Default order.');
      setTab('featured');
      return;
    }

    setSaving(true);
    setError(null);

    const payload: Record<string, any> = {
      name: formState.name.trim(),
      description: formState.description?.trim() || undefined,
      imageUrl: formState.imageUrl?.trim() || undefined,
      icon: formState.icon?.trim() || undefined,
      displayOrder: formState.displayOrder ? Number(formState.displayOrder) : undefined,
      isActive: formState.isActive,
      isPublic: formState.isPublic,
      parent: formState.parent && formState.parent !== 'none' ? formState.parent : null,
      metaTitle: formState.metaTitle?.trim() || undefined,
      metaDesc: formState.metaDesc?.trim() || undefined,
      ogImageUrl: formState.ogImageUrl?.trim() || undefined,
      // null (not undefined) so clearing the mapping actually unsets it on update.
      // Exclude mode is encoded as a leading "!" on the value (no schema change).
      filterAttributeSlug: formState.filterAttributeSlug?.trim() || null,
      filterAttributeValue: (() => {
        const slug = formState.filterAttributeSlug?.trim();
        const val = formState.filterAttributeValue?.trim();
        if (!slug || !val) return null;
        return formState.filterAttributeMode === 'exclude' ? `!${val}` : val;
      })(),
      // Featured shelf — always sent, so switching back to "Default order"
      // actually clears it instead of leaving the old pins in the database.
      featuredMode: featured.mode,
      featuredProductIds: featured.mode === 'manual' ? featured.productIds : [],
      featuredBrandIds: featured.mode === 'brand' ? featured.brandIds : [],
      featuredLimit: featured.limit,
    };

    if (formState.slug?.trim()) payload.slug = formState.slug.trim();

    try {
      const saved = selectedId
        ? await categoriesAPI.update(selectedId, payload)
        : await categoriesAPI.create(payload);
      await fetchCategories();
      // Stay on the category that was just saved instead of clearing the editor.
      // A brand-new one especially: its Products tab needs an id to exist, so
      // dropping the selection meant hunting for it in a 566-row tree first.
      const row = (saved as any)?.data ?? saved;
      if (row && (row.id || row._id)) {
        handleEdit(normalizeCategory(row));
        setTab(tab);
      } else {
        resetForm();
      }
    } catch (err: any) {
      console.error('Failed to save category', err);
      setError(err?.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category: Category) => {
    if (!confirm(`Delete category "${category.name}"?`)) return;
    setError(null);
    try {
      await categoriesAPI.delete(category._id);
      await fetchCategories();
      if (selectedId === category._id) resetForm();
    } catch (err: any) {
      console.error('Failed to delete category', err);
      setError(err?.message || 'Failed to delete category');
    }
  };

  const parentOptions = useMemo(
    () => categories.filter((cat) => cat._id !== selectedId),
    [categories, selectedId],
  );

  const byId = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach((c) => m.set(c._id, c));
    return m;
  }, [categories]);

  /** The slug as SAVED — the form's own slug field may be blank (auto-generate) or mid-edit. */
  const savedSlug = selectedId ? byId.get(selectedId)?.slug ?? '' : '';

  /** Ancestor path of the category being edited, e.g. "Homeopathy › Drops". */
  const breadcrumb = useMemo(() => {
    const startId = formState.parent && formState.parent !== 'none' ? formState.parent : null;
    if (!startId) return '';
    const names: string[] = [];
    const seen = new Set<string>();
    let cur = byId.get(String(startId));
    while (cur && !seen.has(cur._id)) {
      seen.add(cur._id); // a cycle in the data must not hang the page
      names.unshift(cur.name);
      cur = cur.parent ? byId.get(String(cur.parent)) : undefined;
    }
    return names.join(' › ');
  }, [formState.parent, byId]);

  /**
   * Build the tree. A category whose parent is missing (deleted, or simply not
   * returned) is treated as a root so it can never become unreachable — with
   * 560+ categories an orphan would otherwise be invisible AND uneditable.
   */
  const { roots, childrenOf } = useMemo(() => {
    const kids = new Map<string, Category[]>();
    const tops: Category[] = [];
    for (const c of categories) {
      const parentId = c.parent ? String(c.parent) : null;
      if (parentId && byId.has(parentId)) {
        if (!kids.has(parentId)) kids.set(parentId, []);
        kids.get(parentId)!.push(c);
      } else {
        tops.push(c);
      }
    }
    const sort = (a: Category, b: Category) =>
      (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name);
    tops.sort(sort);
    kids.forEach((v) => v.sort(sort));
    return { roots: tops, childrenOf: kids };
  }, [categories, byId]);

  // Searching flattens the tree — matches are what matter, not their depth.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.slug || '').toLowerCase().includes(q),
    );
  }, [search, categories]);

  const isFeatured = (c: Category) => (c.featuredMode || 'off') !== 'off';

  const Row: React.FC<{ c: Category; depth: number }> = ({ c, depth }) => {
    const kids = childrenOf.get(c._id) ?? [];
    const open = expanded[c._id] ?? false;
    const selected = selectedId === c._id;
    return (
      <>
        <div
          className={`group flex items-center gap-1 px-2 py-1.5 border-b last:border-b-0 transition-colors ${
            selected ? 'bg-primary/10' : 'hover:bg-muted/50'
          }`}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((s) => ({ ...s, [c._id]: !open }))}
              className="h-5 w-5 shrink-0 grid place-items-center text-muted-foreground hover:text-foreground"
              aria-label={open ? 'Collapse' : 'Expand'}
            >
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}

          <button
            type="button"
            onClick={() => { if (confirmDiscard()) handleEdit(c); }}
            className="flex-1 min-w-0 text-left flex items-center gap-2 py-0.5"
          >
            <span className={`truncate text-sm ${selected ? 'font-semibold' : ''}`}>{c.name}</span>
            {isFeatured(c) && (
              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Has a featured shelf" />
            )}
            {c.isActive === false && <Badge variant="secondary" className="text-[10px] shrink-0">Inactive</Badge>}
            {c.isPublic === false && <EyeOff className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-label="Hidden from storefront" />}
            {kids.length > 0 && (
              <span className="text-[11px] text-muted-foreground shrink-0">{kids.length}</span>
            )}
          </button>

          {canDeleteCategories && (
            <Button
              variant="ghost" size="sm"
              className="h-6 w-6 p-0 text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100"
              onClick={() => handleDelete(c)}
              aria-label={`Delete ${c.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {open && kids.map((k) => <Row key={k._id} c={k} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground">
            Manage the storefront hierarchy, filters and featured products.
          </p>
        </div>
        {canManageCategories && (
          <Button onClick={() => { if (confirmDiscard()) resetForm(); }} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New Category
          </Button>
        )}
      </div>

      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* ── Tree ─────────────────────────────────────────────────────────── */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-3 border-b space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderTree className="h-4 w-4" /> Hierarchy
              </CardTitle>
              <span className="text-xs text-muted-foreground">{categories.length} total</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or slug…"
                className="pl-9 h-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[640px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center p-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : categories.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No categories yet — create one.
                </div>
              ) : matches ? (
                matches.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Nothing matches “{search}”.
                  </div>
                ) : (
                  matches.map((c) => <Row key={c._id} c={c} depth={0} />)
                )
              ) : (
                roots.map((c) => <Row key={c._id} c={c} depth={0} />)
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Editor ───────────────────────────────────────────────────────── */}
        <Card className="lg:col-span-3 shadow-sm">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="truncate">
                    {selectedId ? (formState.name || 'Untitled category') : 'Create Category'}
                  </span>
                  {dirty && (
                    <span title="Unsaved changes" className="shrink-0">
                      <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />
                    </span>
                  )}
                </CardTitle>
                {/* Where this category actually sits, and where to go look at it —
                    neither was visible before, so a merchant editing one of 536
                    child categories had no idea which branch they were in. */}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{breadcrumb || 'Top level'}</span>
                  {selectedId && savedSlug && (
                    <>
                      <span className="opacity-50">·</span>
                      <a
                        href={`${STOREFRONT_URL}/category/${savedSlug}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                      >
                        /category/{savedSlug} <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>
              {selectedId && (
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { if (confirmDiscard()) resetForm(); }}
                  className="h-8 shrink-0 px-2 text-muted-foreground"
                >
                  <RotateCcw className="mr-2 h-3.5 w-3.5" /> New
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              <Tabs value={tab} onValueChange={setTab}>
                {/* Each tab shows whether it holds anything, so a merchant can see
                    at a glance that (say) SEO is still empty without opening it. */}
                <TabsList className="mb-4 flex-wrap h-auto">
                  <TabsTrigger value="basics">Basics</TabsTrigger>
                  <TabsTrigger value="seo" className="gap-1.5">
                    SEO
                    {(formState.metaTitle?.trim() || formState.metaDesc?.trim()) && (
                      <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="filter" className="gap-1.5">
                    Filter
                    {formState.filterAttributeSlug && formState.filterAttributeValue && (
                      <FilterIcon className="h-3 w-3 text-sky-600" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="featured" className="gap-1.5">
                    Featured
                    {featured.mode !== 'off' && (
                      <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="products" className="gap-1.5">
                    <Boxes className="h-3.5 w-3.5" /> Products
                  </TabsTrigger>
                </TabsList>

                {/* Basics */}
                <TabsContent value="basics" className="m-0 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
                      <Input id="name" value={formState.name} required
                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                        placeholder="Category name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slug">Slug</Label>
                      <Input id="slug" value={formState.slug}
                        onChange={(e) => setFormState({ ...formState, slug: e.target.value })}
                        placeholder="Auto-generated if blank" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" rows={3} value={formState.description}
                      onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                      placeholder="Optional description" className="resize-y" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="parent">Parent Category</Label>
                      <Select value={formState.parent}
                        onValueChange={(val) => setFormState({ ...formState, parent: val })}>
                        <SelectTrigger id="parent"><SelectValue placeholder="No Parent" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No parent (top-level)</SelectItem>
                          {parentOptions.map((p) => (
                            <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="displayOrder">Display Order</Label>
                      <Input id="displayOrder" type="number" value={formState.displayOrder}
                        onChange={(e) => setFormState({ ...formState, displayOrder: e.target.value })}
                        placeholder="0" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Category Image</Label>
                    <ImageInputWithActions
                      value={formState.imageUrl || ''}
                      onChange={(url: string) => setFormState({ ...formState, imageUrl: url })}
                      folder="categories"
                      label="" placeholder="Image URL (https://...)" />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Icon (optional)</Label>
                    <div className="flex items-center gap-2">
                      {formState.icon && (
                        <>
                          {(() => {
                            const IC = getIconComponent(formState.icon);
                            return IC ? <IC size={18} className="text-gray-600 flex-shrink-0" /> : null;
                          })()}
                          <code className="text-xs text-muted-foreground truncate max-w-[140px]">{formState.icon}</code>
                        </>
                      )}
                      <IconPicker value={formState.icon || ''}
                        onChange={(id: string) => setFormState({ ...formState, icon: id })} />
                      {formState.icon && (
                        <Button type="button" variant="ghost" size="sm"
                          className="h-7 px-2 text-xs text-destructive"
                          onClick={() => setFormState({ ...formState, icon: '' })}>Remove</Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center space-x-2">
                      <Switch id="isActive" checked={formState.isActive}
                        onCheckedChange={(c) => setFormState({ ...formState, isActive: c })} />
                      <Label htmlFor="isActive" className="cursor-pointer">Category is active</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch id="isPublic" checked={formState.isPublic}
                        onCheckedChange={(c) => setFormState({ ...formState, isPublic: c })} />
                      <div>
                        <Label htmlFor="isPublic" className="cursor-pointer">Show in storefront</Label>
                        <p className="text-xs text-muted-foreground">Visible in navigation menus and category listings</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* SEO */}
                <TabsContent value="seo" className="m-0 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <Label htmlFor="metaTitle">Meta Title</Label>
                      {/* The storefront appends " | <store name>" to whatever is
                          typed here, so the budget that matters is well under 60. */}
                      <span className={`text-[11px] tabular-nums ${
                        formState.metaTitle.length > 50 ? 'text-orange-600' : 'text-muted-foreground'
                      }`}>
                        {formState.metaTitle.length}/50
                      </span>
                    </div>
                    <Input id="metaTitle" value={formState.metaTitle}
                      onChange={(e) => setFormState({ ...formState, metaTitle: e.target.value })}
                      placeholder="Defaults to the category name" />
                    <p className="text-[11px] text-muted-foreground">
                      The store name is added automatically — leave it out.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <Label htmlFor="metaDesc">Meta Description</Label>
                      <span className={`text-[11px] tabular-nums ${
                        formState.metaDesc.length > 160 ? 'text-orange-600' : 'text-muted-foreground'
                      }`}>
                        {formState.metaDesc.length}/160
                      </span>
                    </div>
                    <Textarea id="metaDesc" rows={3} value={formState.metaDesc}
                      onChange={(e) => setFormState({ ...formState, metaDesc: e.target.value })}
                      placeholder="Shown in search results (~160 characters)" className="resize-y" />
                  </div>
                  <div className="space-y-2">
                    <Label>Social Share Image (Open Graph)</Label>
                    <ImageInputWithActions
                      value={formState.ogImageUrl || ''}
                      onChange={(url: string) => setFormState({ ...formState, ogImageUrl: url })}
                      folder="categories"
                      label="" placeholder="OG image URL (https://...)" />
                  </div>
                </TabsContent>

                {/* Filter */}
                <TabsContent value="filter" className="m-0 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Filter by a product attribute
                  </p>
                  <p className="-mt-1 text-[11px] text-muted-foreground">
                    Show <strong>only</strong> — or <strong>hide</strong> — variations whose attribute value matches.
                    E.g. a “Dilutions” category with <em>Potency · Hide · Q</em> hides mother tinctures;
                    “Mother Tinctures” with <em>Potency · Only show · Q</em> shows only them. Leave blank to show everything.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Attribute</Label>
                      <Select
                        value={formState.filterAttributeSlug || 'none'}
                        onValueChange={(v) =>
                          setFormState({ ...formState, filterAttributeSlug: v === 'none' ? '' : v, filterAttributeValue: '' })}
                      >
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {attributes.map((a: any) => (
                            <SelectItem key={a.slug ?? a._id} value={a.slug}>{a.name ?? a.slug}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Mode</Label>
                      <Select value={formState.filterAttributeMode}
                        onValueChange={(v) => setFormState({ ...formState, filterAttributeMode: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="only">Only show</SelectItem>
                          <SelectItem value="exclude">Hide</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Value</Label>
                      {(() => {
                        const attr = attributes.find((a: any) => a.slug === formState.filterAttributeSlug);
                        const values: any[] = Array.isArray(attr?.values) ? attr.values : [];
                        if (!formState.filterAttributeSlug) {
                          return <Input disabled placeholder="Pick an attribute first" />;
                        }
                        if (values.length) {
                          return (
                            <Select
                              value={formState.filterAttributeValue || 'none'}
                              onValueChange={(v) =>
                                setFormState({ ...formState, filterAttributeValue: v === 'none' ? '' : v })}
                            >
                              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Any</SelectItem>
                                {values.map((val: any, i: number) => {
                                  const slug = val.slug ?? val.value ?? String(val);
                                  return <SelectItem key={`${slug}-${i}`} value={slug}>{val.name ?? val.label ?? slug}</SelectItem>;
                                })}
                              </SelectContent>
                            </Select>
                          );
                        }
                        return (
                          <Input value={formState.filterAttributeValue}
                            onChange={(e) => setFormState({ ...formState, filterAttributeValue: e.target.value })}
                            placeholder="Attribute value slug (e.g. dilution)" />
                        );
                      })()}
                    </div>
                  </div>
                </TabsContent>

                {/* Featured */}
                <TabsContent value="featured" className="m-0">
                  <CategoryFeaturedPicker
                    value={featured}
                    onChange={setFeatured}
                    categoryName={formState.name || undefined}
                  />
                </TabsContent>

                {/* Products — writes straight to the products, not to this form */}
                <TabsContent value="products" className="m-0">
                  <CategoryProductsPanel
                    categoryId={selectedId}
                    categoryName={formState.name || 'this category'}
                    canManage={canManageCategories}
                  />
                </TabsContent>
              </Tabs>

              {/* Sticky so the save action stays reachable on the long tabs
                  instead of sitting below the fold. */}
              <div className="sticky bottom-0 -mx-6 -mb-5 flex items-center gap-3 border-t bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                {canManageCategories && (
                  <Button type="submit" disabled={saving} className="flex-1">
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Saving…' : selectedId ? 'Update Category' : 'Create Category'}
                  </Button>
                )}
                {dirty && !saving && (
                  <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-amber-600 sm:flex">
                    <Circle className="h-2 w-2 fill-amber-500 text-amber-500" /> Unsaved
                  </span>
                )}
                <Button
                  type="button" variant="outline" className="flex-none"
                  onClick={() => { if (confirmDiscard()) resetForm(); }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Clear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Categories;
