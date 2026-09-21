import { useEffect, useState } from 'react';
import { inventoryAPI } from '../../services/api';

/**
 * EVERYTHING ABOUT ONE SKU — opened from the Inventory table.
 *
 * The reason this exists: the platform holds THREE stock figures and they do
 * not agree (measured live: 644,672 ledger-preferred vs 639,569 legacy vs
 * 616,767 batched, with 6,494 SKUs genuinely in conflict). The list can only
 * show one number; this is where a merchant sees all three, which one was
 * trusted, and — in plain words — why they differ and what it means.
 *
 * One request (`GET /inventory/:id/detail`) composes it, and anything the
 * server could not read arrives in `withheld[]` and is shown in amber rather
 * than rendering as an empty section that reads like "there is none".
 */

const money = (n?: number | null) =>
  n == null || Number(n) === 0 ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;
const num = (n?: number | null) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function StockDetailDrawer({ variationId, onClose }: {
  variationId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!variationId) { setData(null); return; }
    let cancelled = false;
    setLoading(true); setError(null); setData(null);
    inventoryAPI.detail(variationId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: any) => { if (!cancelled) setError(e?.response?.data?.message || 'Could not load this SKU.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [variationId]);

  // Esc closes, matching every other drawer in the admin.
  useEffect(() => {
    if (!variationId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variationId, onClose]);

  if (!variationId) return null;

  const sku = data?.sku;
  const rec = data?.reconciliation;
  const lots: any[] = data?.lots ?? [];
  const movements: any[] = data?.movements ?? [];
  const withheld: string[] = data?.withheld ?? [];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)' }} />
      <aside style={{
        position: 'relative', width: 'min(760px, 100%)', height: '100%', background: '#fff',
        boxShadow: '-8px 0 32px rgba(15,23,42,0.18)', overflowY: 'auto',
      }}>
        <header style={{
          position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid #e2e8f0',
          padding: '14px 20px', display: 'flex', alignItems: 'flex-start', gap: 12, zIndex: 1,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
              {loading ? 'Loading…' : (sku?.name ?? 'SKU')}
            </div>
            {sku && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                SKU {sku.sku ?? '—'}{sku.category ? ` · ${sku.category}` : ''}
                {sku.hsn_code ? ` · HSN ${sku.hsn_code}` : ''}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8,
            width: 30, height: 30, cursor: 'pointer', color: '#475569', lineHeight: 1,
          }}>✕</button>
        </header>

        {error && (
          <div style={{ margin: 16, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>
            {error}
          </div>
        )}

        {withheld.length > 0 && (
          <div style={{ margin: 16, padding: '10px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 12.5 }}>
            <strong>Some of this could not be read:</strong> {withheld.join(' · ')}. What is shown
            below is therefore incomplete — it is not a statement that there is nothing.
          </div>
        )}

        {sku && (
          <div style={{ padding: 16, display: 'grid', gap: 16 }}>

            {/* ── The three figures, reconciled ─────────────────────────── */}
            <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                padding: '9px 14px', background: rec?.mismatch ? '#fffbeb' : '#f8fafc',
                borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600,
                color: rec?.mismatch ? '#92400e' : '#0f172a',
              }}>
                {rec?.mismatch ? '⚠ These figures do not agree' : 'Stock figures agree'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1, background: '#f1f5f9' }}>
                {[
                  { k: 'On hand', v: num(rec?.trusted), sub: rec?.source === 'ledger' ? 'stock ledger' : 'older column', strong: true },
                  { k: 'Stock ledger', v: rec?.ledger_on_hand == null ? 'no record' : num(rec.ledger_on_hand), sub: 'the platform’s truth' },
                  { k: 'Older column', v: num(rec?.legacy_stock), sub: 'product_variations' },
                  { k: 'In batches', v: num(rec?.batched_qty), sub: `${sku.lot_count} lot(s)` },
                  { k: 'Not in a batch', v: num(rec?.unbatched_qty), sub: 'no expiry or printed price' },
                ].map((c) => (
                  <div key={c.k} style={{ background: '#fff', padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 }}>{c.k}</div>
                    <div style={{ fontSize: c.strong ? 20 : 17, fontWeight: c.strong ? 700 : 600, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{c.v}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.sub}</div>
                  </div>
                ))}
              </div>
              {(rec?.notes ?? []).length > 0 && (
                <ul style={{ margin: 0, padding: '10px 14px 12px 30px', fontSize: 12.5, color: '#475569', display: 'grid', gap: 5 }}>
                  {rec.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </section>

            {/* ── Pricing ───────────────────────────────────────────────── */}
            <section style={{ border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <div style={{ padding: '9px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 600 }}>Catalogue pricing</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 1, background: '#f1f5f9' }}>
                {[['MRP', sku.mrp], ['Selling', sku.selling_price], ['Sale', sku.sale_price], ['B2B', sku.b2b_price]].map(([k, v]) => (
                  <div key={String(k)} style={{ background: '#fff', padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>{k}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(v as number)}</div>
                  </div>
                ))}
              </div>
              {sku.mrp_count > 1 && (
                <div style={{ padding: '8px 14px', fontSize: 12, color: '#475569', borderTop: '1px solid #f1f5f9' }}>
                  Its lots carry <strong>{sku.mrp_count} different printed MRPs</strong> — the catalogue
                  figures above are what the storefront shows; each lot’s own price is below.
                </div>
              )}
            </section>

            {/* ── Lots ──────────────────────────────────────────────────── */}
            <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '9px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 600 }}>
                Batches / lots {lots.length > 0 && <span style={{ fontWeight: 400, color: '#64748b' }}>({lots.length})</span>}
              </div>
              {lots.length === 0 ? (
                <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#64748b' }}>
                  This SKU has no batches. Its stock carries no expiry date and no printed price of
                  its own, so nothing here can be traced to a lot.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#475569' }}>
                        <th style={{ padding: '7px 12px' }}>Batch</th>
                        <th style={{ padding: '7px 12px', textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: '7px 12px', textAlign: 'right' }}>Batch MRP</th>
                        <th style={{ padding: '7px 12px', textAlign: 'right' }}>Batch price</th>
                        <th style={{ padding: '7px 12px' }}>Expiry</th>
                        <th style={{ padding: '7px 12px' }}>Where</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lots.map((l) => {
                        const d = daysUntil(l.expiry_date);
                        const expColor = d == null ? '#94a3b8' : d < 0 ? '#b91c1c' : d < 90 ? '#b45309' : '#475569';
                        return (
                          <tr key={l.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '7px 12px', fontFamily: 'ui-monospace, monospace' }}>{l.batch_number}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(l.qty_on_hand)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(l.mrp)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(l.selling_price)}</td>
                            <td style={{ padding: '7px 12px', color: expColor }}>
                              {l.expiry_date ?? '—'}
                              {d != null && <span style={{ fontSize: 11 }}> {d < 0 ? `(expired ${-d}d)` : `(${d}d)`}</span>}
                            </td>
                            <td style={{ padding: '7px 12px', color: '#64748b' }}>
                              {(l.placements ?? []).length
                                ? l.placements.map((p: any) => `${p.code ?? p.location_code ?? '?'}×${p.qty}`).join(', ')
                                : 'not placed'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── Movements ─────────────────────────────────────────────── */}
            <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '9px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 600 }}>
                Recent stock movements
              </div>
              {movements.length === 0 ? (
                <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#64748b' }}>No movements recorded.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#475569' }}>
                        <th style={{ padding: '7px 12px' }}>When</th>
                        <th style={{ padding: '7px 12px' }}>What</th>
                        <th style={{ padding: '7px 12px', textAlign: 'right' }}>Change</th>
                        <th style={{ padding: '7px 12px', textAlign: 'right' }}>After</th>
                        <th style={{ padding: '7px 12px' }}>Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => (
                        <tr key={m.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '7px 12px', whiteSpace: 'nowrap', color: '#64748b' }}>
                            {new Date(m.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '7px 12px' }}>{String(m.type ?? '').replace(/_/g, ' ')}</td>
                          <td style={{
                            padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                            color: Number(m.quantity) > 0 ? '#15803d' : Number(m.quantity) < 0 ? '#b91c1c' : '#475569',
                          }}>
                            {Number(m.quantity) > 0 ? '+' : ''}{num(m.quantity)}
                          </td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(m.after_qty)}</td>
                          <td style={{ padding: '7px 12px', color: '#64748b' }}>{m.reference ?? m.note ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── Pack size, because the warehouse depends on it ────────── */}
            <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#475569' }}>
              <strong style={{ color: '#0f172a' }}>Pack size</strong>{' '}
              {sku.dims_confirmed
                ? `${sku.length} × ${sku.breadth} × ${sku.height} cm, ${sku.weight} kg`
                : 'not measured yet — the warehouse treats this SKU’s size as unknown rather than trusting the placeholder every SKU ships with, so bin capacity cannot be checked for it.'}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
