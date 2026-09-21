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

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  queued:    { bg: '#f1f5f9', color: '#475569', label: 'Waiting' },
  running:   { bg: '#eff6ff', color: '#1d4ed8', label: 'Building…' },
  ready:     { bg: '#f0fdf4', color: '#15803d', label: 'Ready' },
  failed:    { bg: '#fef2f2', color: '#b91c1c', label: 'Failed' },
  expired:   { bg: '#fffbeb', color: '#b45309', label: 'Expired' },
  cancelled: { bg: '#f1f5f9', color: '#64748b', label: 'Cancelled' },
};

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
      const { rows } = await exportsAPI.rows(job.id, { onlyProblems: true, limit: 200 });
      setRowLog((p) => ({ ...p, [job.id]: rows }));
    } catch { setRowLog((p) => ({ ...p, [job.id]: [] })); }
  };

  if (unavailable) return null;
  if (!jobs.length && !error) return null;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 14 }}>Downloads</strong>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Files you asked for. They keep building if you leave this page.
        </span>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>{error}</div>
      )}

      <div>
        {jobs.map((job) => {
          const st = STATUS_STYLE[job.status] ?? STATUS_STYLE.queued;
          const problems = (job.failed_rows ?? 0) + (job.skipped_rows ?? 0);
          return (
            <div key={job.id} style={{ borderBottom: '1px solid #f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
                <span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 600,
                               padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  {st.label}
                </span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {job.direction === 'import' ? 'Import' : 'Export'} · {job.dataset.replace(/_/g, ' ')}
                    {job.file_name ? <span style={{ color: '#64748b', fontWeight: 400 }}> · {job.file_name}</span> : null}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {fmtWhen(job.created_at)}
                    {job.file_size ? ` · ${fmtSize(job.file_size)}` : ''}
                    {job.detail ? ` · ${job.detail}` : ''}
                    {job.error ? <span style={{ color: '#b91c1c' }}> · {job.error}</span> : null}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {job.status === 'ready' && (
                    <button onClick={() => handleDownload(job)} disabled={busy === job.id}
                      style={{ padding: '5px 12px', fontSize: 12, borderRadius: 6, border: 'none',
                               background: '#0f766e', color: '#fff', cursor: 'pointer' }}>
                      {busy === job.id ? 'Downloading…' : 'Download'}
                    </button>
                  )}
                  {job.status === 'failed' && job.direction === 'export' && (
                    <button onClick={() => handleRetry(job)} disabled={busy === job.id}
                      style={{ padding: '5px 12px', fontSize: 12, borderRadius: 6,
                               border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                      Try again
                    </button>
                  )}
                  {problems > 0 && (
                    <button onClick={() => toggleLog(job)}
                      style={{ padding: '5px 12px', fontSize: 12, borderRadius: 6,
                               border: '1px solid #fca5a5', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}>
                      {expanded === job.id ? 'Hide' : `${problems} problem${problems > 1 ? 's' : ''}`}
                    </button>
                  )}
                  <button onClick={() => handleRemove(job)} disabled={busy === job.id} title="Remove"
                    style={{ padding: '5px 9px', fontSize: 12, borderRadius: 6,
                             border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              </div>

              {expanded === job.id && (
                <div style={{ padding: '0 14px 12px 14px' }}>
                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 6 }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px' }}>Row</th>
                          <th style={{ padding: '6px 8px' }}>What</th>
                          <th style={{ padding: '6px 8px' }}>Why</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rowLog[job.id] ?? []).map((r: any) => (
                          <tr key={r.id} style={{ borderTop: '1px solid #f8fafc' }}>
                            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{r.row_number}</td>
                            <td style={{ padding: '6px 8px' }}>{r.ref ?? '—'}</td>
                            <td style={{ padding: '6px 8px', color: '#b91c1c' }}>{r.message ?? r.outcome}</td>
                          </tr>
                        ))}
                        {!(rowLog[job.id] ?? []).length && (
                          <tr><td colSpan={3} style={{ padding: '10px 8px', color: '#64748b' }}>
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
