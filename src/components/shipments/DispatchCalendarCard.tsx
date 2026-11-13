import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Plus, Save, X } from 'lucide-react';
import { Btn, Field, SectionCard, TextInput } from '@/components/erp';
import { ErrorNote, Loading, Notice, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { formatDay, todayIso } from '@/utils/date';
import { getDispatchCalendar, patchDispatchCalendar } from '@/lib/v2/appSettings';

/**
 * Dispatch calendar (HMAPP-T3 section 2, B7): when the store's parcels leave, which the app's
 * "order by {time} to send today" and delivery dates are worked out from. A daily cut-off (store
 * time), the weekdays parcels leave on, and the store's own closed days. None saved: every day, no
 * cut-off, so the dates are as before.
 *
 * Server (Ship): `GET/PATCH /api/v2/ship/dispatch-calendar` (`settings.read`, `settings.manage`).
 * Weekday names come from the browser for ISO days 1 (Monday) to 7, never a list kept here.
 */

/** ISO weekday (1 = Monday) as the browser names it, from a known Monday (5 Jan 2026). */
const weekdayName = (iso: number) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + iso)));

const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7];

const DispatchCalendarCard: React.FC = () => {
  const { hasPerm } = useAuth();
  const canSave = hasPerm('settings.manage');
  const data = useLoad(getDispatchCalendar, []);
  const [cutoff, setCutoff] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>(ISO_DAYS);
  const [closed, setClosed] = useState<string[]>([]);
  const [newDay, setNewDay] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const names = useMemo(() => new Map(ISO_DAYS.map((d) => [d, weekdayName(d)])), []);

  useEffect(() => {
    const c = data.data;
    if (!c) return;
    setCutoff(c.cutoff ?? '');
    setWeekdays(c.weekdays?.length ? c.weekdays : ISO_DAYS);
    setClosed(c.closed ?? []);
    setDirty(false);
  }, [data.data]);

  const touch = () => { setDirty(true); setSaved(false); };
  const off = whyDisabled(canSave, [!dirty && 'Nothing has changed.', weekdays.length === 0 && 'Parcels must leave on at least one weekday.']);

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      await patchDispatchCalendar({ cutoff: cutoff || null, weekdays: [...weekdays].sort(), closed: [...closed].sort() });
      setSaved(true); await data.reload();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4" aria-hidden />When parcels leave</span>}
      description="The cut-off, the days parcels leave and the days the store is closed. The app's delivery dates use these."
    >
      {data.loading && !data.data ? <Loading label="Reading the dispatch calendar" /> : data.error ? (
        <ErrorNote error={data.error} what="The dispatch calendar" onRetry={() => void data.reload()} />
      ) : (
        <div className="space-y-4">
          {data.data && !data.data.saved && <Notice tone="info">Not set: parcels are taken to leave every day, with no cut-off.</Notice>}
          <Field label="Orders placed before this time leave the same day (store time; empty is no cut-off)">
            <TextInput type="time" value={cutoff} disabled={!canSave} onChange={(e) => { setCutoff(e.target.value); touch(); }} className="w-36" />
          </Field>
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-gray-600">Parcels leave on</legend>
            <div className="flex flex-wrap gap-3">
              {ISO_DAYS.map((d) => (
                <label key={d} className="inline-flex items-center gap-1.5 text-sm">
                  <input type="checkbox" disabled={!canSave} checked={weekdays.includes(d)}
                    onChange={(e) => { setWeekdays((w) => (e.target.checked ? [...w, d] : w.filter((x) => x !== d))); touch(); }} />
                  {names.get(d)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-600">Closed days</div>
            {closed.length === 0 ? <p className="text-sm text-gray-500">None.</p> : (
              <ul className="flex flex-wrap gap-2">
                {[...closed].sort().map((c) => (
                  <li key={c} className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs">
                    {formatDay(c, c)}
                    <button type="button" disabled={!canSave} onClick={() => { setClosed((l) => l.filter((x) => x !== c)); touch(); }}
                      className="rounded p-0.5 text-gray-500 hover:text-red-700 disabled:opacity-30" aria-label={`Remove ${formatDay(c, c)}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Add a closed day">
                <TextInput type="date" value={newDay} min={todayIso()} disabled={!canSave} onChange={(e) => setNewDay(e.target.value)} />
              </Field>
              <Btn variant="outline" size="sm" disabled={!canSave || !newDay || closed.includes(newDay)}
                onClick={() => { setClosed((l) => [...l, newDay]); setNewDay(''); touch(); }}>
                <Plus className="h-4 w-4" />Add
              </Btn>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Btn onClick={() => void save()} disabled={!!off || busy} title={off ?? undefined}><Save className="h-4 w-4" />Save the calendar</Btn>
            {off && dirty && <span className="text-xs text-amber-700">{off}</span>}
            {!canSave && <span className="text-xs text-gray-500">{off}</span>}
            {saved && <span className="text-sm text-emerald-700" role="status">Saved.</span>}
          </div>
          {error ? <ErrorNote error={error} /> : null}
        </div>
      )}
    </SectionCard>
  );
};

export default DispatchCalendarCard;
