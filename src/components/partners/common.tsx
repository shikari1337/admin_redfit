import React from 'react';
import { Link } from 'react-router-dom';
import { Money } from '@/components/erp';
import { ErrorNote, Notice, type Loaded } from '@/pages/panels/erp/shared';
import { formatDateTime, formatDay } from '@/utils/date';
import { codeWords, type PartnerTermsView } from '@/lib/v2/partners';

/** A day (`YYYY-MM-DD` or an instant) in the store's calendar, or `none`. */
export const day = (v: unknown, none = 'none') => formatDay(v, none);
/** An instant in the store's clock, or `none`. */
export const when = (v: unknown, none = 'none') => formatDateTime(v, none);
/** The first block of an id, enough to tell people apart on screen (the full id is in the title). */
export const shortId = (id: string | null | undefined) => (id ? String(id).split('-')[0] : 'not recorded');

/**
 * Whether the programme is on, and if not, each reason the server gave (`reasons`: no platform
 * limits, no store terms, the app switch off). Shown on every tab.
 */
export const ProgrammeState: React.FC<{ terms: Loaded<PartnerTermsView>; onOpenTerms: () => void }> = ({ terms, onOpenTerms }) => {
  if (terms.loading && !terms.data) return null;
  if (terms.error) return <ErrorNote error={terms.error} what="The partner programme" onRetry={() => void terms.reload()} />;
  const t = terms.data;
  if (!t) return null;
  if (t.programme_on) {
    return <Notice tone="good" title="The partner programme is on">Applications from the app reach the Applications tab.</Notice>;
  }
  return (
    <Notice tone="warn" title="The partner programme is off">
      {t.reasons.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5">{t.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      )}
      <p className="flex flex-wrap gap-x-3">
        {!t.platform_limits && <span>Growcord sets the platform limits first.</span>}
        {!t.in_force && <button type="button" className="font-medium underline" onClick={onOpenTerms}>Set the store's terms</button>}
        {t.switch_on === false && <Link to="/settings/app?tab=switches" className="font-medium underline">Turn on the app's partners switch</Link>}
      </p>
    </Notice>
  );
};

/** A stored JSON value as label and value rows (rule snapshots, skipped partners, tax rules). */
export const ValueRows: React.FC<{ value: unknown; empty?: string }> = ({ value, empty = 'Nothing recorded.' }) => {
  if (value === null || value === undefined || (typeof value === 'object' && Object.keys(value as object).length === 0)) {
    return <p className="text-sm text-gray-500">{empty}</p>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1">
        {value.map((v, i) => (
          <li key={i} className="rounded border border-gray-100 p-2"><ValueRows value={v} /></li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object') {
    return (
      <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-gray-500">{codeWords(k)}</dt>
            <dd className="min-w-0 break-words text-gray-900">
              {v !== null && typeof v === 'object' ? <ValueRows value={v} /> : String(v ?? 'none')}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    );
  }
  return <span className="text-sm text-gray-900">{String(value)}</span>;
};

/** One label and value line of a detail panel. */
export const Line: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
  <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5 text-sm">
    <dt className="text-gray-500">{label}</dt>
    <dd className={mono ? 'min-w-0 break-all font-mono text-xs leading-5 text-gray-900' : 'min-w-0 break-words text-gray-900'}>{children}</dd>
  </div>
);

/** An amount in rupees, or `none` in words when the server has none yet (the kit's Money shows a dash). */
export const Amount: React.FC<{ rupees: number | null | undefined; none?: string; muted?: boolean }> = ({ rupees, none = 'not yet', muted }) => (
  rupees === null || rupees === undefined ? <span className="text-gray-500">{none}</span> : <Money rupees={rupees} muted={muted} />
);
