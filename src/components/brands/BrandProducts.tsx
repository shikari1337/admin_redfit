import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, Search, Save, Undo2, GripVertical, ArrowUp, ArrowDown,
  Download, Upload, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { brandsAPI } from '../../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

/**
 * A brand's own product display order (migration 214). Every product this
 * brand owns is ALWAYS "in" the list — unlike the cross-brand Preference
 * order tab (Brands.tsx), there is no separate ranked/unranked pool, because
 * every one of the brand's own products needs SOME position on its page.
 *
 * Two ways to change it: drag here (small tweaks), or export/import an Excel
 * sheet (a real re-rank across hundreds of SKUs — see the backend route
 * comment in routes/brands.ts for the exact Order-column rule).
 */

interface BrandProductRow {
  id: string;
  name: string;
  sku?: string;
  slug?: string;
  imageUrl?: string | null;
  isActive?: boolean;
}

function SortableProductRow({
  item, index, onMove, total,
}: {
  item: BrandProductRow; index: number; total: number; onMove: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-2 bg-background border rounded-md ${isDragging ? 'shadow-lg ring-2 ring-primary/40 z-10 relative' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        aria-label={`Drag to reorder ${item.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex-shrink-0">
        {index + 1}
      </span>
      {item.imageUrl ? (
        <div className="h-8 w-8 flex-shrink-0 bg-white rounded border overflow-hidden">
          <img src={item.imageUrl} alt="" className="h-full w-full object-contain" />
        </div>
      ) : (
        <div className="h-8 w-8 flex-shrink-0 rounded border bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
          {item.name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="flex-1 min-w-0">
        <span className="block truncate text-sm font-medium">{item.name}</span>
        {item.sku && <span className="block truncate text-[11px] text-muted-foreground font-mono">{item.sku}</span>}
      </span>
      {item.isActive === false && <Badge variant="secondary" className="text-xs flex-shrink-0">Inactive</Badge>}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === 0}
          onClick={() => onMove(index, index - 1)} aria-label="Move up">
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === total - 1}
          onClick={() => onMove(index, index + 1)} aria-label="Move down">
          <ArrowDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default function BrandProducts({
  brandId, brandSlug, canManage,
}: { brandId: string | null; brandSlug?: string; canManage: boolean }) {
  const [items, setItems] = useState<BrandProductRow[]>([]);
  const [initialIds, setInitialIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ matched: number; unmatched: number; totalRows: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    if (!brandId) { setItems([]); return; }
    setLoading(true); setError('');
    try {
      const rows = await brandsAPI.listProducts(brandId);
      const list = Array.isArray(rows) ? rows : [];
      setItems(list);
      setInitialIds(list.map((r: BrandProductRow) => r.id));
    } catch (e: any) {
      setError(e?.message || 'Could not load this brand’s products');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  if (!brandId) {
    return (
      <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
        Save the brand first — its product list is loaded once it exists.
      </p>
    );
  }

  const dirty = items.map((i) => i.id).join('|') !== initialIds.join('|');
  const q = query.trim().toLowerCase();
  const filtering = q.length > 0;
  const visible = filtering
    ? items.filter((i) => `${i.name} ${i.sku || ''}`.toLowerCase().includes(q))
    : items;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((cur) => {
      const from = cur.findIndex((i) => i.id === active.id);
      const to = cur.findIndex((i) => i.id === over.id);
      if (from < 0 || to < 0) return cur;
      return arrayMove(cur, from, to);
    });
  };

  const moveItem = (from: number, to: number) => {
    setItems((cur) => (to < 0 || to >= cur.length ? cur : arrayMove(cur, from, to)));
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const order = items.map((i) => i.id);
      await brandsAPI.saveProductOrder(brandId, order);
      setInitialIds(order);
    } catch (e: any) {
      setError(e?.message || 'Could not save the product order');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => load();

  const handleExport = async () => {
    setError('');
    try { await brandsAPI.exportProductOrder(brandId, brandSlug); }
    catch (e: any) { setError(e?.message || 'Could not export the order sheet'); }
  };

  const handleImportPick = () => fileRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true); setError(''); setImportResult(null);
    try {
      const result = await brandsAPI.importProductOrder(brandId, file);
      setImportResult(result);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not import that sheet');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p className="m-0">
          This order controls the DEFAULT sequence products appear in on this brand&apos;s own storefront
          page. Drag rows here for small tweaks, or use Excel for a bulk re-rank across the whole
          catalogue — a shopper&apos;s own sort/search still overrides it.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span>
        </div>
      )}
      {importResult && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Imported: {importResult.matched} of {importResult.totalRows} row{importResult.totalRows === 1 ? '' : 's'} matched a product in this brand.
            {importResult.unmatched > 0 && ` ${importResult.unmatched} row${importResult.unmatched === 1 ? '' : 's'} could not be matched by SKU or Product ID and ${importResult.unmatched === 1 ? 'was' : 'were'} skipped.`}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={!items.length}>
          <Download className="mr-1.5 h-3.5 w-3.5" />Export order (.xlsx)
        </Button>
        {canManage && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleImportPick} disabled={importing}>
              {importing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              {importing ? 'Importing…' : 'Import order (.xlsx)'}
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
          </>
        )}
        <span className="text-[11px] text-muted-foreground">
          Fill in <span className="font-mono">Order</span> for the few rows you want to move, or reorder
          whole rows and leave it blank — either works.
        </span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search this brand's products…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading products…
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No products are linked to this brand yet.
        </p>
      ) : filtering ? (
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
          <p className="text-[11px] text-muted-foreground">Clear the search to drag-reorder.</p>
          {visible.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 bg-background border rounded-md">
              <span className="w-7 h-7 flex items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold flex-shrink-0">
                {items.findIndex((x) => x.id === item.id) + 1}
              </span>
              {item.imageUrl ? (
                <div className="h-8 w-8 flex-shrink-0 bg-white rounded border overflow-hidden">
                  <img src={item.imageUrl} alt="" className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className="h-8 w-8 flex-shrink-0 rounded border bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                  {item.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                {item.sku && <span className="block truncate text-[11px] text-muted-foreground font-mono">{item.sku}</span>}
              </span>
              {item.isActive === false && <Badge variant="secondary" className="text-xs flex-shrink-0">Inactive</Badge>}
            </div>
          ))}
          {visible.length === 0 && (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              No products match that search.
            </p>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
              {items.map((item, i) => (
                <SortableProductRow key={item.id} item={item} index={i} total={items.length} onMove={moveItem} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center justify-between gap-3 pt-2 border-t">
        <p className="text-xs text-muted-foreground m-0">
          {items.length} product{items.length === 1 ? '' : 's'} · {dirty ? 'Unsaved changes' : 'Order saved'}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={discard} disabled={!dirty || saving}>
            <Undo2 className="mr-1.5 h-3.5 w-3.5" />Discard
          </Button>
          {canManage && (
            <Button type="button" size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              {saving ? 'Saving…' : 'Save order'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
