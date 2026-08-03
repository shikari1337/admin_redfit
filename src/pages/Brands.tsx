import React, { useEffect, useMemo, useState } from 'react';
import { FaPlus, FaSave, FaUndo, FaTrash, FaSearch, FaGripVertical, FaArrowUp, FaArrowDown, FaTimes, FaPen } from 'react-icons/fa';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { brandsAPI } from '../services/api';
import ImageInputWithActions from '../components/common/ImageInputWithActions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Brand {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  /** Long-form brand story (HTML) shown on the brand page below the banner */
  content?: string;
  imageUrl?: string;
  logoUrl?: string;
  bannerUrl?: string;
  thumbnailUrl?: string;
  metaTitle?: string;
  metaDesc?: string;
  ogImageUrl?: string;
  displayOrder?: number;
  /** Listing preference (mig 110): 1 = this brand's products lead category pages. */
  preferenceRank?: number | null;
  isActive?: boolean;
  isFeatured?: boolean;
}

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  content: '',
  imageUrl: '',
  logoUrl: '',
  bannerUrl: '',
  thumbnailUrl: '',
  metaTitle: '',
  metaDesc: '',
  ogImageUrl: '',
  displayOrder: '',
  isActive: true,
  isFeatured: false,
};

const rankOf = (b: Brand): number | null => {
  const r = b.preferenceRank ?? (b as any).preference_rank;
  return r === undefined || r === null || r === '' ? null : Number(r);
};
const thumbOf = (b: Brand): string =>
  b.thumbnailUrl || (b as any).thumbnail_url || b.logoUrl || (b as any).logo_url || b.imageUrl || (b as any).image_url || '';

type StatusFilter = 'all' | 'active' | 'inactive' | 'featured' | 'ranked' | 'unranked';

/* ── Sortable row for the Preference order tab ─────────────────────────── */
function SortableRankRow({
  brand, index, total, onMove, onRemove,
}: {
  brand: Brand; index: number; total: number;
  onMove: (from: number, to: number) => void; onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: brand._id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const thumb = thumbOf(brand);
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-2 bg-background border rounded-md ${isDragging ? 'shadow-lg ring-2 ring-primary/40 z-10 relative' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        aria-label={`Drag to reorder ${brand.name}`}
        {...attributes}
        {...listeners}
      >
        <FaGripVertical className="h-4 w-4" />
      </button>
      <span className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-sm font-bold flex-shrink-0">
        {index + 1}
      </span>
      {thumb ? (
        <div className="h-8 w-8 flex-shrink-0 bg-white rounded border overflow-hidden">
          <img src={thumb} alt="" className="h-full w-full object-contain" />
        </div>
      ) : (
        <div className="h-8 w-8 flex-shrink-0 rounded border bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
          {brand.name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="flex-1 min-w-0 truncate font-medium text-sm">{brand.name}</span>
      {!brand.isActive && <Badge variant="secondary" className="text-xs flex-shrink-0">Inactive</Badge>}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === 0}
          onClick={() => onMove(index, index - 1)} aria-label="Move up">
          <FaArrowUp className="h-3 w-3" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === total - 1}
          onClick={() => onMove(index, index + 1)} aria-label="Move down">
          <FaArrowDown className="h-3 w-3" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(brand._id)} aria-label={`Remove ${brand.name} from ranking`}>
          <FaTimes className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

const Brands: React.FC = () => {
  const { toast } = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [formState, setFormState] = useState({ ...emptyForm });
  const [error, setError] = useState<string | null>(null);

  // list controls
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  // preference order tab
  const [rankedIds, setRankedIds] = useState<string[]>([]);
  const [initialRankedIds, setInitialRankedIds] = useState<string[]>([]);
  const [poolQuery, setPoolQuery] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    fetchBrands();
  }, []);

  const seedRanking = (data: Brand[]) => {
    const ranked = data
      .filter(b => rankOf(b) !== null)
      .sort((a, b) => (rankOf(a)! - rankOf(b)!) || a.name.localeCompare(b.name))
      .map(b => b._id);
    setRankedIds(ranked);
    setInitialRankedIds(ranked);
  };

  const fetchBrands = async () => {
    setLoading(true);
    try {
      const response = await brandsAPI.list();
      let data: any[] = [];
      if (Array.isArray(response)) {
        data = response;
      } else if (Array.isArray(response?.data)) {
        data = response.data;
      }
      data.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setBrands(data);
      seedRanking(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch brands', err);
      setError(err?.message || 'Failed to fetch brands');
      setBrands([]);
    } finally {
      setLoading(false);
    }
  };

  const byId = useMemo(() => new Map(brands.map(b => [b._id, b])), [brands]);

  const filteredBrands = useMemo(() => {
    const q = query.trim().toLowerCase();
    return brands.filter(b => {
      if (q && !`${b.name} ${b.slug}`.toLowerCase().includes(q)) return false;
      switch (status) {
        case 'active': return b.isActive !== false;
        case 'inactive': return b.isActive === false;
        case 'featured': return b.isFeatured === true;
        case 'ranked': return rankOf(b) !== null;
        case 'unranked': return rankOf(b) === null;
        default: return true;
      }
    });
  }, [brands, query, status]);

  const rankedBrands = useMemo(
    () => rankedIds.map(id => byId.get(id)).filter(Boolean) as Brand[],
    [rankedIds, byId]);
  const unrankedBrands = useMemo(() => {
    const inList = new Set(rankedIds);
    const q = poolQuery.trim().toLowerCase();
    return brands
      .filter(b => !inList.has(b._id))
      .filter(b => !q || `${b.name} ${b.slug}`.toLowerCase().includes(q));
  }, [brands, rankedIds, poolQuery]);
  const orderDirty = useMemo(
    () => rankedIds.join('|') !== initialRankedIds.join('|'),
    [rankedIds, initialRankedIds]);

  /* ── editor ── */

  const openCreate = () => {
    setSelectedId(null);
    setFormState({ ...emptyForm });
    setError(null);
    setEditorOpen(true);
  };

  const openEdit = (brand: Brand) => {
    setSelectedId(brand._id);
    const b = brand as any;
    setFormState({
      name: brand.name || '',
      slug: brand.slug || '',
      description: brand.description || '',
      content: b.content || '',
      imageUrl: brand.imageUrl || b.image_url || '',
      logoUrl: b.logoUrl || b.logo_url || '',
      bannerUrl: b.bannerUrl || b.banner_url || '',
      thumbnailUrl: b.thumbnailUrl || b.thumbnail_url || '',
      metaTitle: b.metaTitle || b.meta_title || '',
      metaDesc: b.metaDesc || b.meta_desc || '',
      ogImageUrl: b.ogImageUrl || b.og_image_url || '',
      displayOrder: brand.displayOrder !== undefined && brand.displayOrder !== null ? String(brand.displayOrder) : '',
      isActive: brand.isActive !== false,
      isFeatured: brand.isFeatured === true,
    });
    setError(null);
    setEditorOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formState.name.trim()) {
      setError('Brand name is required');
      return;
    }

    setSaving(true);
    setError(null);

    // null (not undefined) for cleared strings so an emptied field actually clears
    // the column on update (undefined keys are dropped before the SQL builder).
    const orNull = (v?: string) => (v && v.trim() ? v.trim() : null);
    // preferenceRank is NOT part of this form — ranks live on the Preference
    // order tab where duplicates are structurally impossible.
    const payload: Record<string, any> = {
      name: formState.name.trim(),
      description: orNull(formState.description),
      content: orNull(formState.content),
      imageUrl: orNull(formState.imageUrl),
      logoUrl: orNull(formState.logoUrl),
      bannerUrl: orNull(formState.bannerUrl),
      thumbnailUrl: orNull(formState.thumbnailUrl),
      metaTitle: orNull(formState.metaTitle),
      metaDesc: orNull(formState.metaDesc),
      ogImageUrl: orNull(formState.ogImageUrl),
      displayOrder: formState.displayOrder ? Number(formState.displayOrder) : undefined,
      isActive: formState.isActive,
      isFeatured: formState.isFeatured,
    };

    if (formState.slug?.trim()) {
      payload.slug = formState.slug.trim();
    }

    try {
      if (selectedId) {
        await brandsAPI.update(selectedId, payload);
      } else {
        await brandsAPI.create(payload);
      }
      await fetchBrands();
      setEditorOpen(false);
      toast({ title: selectedId ? 'Brand updated' : 'Brand created' });
    } catch (err: any) {
      console.error('Failed to save brand', err);
      setError(err?.message || 'Failed to save brand');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (brand: Brand) => {
    if (!confirm(`Delete brand "${brand.name}"?`)) return;
    setError(null);
    try {
      await brandsAPI.delete(brand._id);
      await fetchBrands();
      if (selectedId === brand._id) setEditorOpen(false);
    } catch (err: any) {
      console.error('Failed to delete brand', err);
      setError(err?.message || 'Failed to delete brand');
    }
  };

  /** Inline Active/Featured toggle straight from the table — no editor trip. */
  const quickToggle = async (brand: Brand, field: 'isActive' | 'isFeatured', value: boolean) => {
    const prev = brands;
    setBrands(bs => bs.map(b => (b._id === brand._id ? { ...b, [field]: value } : b)));
    try {
      await brandsAPI.update(brand._id, { [field]: value });
    } catch (err: any) {
      setBrands(prev);
      toast({ title: `Failed to update ${brand.name}`, description: err?.message || 'Unknown error', variant: 'destructive' as any });
    }
  };

  /* ── preference order handlers ── */

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRankedIds(ids => {
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return ids;
      return arrayMove(ids, from, to);
    });
  };

  const moveRank = (from: number, to: number) => {
    setRankedIds(ids => (to < 0 || to >= ids.length ? ids : arrayMove(ids, from, to)));
  };

  const removeFromRanking = (id: string) => setRankedIds(ids => ids.filter(x => x !== id));
  const addToRanking = (id: string) => setRankedIds(ids => (ids.includes(id) ? ids : [...ids, id]));

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      // Persist only what changed: position in the list IS the rank, so two
      // brands can never share a number.
      const updates: Array<{ id: string; rank: number | null }> = [];
      rankedIds.forEach((id, i) => {
        const b = byId.get(id);
        if (!b || rankOf(b) !== i + 1) updates.push({ id, rank: i + 1 });
      });
      for (const id of initialRankedIds) {
        if (!rankedIds.includes(id)) updates.push({ id, rank: null });
      }
      if (!updates.length) { setSavingOrder(false); return; }
      let failed = 0;
      const BATCH = 6;
      for (let i = 0; i < updates.length; i += BATCH) {
        const chunk = updates.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          chunk.map(u => brandsAPI.update(u.id, { preferenceRank: u.rank })));
        failed += results.filter(r => r.status === 'rejected').length;
      }
      await fetchBrands();
      if (failed) {
        toast({ title: 'Preference order partially saved', description: `${failed} of ${updates.length} updates failed — check and save again.`, variant: 'destructive' as any });
      } else {
        toast({ title: 'Preference order saved', description: `${updates.length} brand${updates.length === 1 ? '' : 's'} updated.` });
      }
    } catch (err: any) {
      console.error('Failed to save preference order', err);
      toast({ title: 'Failed to save order', description: err?.message || 'Unknown error', variant: 'destructive' as any });
    } finally {
      setSavingOrder(false);
    }
  };

  const discardOrder = () => setRankedIds(initialRankedIds);

  /* ── render ── */

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'featured', label: 'Featured' },
    { key: 'ranked', label: 'Ranked' },
    { key: 'unranked', label: 'Unranked' },
  ];

  const selectedRank = selectedId ? rankOf(byId.get(selectedId) || ({} as Brand)) : null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Brands</h1>
          <p className="text-muted-foreground">Manage brands and the order their products lead category pages.</p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <FaPlus className="h-4 w-4" />
          New Brand
        </Button>
      </div>

      <Tabs defaultValue="brands">
        <TabsList>
          <TabsTrigger value="brands">Brands</TabsTrigger>
          <TabsTrigger value="preference">
            Preference order
            {orderDirty && <span className="ml-2 h-2 w-2 rounded-full bg-amber-500 inline-block" aria-label="Unsaved changes" />}
          </TabsTrigger>
        </TabsList>

        {/* ═══ Tab 1: full-width management table; editing happens in a drawer ═══ */}
        <TabsContent value="brands" forceMount className="data-[state=inactive]:hidden mt-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-4 border-b space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardDescription className="m-0">
                  {filteredBrands.length === brands.length
                    ? `${brands.length} brands`
                    : `${filteredBrands.length} of ${brands.length} brands`}
                </CardDescription>
                <div className="flex flex-wrap gap-1.5">
                  {statusFilters.map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setStatus(f.key)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        status === f.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search brands by name or slug…"
                  className="pl-9 max-w-md"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center p-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredBrands.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  {brands.length === 0 ? 'No brands found. Create one.' : 'No brands match the current search/filter.'}
                </div>
              ) : (
                <div className="max-h-[640px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead className="w-28">Preference</TableHead>
                        <TableHead className="w-24 text-center">Active</TableHead>
                        <TableHead className="w-24 text-center">Featured</TableHead>
                        <TableHead className="w-28 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBrands.map(brand => {
                        const rank = rankOf(brand);
                        const thumb = thumbOf(brand);
                        return (
                          <TableRow key={brand._id} className="group">
                            <TableCell className="py-2">
                              <button type="button" onClick={() => openEdit(brand)}
                                className="flex items-center gap-3 text-left w-full">
                                {thumb ? (
                                  <div className="h-9 w-9 flex-shrink-0 bg-white rounded border overflow-hidden">
                                    <img src={thumb} alt="" className="h-full w-full object-contain" />
                                  </div>
                                ) : (
                                  <div className="h-9 w-9 flex-shrink-0 rounded border bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                                    {brand.name.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <span className="min-w-0">
                                  <span className="block font-medium truncate group-hover:underline">{brand.name}</span>
                                  <span className="block text-xs text-muted-foreground font-mono truncate">{brand.slug}</span>
                                </span>
                              </button>
                            </TableCell>
                            <TableCell className="py-2">
                              {rank !== null ? (
                                <Badge variant="default" className="text-xs bg-emerald-600 hover:bg-emerald-700">#{rank}</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2 text-center">
                              <Switch
                                checked={brand.isActive !== false}
                                onCheckedChange={(v) => quickToggle(brand, 'isActive', v)}
                                aria-label={`${brand.name} active`}
                              />
                            </TableCell>
                            <TableCell className="py-2 text-center">
                              <Switch
                                checked={brand.isFeatured === true}
                                onCheckedChange={(v) => quickToggle(brand, 'isFeatured', v)}
                                aria-label={`${brand.name} featured`}
                              />
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(brand)} aria-label={`Edit ${brand.name}`}>
                                  <FaPen className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(brand)} aria-label={`Delete ${brand.name}`}>
                                  <FaTrash className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab 2: preference order — position in the list IS the rank ═══ */}
        <TabsContent value="preference" forceMount className="data-[state=inactive]:hidden mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <Card className="shadow-sm">
              <CardHeader className="pb-4 border-b">
                <CardTitle>Ranked brands</CardTitle>
                <CardDescription>
                  Drag to reorder — #1's products lead category pages. Position is the rank,
                  so no two brands can share a number.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3">
                {rankedBrands.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground text-sm">
                    No ranked brands yet — add them from the right.
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={rankedIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
                        {rankedBrands.map((b, i) => (
                          <SortableRankRow
                            key={b._id}
                            brand={b}
                            index={i}
                            total={rankedBrands.length}
                            onMove={moveRank}
                            onRemove={removeFromRanking}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
                <div className="flex items-center justify-between gap-3 pt-3 mt-2 border-t">
                  <p className="text-xs text-muted-foreground m-0">
                    {orderDirty ? 'Unsaved changes' : 'Order saved'}
                    {' · '}{rankedBrands.length} ranked, {brands.length - rankedBrands.length} unranked (unranked always sort last)
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={discardOrder} disabled={!orderDirty || savingOrder}>
                      Discard
                    </Button>
                    <Button type="button" size="sm" onClick={saveOrder} disabled={!orderDirty || savingOrder}>
                      <FaSave className="mr-2 h-3.5 w-3.5" />
                      {savingOrder ? 'Saving…' : 'Save order'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-4 border-b">
                <CardTitle>Not ranked</CardTitle>
                <CardDescription>These brands sort after every ranked brand on category pages.</CardDescription>
                <div className="relative pt-1">
                  <FaSearch className="absolute left-3 top-[calc(50%+2px)] -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={poolQuery}
                    onChange={e => setPoolQuery(e.target.value)}
                    placeholder="Search unranked brands…"
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-3">
                {unrankedBrands.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground text-sm">
                    {brands.length === rankedIds.length ? 'Every brand is ranked.' : 'No unranked brands match the search.'}
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
                    {unrankedBrands.map(b => {
                      const thumb = thumbOf(b);
                      return (
                        <div key={b._id} className="flex items-center gap-3 px-3 py-2 bg-background border rounded-md">
                          {thumb ? (
                            <div className="h-8 w-8 flex-shrink-0 bg-white rounded border overflow-hidden">
                              <img src={thumb} alt="" className="h-full w-full object-contain" />
                            </div>
                          ) : (
                            <div className="h-8 w-8 flex-shrink-0 rounded border bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                              {b.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span className="flex-1 min-w-0 truncate text-sm">{b.name}</span>
                          {!b.isActive && <Badge variant="secondary" className="text-xs flex-shrink-0">Inactive</Badge>}
                          <Button type="button" variant="outline" size="sm" className="flex-shrink-0"
                            onClick={() => addToRanking(b._id)}>
                            <FaPlus className="mr-1.5 h-3 w-3" /> Rank
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══ Drawer editor — fields grouped into small tabs so the form never
          reads as a 14-field wall ═══ */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <SheetHeader className="px-6 pt-6 pb-4 border-b text-left">
              <SheetTitle>{selectedId ? `Edit — ${formState.name || 'brand'}` : 'Create Brand'}</SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                {selectedId ? (
                  selectedRank !== null
                    ? <><Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">#{selectedRank} preferred</Badge>
                        <span>rank is managed on the Preference order tab</span></>
                    : 'Not ranked — rank it on the Preference order tab'
                ) : 'Fill the basics; images and SEO can come later.'}
              </SheetDescription>
            </SheetHeader>

            {error && (
              <div className="mx-6 mt-4 p-3 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md">
                {error}
              </div>
            )}

            <div className="flex-1 px-6 py-4">
              <Tabs defaultValue="details">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="images">Images</TabsTrigger>
                  <TabsTrigger value="seo">Content &amp; SEO</TabsTrigger>
                </TabsList>

                <TabsContent value="details" forceMount className="data-[state=inactive]:hidden mt-4 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
                    <Input
                      id="name"
                      value={formState.name}
                      onChange={e => setFormState({ ...formState, name: e.target.value })}
                      placeholder="Brand name"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="slug">Slug</Label>
                      <Input
                        id="slug"
                        value={formState.slug}
                        onChange={e => setFormState({ ...formState, slug: e.target.value })}
                        placeholder="Optional custom slug"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="displayOrder">Tile order</Label>
                      <Input
                        id="displayOrder"
                        type="number"
                        value={formState.displayOrder}
                        onChange={e => setFormState({ ...formState, displayOrder: e.target.value })}
                        placeholder="0"
                      />
                      <p className="text-xs text-muted-foreground">Orders brand tiles on brand listing pages (not products).</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      rows={3}
                      value={formState.description}
                      onChange={e => setFormState({ ...formState, description: e.target.value })}
                      placeholder="Optional short description"
                      className="resize-y"
                    />
                  </div>
                  <div className="flex items-center gap-8 pt-1">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="isActive"
                        checked={formState.isActive}
                        onCheckedChange={(checked) => setFormState({ ...formState, isActive: checked })}
                      />
                      <Label htmlFor="isActive" className="cursor-pointer">Active</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="isFeatured"
                        checked={formState.isFeatured}
                        onCheckedChange={(checked) => setFormState({ ...formState, isFeatured: checked })}
                      />
                      <Label htmlFor="isFeatured" className="cursor-pointer">Featured</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="images" forceMount className="data-[state=inactive]:hidden mt-4 space-y-5">
                  <div className="space-y-2">
                    <Label>Logo (square — header, product page)</Label>
                    <ImageInputWithActions
                      value={formState.logoUrl || ''}
                      onChange={(url: string) => setFormState({ ...formState, logoUrl: url })}
                      label=""
                      placeholder="Logo URL (https://...)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Main image (brand page hero / large cards)</Label>
                    <ImageInputWithActions
                      value={formState.imageUrl || ''}
                      onChange={(url: string) => setFormState({ ...formState, imageUrl: url })}
                      label=""
                      placeholder="Main image URL (https://...)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Banner (wide — brand page header)</Label>
                    <ImageInputWithActions
                      value={formState.bannerUrl || ''}
                      onChange={(url: string) => setFormState({ ...formState, bannerUrl: url })}
                      label=""
                      placeholder="Banner URL (https://...)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Thumbnail (small square — brand chips, grids)</Label>
                    <ImageInputWithActions
                      value={formState.thumbnailUrl || ''}
                      onChange={(url: string) => setFormState({ ...formState, thumbnailUrl: url })}
                      label=""
                      placeholder="Thumbnail URL (https://...)"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="seo" forceMount className="data-[state=inactive]:hidden mt-4 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="content">Brand story (shown on the brand page)</Label>
                    <Textarea
                      id="content"
                      rows={6}
                      value={formState.content}
                      onChange={e => setFormState({ ...formState, content: e.target.value })}
                      placeholder="<p>Long-form brand story… HTML supported.</p>"
                      className="resize-y font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="metaTitle">Meta title</Label>
                    <Input
                      id="metaTitle"
                      value={formState.metaTitle}
                      onChange={e => setFormState({ ...formState, metaTitle: e.target.value })}
                      placeholder="Shown in the browser tab & search results"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="metaDesc">Meta description</Label>
                    <Textarea
                      id="metaDesc"
                      rows={2}
                      value={formState.metaDesc}
                      onChange={e => setFormState({ ...formState, metaDesc: e.target.value })}
                      placeholder="~155 characters for search snippets"
                      className="resize-y"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Social share image (Open Graph)</Label>
                    <ImageInputWithActions
                      value={formState.ogImageUrl || ''}
                      onChange={(url: string) => setFormState({ ...formState, ogImageUrl: url })}
                      label=""
                      placeholder="OG image URL (https://...)"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="sticky bottom-0 bg-background border-t px-6 py-4 flex gap-3">
              <Button type="submit" disabled={saving} className="flex-1">
                <FaSave className="mr-2" />
                {saving ? 'Saving...' : selectedId ? 'Update Brand' : 'Create Brand'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)} className="flex-none">
                <FaUndo className="mr-2" />
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Brands;
