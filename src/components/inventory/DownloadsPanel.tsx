import { useState, useEffect, useCallback, useRef } from 'react';
import { exportsAPI, blobErrorMessage, type DataJob } from '../../services/api';

/**
 * DOWNLOADS — files you asked for, waiting for you.
 *
 * Owner: "make sure the 30MB excels currently downloading don't hang the
 * server, and what if the page changes — all downloads should be a request
 * system with downloads."
 *
 * So this panel is the answer to "what if the page changes": every export is a
 * row here, it keeps building while you work, and it is still here when you
 * come back. Nothing is lost by navigating away, and nothing holds a request
 * open while a 44,000-row workbook is assembled.
 *
 * It polls ONLY while something is actually in flight — a list of finished
 * files has no reason to ask the server anything, and a panel that polls
 * forever on a dashboard someone leaves open all day is its own problem.
 */

function fmtSize(bytes?: number | null): string {
  if (!bytes) return '';
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtWhen(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString();
}

/**
 * The same six states read differently in the two directions: an export is
 * BUILT, an import is APPLIED, and calling both "Building…" is how a person
 * watching a 44,000-row import wonders what file is being made.
 */
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string; importLabel?: string }> = {
  queued:    { bg: 'var(--n-100)', color: 'var(--n-600)', label: 'Waiting' },
  running:   { bg: 'var(--i-50)', color: 'var(--i-700)', label: 'Building…', importLabel: 'Applying…' },
  ready:     { bg: 'var(--g-50)', color: 'var(--g-700)', label: 'Ready', importLabel: 'Done' },
  failed:    { bg: 'var(--d-50)', color: 'var(--d-700)', label: 'Failed' },
  expired:   { bg: 'var(--w-50)', color: 'var(--w-700)', label: 'Expired' },
  cancelled: { bg: 'var(--n-100)', color: 'var(--n-500)', label: 'Cancelled' },
};

/** Plain words for a dataset key, so the row does not read like a column name. */
const DATASET_LABEL: Record<string, string> = {
  inventory: 'Inventory sheet',
  inventory_template: 'Inventory template',
  batches: 'Batches sheet',
  batch_template: 'Batches template',
  market_prices: 'Market prices',
  availability: 'Availability',
};

/** Still going — the only state that has progress worth drawing. */
const inFlight = (j: DataJob) => j.status === 'queued' || j.status === 'running';

/**
 * How far along, 0–100.
 *
 * A job with rows but no progress yet shows a sliver rather than an empty bar,
 * because an empty bar and a broken bar look the same.
 */
function pct(j: DataJob): number {
  const total = j.total_rows ?? 0;
  if (!total) return 0;
  return Math.min(100, Math.max(3, Math.round(((j.done_rows ?? 0) / total) * 100)));
}

export default function DownloadsPanel({ refreshToken }: { refreshToken?: number }) {
  const [jobs, setJobs] = useState<DataJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rowLog, setRowLog] = useState<Record<string, any[]>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res: any = await exportsAPI.list({ limit: 15 });
      // A store migration 211 has not reached yet has no queue at all. That is
      // a state, not a failure — the panel simply does not appear, and the
      // export buttons fall back to downloading directly.
      if (res?.unavailable) { setUnavailable(true); setJobs([]); setError(null); return []; }
      setUnavailable(false);
      const rows = res?.rows ?? [];
      setJobs(rows);
      setError(null);
      return rows;
    } catch (err: any) {
      // A missing table means the migration has not reached this store yet —
      // say that plainly rather than showing an empty list that looks like
      // "you have never exported anything".
      setError(err?.response?.data?.message || 'Could not load your downloads.');
      return [];
    }
  }, []);

  // Poll only while something is in flight.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const rows = await load();
      if (cancelled) return;
      const active = rows.some((j: DataJob) => j.status === 'queued' || j.status === 'running');
      if (active) timer.current = setTimeout(tick, 2000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load, refreshToken]);

  const handleDownload = async (job: DataJob) => {
    try {
      setBusy(job.id);
      setError(null);
      const { blob, fileName } = await exportsAPI.download(job.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      load();
    } catch (err: any) {
      setError(await blobErrorMessage(err, 'Could not download that file.'));
    } finally { setBusy(null); }
  };

  const handleRetry = async (job: DataJob) => {
    try { setBusy(job.id); await exportsAPI.retry(job.id); await load(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Could not retry.'); }
    finally { setBusy(null); }
  };

  const handleRemove = async (job: DataJob) => {
    try { setBusy(job.id); await exportsAPI.remove(job.id); await load(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Could not remove that.'); }
    finally { setBusy(null); }
  };

  const toggleLog = async (job: DataJob) => {
    if (expanded === job.id) { setExpanded(null); return; }
    setExpanded(job.id);
    if (rowLog[job.id]) return;
    try {
      // Problems only when there ARE problems — otherwise show what the run did,
      // so "Line by line" on a clean import is not an empty table.
      const onlyProblems = ((job.failed_rows ?? 0) + (job.skipped_rows ?? 0)) > 0;
      const { rows } = await exportsAPI.rows(job.id, { onlyProblems, limit: 200 });
      setRowLog((p) => ({ ...p, [job.id]: rows }));
    } catch { setRowLog((p) => ({ ...p, [job.id]: [] })); }
  };

  if (unavailable) return null;
  if (!jobs.length && !error) return null;

  return (
    <div style={{ border: '1px solid var(--n-200)', borderRadius: 8, background: 'var(--surface)', marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--n-100)', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 14 }}>Downloads &amp; imports</strong>
        <span style={{ fontSize: 12, color: 'var(--n-500)' }}>
          Files you asked for and sheets you sent back. Both keep going if you leave this page.
        </span>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'var(--d-50)', color: 'var(--d-700)', fontSize: 13 }}>{error}</div>
      )}

      <div>
        {jobs.map((job) => {
          const st = STATUS_STYLE[job.status] ?? STATUS_STYLE.queued;
          const problems = (job.failed_rows ?? 0) + (job.skipped_rows ?? 0);
          return (
            <div key={job.id} style={{ borderBottom: '1px solid var(--n-50)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
                <span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 600,
                               padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  {(job.direction === 'import' && st.importLabel) || st.label}
                </span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {job.direction === 'import' ? 'Sent back' : 'Download'} ·{' '}
                    {DATASET_LABEL[job.dataset] ?? job.dataset.replace(/_/g, ' ')}
                    {job.source_name || job.file_name
                      ? <span style={{ color: 'var(--n-500)', fontWeight: 400 }}> · {job.source_name || job.file_name}</span>
                      : null}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--n-500)' }}>
                    {fmtWhen(job.created_at)}
                    {job.file_size ? ` · ${fmtSize(job.file_size)}` : ''}
                    {job.detail ? ` · ${job.detail}` : ''}
                    {job.error ? <span style={{ color: 'var(--d-700)' }}> · {job.error}</span> : null}
                  </div>
                  {/* A 44,000-row import runs for minutes. Saying how far it has
                      got is the difference between "working" and "stuck". */}
                  {inFlight(job) && !!job.total_rows && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ height: 4, borderRadius: 999, background: 'var(--n-200)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct(job)}%`, background: 'var(--i-700)',
                                      transition: 'width .4s ease' }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--n-500)', marginTop: 3 }}>
                        {(job.done_rows ?? 0).toLocaleString('en-IN')} of{' '}
                        {(job.total_rows ?? 0).toLocaleString('en-IN')} row(s)
                        {job.direction === 'import' ? ' applied' : ''}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {/* An import produces no file — offering Download would 404. */}
                  {job.status === 'ready' && job.direction === 'export' && (
                    <button onClick={() => handleDownload(job)} disabled={busy === job.id}
                      style={{ padding: '5px 12px', fontSize: 12, borderRadius: 6, border: 'none',
                               background: 'var(--accent)', color: 'var(--surface)', cursor: 'pointer' }}>
                      {busy === job.id ? 'Downloading…' : 'Download'}
                    </button>
                  )}
                  {job.status === 'failed' && job.direction === 'export' && (
                    <button onClick={() => handleRetry(job)} disabled={busy === job.id}
                      style={{ padding: '5px 12px', fontSize: 12, borderRadius: 6,
                               border: '1px solid var(--n-300)', background: 'var(--surface)', cursor: 'pointer' }}>
                      Try again
                    </button>
                  )}
                  {(problems > 0 || (job.direction === 'import' && job.status === 'ready')) && (
                    <button onClick={() => toggleLog(job)}
                      style={{ padding: '5px 12px', fontSize: 12, borderRadius: 6,
                               border: `1px solid ${problems ? 'var(--d-300)' : 'var(--n-300)'}`, background: 'var(--surface)',
                               color: problems ? 'var(--d-700)' : 'var(--n-600)', cursor: 'pointer' }}>
                      {expanded === job.id
                        ? 'Hide'
                        : problems ? `${problems} problem${problems > 1 ? 's' : ''}` : 'Line by line'}
                    </button>
                  )}
                  <button onClick={() => handleRemove(job)} disabled={busy === job.id} title="Remove"
                    style={{ padding: '5px 9px', fontSize: 12, borderRadius: 6,
                             border: '1px solid var(--n-200)', background: 'var(--surface)', color: 'var(--n-500)', cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              </div>

              {expanded === job.id && (
                <div style={{ padding: '0 14px 12px 14px' }}>
                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--n-100)', borderRadius: 6 }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--n-50)', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px' }}>Sheet line</th>
                          <th style={{ padding: '6px 8px' }}>What</th>
                          <th style={{ padding: '6px 8px' }}>Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rowLog[job.id] ?? []).map((r: any) => (
                          <tr key={r.id} style={{ borderTop: '1px solid var(--n-50)' }}>
                            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{r.row_number}</td>
                            <td style={{ padding: '6px 8px' }}>{r.ref ?? '—'}</td>
                            <td style={{ padding: '6px 8px', color: r.outcome === 'ok' ? 'var(--g-700)' : 'var(--d-700)' }}>
                              {r.message ?? r.outcome}
                            </td>
                          </tr>
                        ))}
                        {!(rowLog[job.id] ?? []).length && (
                          <tr><td colSpan={3} style={{ padding: '10px 8px', color: 'var(--n-500)' }}>
                            No per-row detail was recorded for this run.
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
