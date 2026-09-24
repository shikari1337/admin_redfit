import React, { useEffect, useMemo, useState } from 'react';
import { staffAPI } from '../../services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Warehouse, MapPin, Search } from 'lucide-react';

/**
 * WHICH FACILITY, AND WHICH PART OF IT (migration 217 · plan §4.2 · ask A10).
 *
 * `permissions` says which ACTIONS somebody may take; it can never say WHERE.
 * This is the where. Two lists, both narrowing only:
 *
 *   Facilities — whole warehouses.
 *   Areas      — any node in the tree (a building, a floor, a zone, an aisle,
 *                a rack, one shelf). Picking a node means EVERYTHING under it,
 *                so assigning one floor really is assigning that whole floor.
 *
 * **Ticking nothing means everywhere.** That is the default and it is stated on
 * screen, because an empty list that silently meant "nothing" would lock a
 * picker out of their own job the first time somebody opened this dialog and
 * pressed Save.
 */

interface Facility { id: string; name: string; code: string }
interface Node { id: string; code: string; warehouse_id: string; parent_id: string | null; kind: string; depth: number }

export interface WarehouseAreaValue {
  facilities: string[];
  nodes: string[];
}

const Row: React.FC<{
  checked: boolean; onToggle: () => void; children: React.ReactNode; indent?: number; disabled?: boolean;
}> = ({ checked, onToggle, children, indent = 0, disabled }) => (
  <label
    className={`flex items-center gap-2 py-1.5 text-sm rounded px-2 ${disabled ? 'opacity-50' : 'hover:bg-muted/60 cursor-pointer'}`}
    style={{ paddingLeft: 8 + indent * 16 }}
  >
    <input type="checkbox" className="h-4 w-4" checked={checked} disabled={disabled} onChange={onToggle} />
    {children}
  </label>
);

const WarehouseAreaPicker: React.FC<{
  value: WarehouseAreaValue;
  onChange: (next: WarehouseAreaValue) => void;
}> = ({ value, onChange }) => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [q, setQ] = useState('');

  useEffect(() => {
    let dead = false;
    staffAPI.warehouseAreas()
      .then((d) => {
        if (dead) return;
        setFacilities(d?.facilities ?? []);
        setNodes(d?.nodes ?? []);
      })
      .catch((e: any) => !dead && setError(e?.response?.data?.message || e?.message || 'Could not read the warehouse tree.'))
      .finally(() => !dead && setLoading(false));
    return () => { dead = true; };
  }, []);

  const facilityName = useMemo(
    () => new Map(facilities.map((f) => [f.id, f.name || f.code])),
    [facilities],
  );

  const visibleNodes = useMemo(() => {
    const term = q.trim().toLowerCase();
    const inFacility = value.facilities.length
      ? nodes.filter((n) => value.facilities.includes(n.warehouse_id))
      : nodes;
    if (!term) return inFacility.slice(0, 400);
    return inFacility.filter((n) => n.code.toLowerCase().includes(term)).slice(0, 400);
  }, [nodes, q, value.facilities]);

  const toggle = (key: 'facilities' | 'nodes', id: string) => {
    const have = value[key];
    onChange({ ...value, [key]: have.includes(id) ? have.filter((x) => x !== id) : [...have, id] });
  };

  const everywhere = !value.facilities.length && !value.nodes.length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading the warehouse tree…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Where this person may work. {everywhere
            ? <strong>Nothing ticked — they can work anywhere.</strong>
            : <>Ticked areas only. Picking an area includes everything inside it.</>}
        </p>
        {!everywhere && (
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0"
            onClick={() => onChange({ facilities: [], nodes: [] })}>
            Allow everywhere
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {error} Until it can be read, this person can work anywhere.
        </p>
      )}

      {!!facilities.length && (
        <div className="border rounded-md">
          <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium flex items-center gap-2">
            <Warehouse className="h-3.5 w-3.5" /> Facilities
            {!!value.facilities.length && <Badge variant="secondary">{value.facilities.length} chosen</Badge>}
          </div>
          <div className="p-1 max-h-40 overflow-y-auto">
            {facilities.map((f) => (
              <Row key={f.id} checked={value.facilities.includes(f.id)} onToggle={() => toggle('facilities', f.id)}>
                <span>{f.name}</span>
                <span className="text-xs text-muted-foreground">{f.code}</span>
              </Row>
            ))}
          </div>
        </div>
      )}

      <div className="border rounded-md">
        <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" /> Areas inside a facility
          {!!value.nodes.length && <Badge variant="secondary">{value.nodes.length} chosen</Badge>}
          <div className="ml-auto relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an aisle or shelf…"
              className="h-7 w-52 pl-7 text-xs" />
          </div>
        </div>
        <div className="p-1 max-h-56 overflow-y-auto">
          {!nodes.length && (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              This warehouse has no areas set up yet, so there is nothing narrower than a facility to assign.
            </p>
          )}
          {!!nodes.length && !visibleNodes.length && (
            <p className="px-3 py-3 text-sm text-muted-foreground">Nothing matches “{q}”.</p>
          )}
          {visibleNodes.map((n) => (
            <Row key={n.id} checked={value.nodes.includes(n.id)} onToggle={() => toggle('nodes', n.id)} indent={Math.min(n.depth, 6)}>
              <span className="font-mono text-xs">{n.code}</span>
              <span className="text-xs text-muted-foreground">{n.kind}</span>
              {facilities.length > 1 && (
                <span className="text-xs text-muted-foreground">· {facilityName.get(n.warehouse_id) ?? ''}</span>
              )}
            </Row>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WarehouseAreaPicker;
