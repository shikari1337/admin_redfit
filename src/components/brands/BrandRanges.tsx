import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Undo2, RotateCcw, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { brandsAPI, type BrandRange } from '../../services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

/**
 * A brand page's "Shop by range" row (RANGE-ORDER, `brands.range_order`): the
 * brand's product forms and top-level categories, as the storefront builds them
 * from the brand's facets. The saved order leads, in its order; every range not
 * in it follows, largest first. Nothing saved = automatic (largest first).
 *
 * The list and the counts come from the server (`GET /brands/{id}/ranges`);
 * this screen only arranges them and saves the entries it was given.
 */

/** Saved entries first (in their order), then the rest as the server listed them (largest first). */
function arrange(saved: string[], ranges: BrandRange[]): BrandRange[] {
  const byEntry = new Map(ranges.map((r) => [r.entry, r]));
  const lead: BrandRange[] = [];
  for (const e of saved) {
    const r = byEntry.get(e);
    if (r && !lead.includes(r)) lead.push(r);
  }
  return [...lead, ...ranges.filter((r) => !lead.includes(r))];
}

function SortableRangeRow({
  item, index, total, onMove, canManage,
}: {
  item: BrandRange; index: number; total: number; canManage: boolean; onMove: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.entry, disabled: !canManage });
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
      {canManage && (
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          aria-label={`Drag to reorder ${item.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <span className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex-shrink-0">
        {index + 1}
      </span>
      <span className="flex-1 min-w-0 truncate text-sm font-medium">{item.label}</span>
      <Badge variant="outline" className="text-[10px] flex-shrink-0">{item.kind === 'form' ? 'Form' : 'Category'}</Badge>
      <span className="w-20 text-right text-xs text-muted-foreground flex-shrink-0">
        {item.count} product{item.count === 1 ? '' : 's'}
      </span>
      {canManage && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === 0}
            onClick={() => onMove(index, index - 1)} aria-label={`Move ${item.label} up`}>
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)} aria-label={`Move ${item.label} down`}>
            <ArrowDown className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function BrandRanges({ brandId, canManage }: { brandId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState<BrandRange[]>([]);
  const [initial, setInitial] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    if (!brandId) { setItems([]); return; }
    setLoading(true); setError('');
    try {
      const { range_order, ranges } = await brandsAPI.listRanges(brandId);
      const list = arrange(range_order, ranges);
      setItems(list);
      setInitial(list.map((r) => r.entry));
      setSaved(range_order);
    } catch (e: any) {
      setError(e?.message || 'Could not load this brand’s ranges');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  if (!brandId) {
    return (
      <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
        Save the brand first — its ranges are listed once it has products.
      </p>
    );
  }

  const dirty = items.map((i) => i.entry).join('|') !== initial.join('|');
  const automatic = saved.length === 0;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((cur) => {
      const from = cur.findIndex((i) => i.entry === active.id);
      const to = cur.findIndex((i) => i.entry === over.id);
      if (from < 0 || to < 0) return cur;
      return arrayMove(cur, from, to);
    });
  };

  const moveItem = (from: number, to: number) => {
    setItems((cur) => (to < 0 || to >= cur.length ? cur : arrayMove(cur, from, to)));
  };

  const persist = async (order: string[], done: string) => {
    setSaving(true);
    try {
      await brandsAPI.saveRangeOrder(brandId, order);
      toast({ title: done });
      await load();
    } catch (e: any) {
      toast({ title: 'Failed to save the range order', description: e?.message || 'Unknown error', variant: 'destructive' as any });
    } finally {
      setSaving(false);
    }
  };

  const save = () => persist(items.map((i) => i.entry), 'Range order saved');
  const reset = () => persist([], 'Range order back to automatic');

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p className="m-0">
          The order of the &ldquo;Shop by range&rdquo; chips on this brand&apos;s page: its product forms and
          top-level categories. Saved ranges lead in this order; a range added later follows, largest first.
        </p>
        <p className="m-0">
          A category named like a form (&ldquo;Dilutions&rdquo; and &ldquo;Dilution&rdquo;) shows on the page as the form.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading ranges…
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          This brand has no active products with a product form or a category yet.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.entry)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
              {items.map((item, i) => (
                <SortableRangeRow key={item.entry} item={item} index={i} total={items.length} onMove={moveItem} canManage={canManage} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center justify-between gap-3 pt-2 border-t">
        <p className="text-xs text-muted-foreground m-0">
          {items.length} range{items.length === 1 ? '' : 's'} · {dirty ? 'Unsaved changes' : automatic ? 'Automatic (largest first)' : 'Custom order saved'}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => load()} disabled={!dirty || saving}>
            <Undo2 className="mr-1.5 h-3.5 w-3.5" />Discard
          </Button>
          {canManage && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={reset} disabled={automatic || saving}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reset to automatic
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={!dirty || saving || items.length === 0}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                {saving ? 'Saving…' : 'Save order'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
