import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Move, RotateCw, Maximize2, Crosshair, Route } from 'lucide-react';
import { token } from '@/lib/theme';

/**
 * THE 2D FLOOR MAP — the "visual building structure" of owner ask A6.
 *
 * ── WHY TWO LAYERS ──────────────────────────────────────────────────────────
 * A real facility is thousands of slots, and 5,000 SVG rects with React event
 * handlers is a scroll that stutters. So: a CANVAS layer draws every node in
 * one pass (the budget is 60 fps at 5,000), and a thin SVG layer on top carries
 * only the handful of interactive shapes — the hovered node, the selection, the
 * drag ghost, the pick path. The canvas is pixels; the SVG is behaviour.
 *
 * ── #226 APPLIED TO GEOMETRY ────────────────────────────────────────────────
 * Nothing is auto-positioned. A node with no coordinates is NOT drawn at a
 * plausible-looking spot; it goes on the "not placed yet" rail beside the map,
 * where a person can see it and place it. A drawing of a warehouse that does
 * not match the warehouse is worse than no drawing.
 *
 * ── WHAT THE COLOURS MEAN ───────────────────────────────────────────────────
 * Five modes, because the same floor answers five different questions: how full
 * is it, what is about to expire, what moves fastest, whose goods are these,
 * and what is blocked. Each has its own legend, and a node the mode cannot
 * judge is drawn in grey and SAID to be unknown rather than coloured green.
 */

export type ColourMode = 'occupancy' | 'expiry' | 'velocity' | 'owner' | 'blocked';

export interface MapNode {
  id: string;
  parentId: string | null;
  code: string;
  name?: string | null;
  levelCode: string;
  nodeRole: string;
  status: string;
  geometry: {
    xMm: number | null; yMm: number | null;
    wMm: number | null; dMm: number | null; hMm?: number | null;
    rotationDeg: number | null;
    gridRow: number | null; gridCol: number | null;
    placed: boolean; onRack: boolean;
  };
  capacity: { maxUnits: number | null; maxVolumeMl: number | null; maxWeightG: number | null; minUnits: number | null };
  occupancy: {
    units: number; fillPct: number | null; isFloor: boolean;
    earliestExpiryDays: number | null; picks90d: number;
    subtreeUnits: number; descendantStorage: number; belowMin: boolean;
    /**
     * WHICH BAND this slot is in, decided by the server. What counts as
     * "nearly full" or "expiring soon" is a warehouse rule, not a styling
     * choice — if each screen decided for itself, the desk and the floor would
     * colour the same slot differently. The swatch below is presentation and
     * belongs to this app; the threshold does not.
     */
    fillBand?: string; expiryBand?: string; velocityBand?: string;
  };
  ownerPartyId?: string | null;
}

/**
 * The map paints into a <canvas>, and a canvas cannot read a CSS variable -
 * `ctx.fillStyle = 'var(--good)'` is ignored and the slot comes out black. So
 * every colour here is RESOLVED from the theme at draw time through
 * `lib/theme.ts`, which reads the same tokens the rest of the admin uses. There
 * is still exactly one place these colours are defined: theme.json.
 */

/** band -> swatch. The BANDS come from the server; only the colours are ours. */
export const fillSwatch = (): Record<string, string> => ({
  empty: token('line'), low: token('good'), medium: token('warn'),
  high: token('bad'), unmeasured: token('info'),
});
export const expirySwatch = (): Record<string, string> => ({
  expired: token('badInk'), month: token('bad'), quarter: token('warn'),
  half_year: token('warnBg'), long: token('good'), undated: token('lineStrong'),
  empty: token('surface2'),
});
export const velocitySwatch = (): Record<string, string> => ({
  fastest: token('accentHover'), fast: token('accent'), steady: token('accentSoft'),
  slow: token('surface2'), still: token('surface2'), empty: token('surface'),
});

/** Stable colour per owner, so the same client is the same colour every time. */
function ownerColour(n: MapNode): string {
  if (!n.ownerPartyId) return token('infoBg');   // the store's own goods
  let h = 0;
  for (const c of n.ownerPartyId) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 62%, 62%)`;
}

export function colourFor(n: MapNode, mode: ColourMode): string {
  if (n.status !== 'active') return mode === 'blocked' ? token('bad') : token('line');
  const o = n.occupancy;
  switch (mode) {
    case 'expiry': { const s = expirySwatch(); return s[o.expiryBand ?? 'empty'] ?? s.empty; }
    case 'velocity': { const s = velocitySwatch(); return s[o.velocityBand ?? 'empty'] ?? s.empty; }
    case 'owner': return ownerColour(n);
    case 'blocked': return token('line');
    default: { const s = fillSwatch(); return s[o.fillBand ?? 'empty'] ?? s.empty; }
  }
}

export const legendsFor = (): Record<ColourMode, Array<{ swatch: string; label: string }>> => {
  const f = fillSwatch(), e = expirySwatch(), v = velocitySwatch();
  return {
    occupancy: [
      { swatch: f.empty, label: 'Empty' }, { swatch: f.low, label: 'Room to spare' },
      { swatch: f.medium, label: 'Filling up' }, { swatch: f.high, label: 'Nearly full' },
      { swatch: f.unmeasured, label: 'Holds stock, no limit set' },
    ],
    expiry: [
      { swatch: e.expired, label: 'Already expired' }, { swatch: e.month, label: 'Within a month' },
      { swatch: e.quarter, label: 'Within 3 months' }, { swatch: e.half_year, label: 'Within 6 months' },
      { swatch: e.long, label: 'Longer' }, { swatch: e.undated, label: 'No expiry recorded' },
    ],
    velocity: [
      { swatch: v.fastest, label: 'Sells fastest' }, { swatch: v.fast, label: 'Fast' },
      { swatch: v.steady, label: 'Steady' }, { swatch: v.slow, label: 'Slow' },
      { swatch: v.still, label: 'Nothing sold in 90 days' },
    ],
    owner: [
      { swatch: token('infoBg'), label: 'Your own goods' },
      { swatch: 'hsl(200, 62%, 62%)', label: "A client's goods" },
    ],
    blocked: [
      { swatch: token('bad'), label: 'Blocked or being counted' },
      { swatch: token('line'), label: 'In use' },
    ],
  };
};

export interface FloorMapProps {
  nodes: MapNode[];
  mode: ColourMode;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Bins on a live pick list, in walking order — drawn as a path over the map. */
  pickPath?: string[];
  /** Drag a node to a new position. Absent = read-only. */
  onMove?: (id: string, xMm: number, yMm: number) => void;
  onRotate?: (id: string, deg: number) => void;
  /** Snap step in millimetres. 0 = free. */
  snapMm?: number;
  height?: number;
}

interface Placed { n: MapNode; x: number; y: number; w: number; d: number; rot: number }

/** Default footprint for a node that is positioned but not sized, in mm. */
const DEFAULT_W = 1000;
const DEFAULT_D = 600;

const FloorMap: React.FC<FloorMapProps> = ({
  nodes, mode, selectedId, onSelect, pickPath, onMove, onRotate, snapMm = 100, height = 520,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [box, setBox] = useState({ w: 900, h: height });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; xMm: number; yMm: number } | null>(null);
  const panning = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const placed: Placed[] = useMemo(() => nodes
    .filter((n) => n.geometry.placed)
    .map((n) => ({
      n,
      x: n.geometry.xMm!, y: n.geometry.yMm!,
      w: n.geometry.wMm ?? DEFAULT_W, d: n.geometry.dMm ?? DEFAULT_D,
      rot: n.geometry.rotationDeg ?? 0,
    })), [nodes]);

  /** The extent of everything that IS placed, in mm, padded. */
  const extent = useMemo(() => {
    if (!placed.length) return { minX: 0, minY: 0, maxX: 10000, maxY: 6000 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of placed) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.d);
    }
    const padX = Math.max(500, (maxX - minX) * 0.06), padY = Math.max(500, (maxY - minY) * 0.06);
    return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
  }, [placed]);

  /** mm → screen px. One scale for both axes so nothing is distorted. */
  const scale = useMemo(() => {
    const sx = box.w / Math.max(1, extent.maxX - extent.minX);
    const sy = box.h / Math.max(1, extent.maxY - extent.minY);
    return Math.min(sx, sy) * zoom;
  }, [box, extent, zoom]);

  const toPx = useCallback((xMm: number, yMm: number) => ({
    x: (xMm - extent.minX) * scale + pan.x,
    y: (yMm - extent.minY) * scale + pan.y,
  }), [extent, scale, pan]);
  const toMm = useCallback((px: number, py: number) => ({
    xMm: Math.round((px - pan.x) / scale + extent.minX),
    yMm: Math.round((py - pan.y) / scale + extent.minY),
  }), [extent, scale, pan]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: height }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: height });
    return () => ro.disconnect();
  }, [height]);

  // ── the canvas pass: every node, once ──
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = box.w * dpr; cv.height = box.h * dpr;
    cv.style.width = `${box.w}px`; cv.style.height = `${box.h}px`;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.w, box.h);

    // A metre grid, so distances on the map mean something.
    const step = 1000 * scale;
    if (step > 8) {
      ctx.strokeStyle = token('line'); ctx.lineWidth = 1;
      for (let x = (pan.x % step + step) % step; x < box.w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, box.h); ctx.stroke();
      }
      for (let y = (pan.y % step + step) % step; y < box.h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(box.w, y); ctx.stroke();
      }
    }

    for (const p of placed) {
      if (drag && drag.id === p.n.id) continue;    // the SVG layer draws the ghost
      const { x, y } = toPx(p.x, p.y);
      const w = p.w * scale, d = p.d * scale;
      if (x + w < -40 || y + d < -40 || x > box.w + 40 || y > box.h + 40) continue;
      ctx.save();
      if (p.rot) { ctx.translate(x + w / 2, y + d / 2); ctx.rotate((p.rot * Math.PI) / 180); ctx.translate(-w / 2, -d / 2); }
      else ctx.translate(x, y);
      ctx.fillStyle = colourFor(p.n, mode);
      ctx.fillRect(0, 0, w, d);
      ctx.strokeStyle = p.n.id === selectedId ? token('ink') : token('inkSoft');
      ctx.lineWidth = p.n.id === selectedId ? 2.5 : 0.75;
      ctx.strokeRect(0, 0, w, d);
      if (w > 46 && d > 16) {
        ctx.fillStyle = token('ink');
        ctx.font = `${Math.min(12, Math.max(9, d / 3))}px ui-monospace, monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText(p.n.code.slice(0, Math.floor(w / 7)), 4, d / 2);
      }
      ctx.restore();
    }
  }, [placed, box, scale, pan, mode, selectedId, drag, toPx]);

  const hitTest = useCallback((px: number, py: number): MapNode | null => {
    // Last drawn wins, so a slot sitting on a rack is picked before the rack.
    for (let i = placed.length - 1; i >= 0; i--) {
      const p = placed[i];
      const { x, y } = toPx(p.x, p.y);
      const w = p.w * scale, d = p.d * scale;
      if (px >= x && px <= x + w && py >= y && py <= y + d) return p.n;
    }
    return null;
  }, [placed, toPx, scale]);

  const onPointerDown = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const hit = hitTest(px, py);
    if (hit) {
      onSelect?.(hit.id);
      if (onMove) {
        const { xMm, yMm } = toMm(px, py);
        setDrag({ id: hit.id, xMm, yMm });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      return;
    }
    panning.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (drag) {
      const { xMm, yMm } = toMm(px, py);
      const snap = (v: number) => (snapMm > 0 ? Math.round(v / snapMm) * snapMm : v);
      setDrag({ id: drag.id, xMm: snap(xMm), yMm: snap(yMm) });
      return;
    }
    if (panning.current) {
      setPan({ x: panning.current.ox + (e.clientX - panning.current.x), y: panning.current.oy + (e.clientY - panning.current.y) });
      return;
    }
    const hit = hitTest(px, py);
    setHover(hit?.id ?? null);
  };

  const onPointerUp = () => {
    if (drag) {
      const p = placed.find((q) => q.n.id === drag.id);
      // Drop on the node's own CENTRE, so the shape lands where the cursor is.
      if (p) onMove?.(drag.id, Math.max(0, drag.xMm - Math.round(p.w / 2)), Math.max(0, drag.yMm - Math.round(p.d / 2)));
      setDrag(null);
    }
    panning.current = null;
  };

  const pathPoints = useMemo(() => {
    if (!pickPath?.length) return [];
    const byId = new Map(placed.map((p) => [p.n.id, p]));
    return pickPath.map((id) => byId.get(id)).filter(Boolean)
      .map((p) => { const c = toPx(p!.x + p!.w / 2, p!.y + p!.d / 2); return c; });
  }, [pickPath, placed, toPx]);

  const hovered = hover ? nodes.find((n) => n.id === hover) ?? null : null;
  const hoverPx = hovered?.geometry.placed ? toPx(hovered.geometry.xMm!, hovered.geometry.yMm!) : null;
  const dragNode = drag ? placed.find((p) => p.n.id === drag.id) : null;

  if (!placed.length) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <MapPin className="mb-2 h-7 w-7 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">No part of this facility has a position yet</p>
        <p className="mt-1 max-w-md text-xs text-slate-500">
          Give a rack or an area an X and Y on the floor plan — from its editor, or the Locations
          sheet — and it appears here. Nothing is placed for you: a map that does not match the
          building is worse than no map.
        </p>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative select-none overflow-hidden rounded-lg border border-slate-200 bg-white">
      <canvas ref={canvasRef} className="block" />
      <svg
        className="absolute inset-0"
        width={box.w} height={box.h}
        style={{ cursor: drag ? 'grabbing' : hover ? 'pointer' : 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerLeave={() => { setHover(null); onPointerUp(); }}
      >
        {pathPoints.length > 1 && (
          <>
            <polyline
              points={pathPoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke={token('info')} strokeWidth={2.5} strokeDasharray="7 5" strokeLinejoin="round" />
            {pathPoints.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={10} fill={token('info')} />
                <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={10} fill={token('inkInverse')} fontWeight="600">{i + 1}</text>
              </g>
            ))}
          </>
        )}

        {dragNode && (() => {
          const c = toPx(drag!.xMm, drag!.yMm);
          const w = dragNode.w * scale, d = dragNode.d * scale;
          return <rect x={c.x - w / 2} y={c.y - d / 2} width={w} height={d}
                       fill={token('ink')} fillOpacity={0.13} stroke={token('ink')} strokeDasharray="4 3" />;
        })()}

        {hoverPx && hovered && !drag && (
          <rect x={hoverPx.x} y={hoverPx.y}
                width={(hovered.geometry.wMm ?? DEFAULT_W) * scale}
                height={(hovered.geometry.dMm ?? DEFAULT_D) * scale}
                fill="none" stroke={token('ink')} strokeWidth={1.75} />
        )}
      </svg>

      {/* controls */}
      <div className="absolute right-2 top-2 flex flex-col gap-1 rounded-md border border-slate-200 bg-white/95 p-1 shadow-sm">
        <button className="rounded px-2 py-1 text-xs hover:bg-slate-100" onClick={() => setZoom((z) => Math.min(8, z * 1.3))} aria-label="Zoom in">+</button>
        <button className="rounded px-2 py-1 text-xs hover:bg-slate-100" onClick={() => setZoom((z) => Math.max(0.2, z / 1.3))} aria-label="Zoom out">−</button>
        <button className="rounded px-2 py-1 hover:bg-slate-100" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Fit to view" title="Fit to view">
          <Maximize2 className="h-3.5 w-3.5 text-slate-600" />
        </button>
        {onRotate && selectedId && (
          <button className="rounded px-2 py-1 hover:bg-slate-100" title="Turn 90°"
                  onClick={() => {
                    const n = nodes.find((x) => x.id === selectedId);
                    if (n) onRotate(selectedId, (((n.geometry.rotationDeg ?? 0) + 90) % 360));
                  }} aria-label="Turn 90 degrees">
            <RotateCw className="h-3.5 w-3.5 text-slate-600" />
          </button>
        )}
      </div>

      {hovered && (
        <div className="pointer-events-none absolute bottom-2 left-2 max-w-sm rounded-md border border-slate-200 bg-white/97 px-3 py-2 text-xs shadow-sm">
          <div className="font-mono font-semibold text-slate-900">{hovered.code}</div>
          {hovered.name && <div className="text-slate-500">{hovered.name}</div>}
          <div className="mt-1 text-slate-600">
            {hovered.nodeRole === 'storage'
              ? <>{hovered.occupancy.units} unit(s){hovered.occupancy.fillPct != null
                  ? ` · ${Math.round(hovered.occupancy.fillPct * 100)}% full${hovered.occupancy.isFloor ? ' or more' : ''}`
                  : ' · no capacity limit set'}</>
              : <>{hovered.occupancy.subtreeUnits} unit(s) inside · {hovered.occupancy.descendantStorage} slot(s)</>}
          </div>
          {mode === 'expiry' && (
            <div className="mt-0.5 text-slate-600">
              {hovered.occupancy.earliestExpiryDays == null ? 'No expiry recorded here'
                : hovered.occupancy.earliestExpiryDays < 0 ? 'Holds expired stock'
                : `Soonest expiry in ${hovered.occupancy.earliestExpiryDays} day(s)`}
            </div>
          )}
          {mode === 'velocity' && (
            <div className="mt-0.5 text-slate-600">
              {hovered.occupancy.picks90d ? `${hovered.occupancy.picks90d} picked in 90 days` : 'Nothing sold from here in 90 days'}
            </div>
          )}
          {hovered.occupancy.belowMin && <div className="mt-0.5 font-medium text-amber-700">Below its refill level</div>}
          {hovered.status !== 'active' && <div className="mt-0.5 font-medium text-rose-700">{hovered.status}</div>}
        </div>
      )}
      {onMove && (
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded bg-slate-900/80 px-2 py-1 text-[10px] font-medium text-white">
          <Move className="h-3 w-3" /> Drag to move · snaps to {snapMm / 10} cm
        </div>
      )}
    </div>
  );
};

export const MapLegend: React.FC<{ mode: ColourMode }> = ({ mode }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
    {legendsFor()[mode].map((l) => (
      <span key={l.label} className="inline-flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-sm border border-slate-300" style={{ background: l.swatch }} />
        {l.label}
      </span>
    ))}
  </div>
);

export const MODE_LABELS: Array<{ key: ColourMode; label: string; icon: React.ReactNode }> = [
  { key: 'occupancy', label: 'How full', icon: <Crosshair className="h-3.5 w-3.5" /> },
  { key: 'expiry', label: 'Expiry risk', icon: <Crosshair className="h-3.5 w-3.5" /> },
  { key: 'velocity', label: 'How fast it sells', icon: <Route className="h-3.5 w-3.5" /> },
  { key: 'owner', label: 'Whose goods', icon: <Crosshair className="h-3.5 w-3.5" /> },
  { key: 'blocked', label: 'Blocked', icon: <Crosshair className="h-3.5 w-3.5" /> },
];

export default FloorMap;
