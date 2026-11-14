/**
 * The store's price discovery switches (registry key `pricingDiscovery`, read through
 * `GET /commerce/pricing/discovery/status`, written through the registry's own write with the
 * Manage settings permission) and the Run now button (`POST /commerce/pricing/discovery/run`,
 * Manage products). What the run may change and by how much is the pricing policy, not these.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Btn, Field, TextInput } from '@/components/erp';
import { ErrorNote, Notice, OnOff, whyDisabled } from '@/pages/panels/erp/shared';
import { errorCode } from '@/lib/v2/erp';
import {
  PRICING_CODES, runDiscoveryNow, saveDiscoverySwitches,
  type DiscoveryPatch, type DiscoveryStatus,
} from '@/lib/v2/pricing';

interface Form {
  enabled: boolean;
  merchantCenter: boolean;
  competitorUrls: boolean;
  hosts: string;
  maxPagesPerRun: string;
  minSecondsBetweenRequests: string;
  aboveBenchmarkPct: string;
  minConfidence: string;
  recommendationTtlDays: string;
}

const formOf = (s: DiscoveryStatus): Form => ({
  enabled: !!s.enabled,
  merchantCenter: !!s.merchant_center,
  competitorUrls: !!s.competitor_urls,
  hosts: (s.allowed_hosts ?? []).join('\n'),
  maxPagesPerRun: String(s.max_pages_per_run ?? ''),
  minSecondsBetweenRequests: String(s.min_seconds_between_requests ?? ''),
  aboveBenchmarkPct: String(s.above_benchmark_pct ?? ''),
  minConfidence: String(s.min_confidence ?? ''),
  recommendationTtlDays: String(s.recommendation_ttl_days ?? ''),
});

/** The registry's own bounds (settings_registry.rs, pricingDiscovery fields). */
const NUMBERS: Array<{ key: keyof Form; label: string; unit: string; min: number; max: number; whole: boolean; help: string }> = [
  { key: 'maxPagesPerRun', label: 'Competitor pages read per run', unit: 'pages', min: 1, max: 500, whole: true, help: 'Least recently read first.' },
  { key: 'minSecondsBetweenRequests', label: 'Pause between two reads of one site', unit: 'seconds', min: 1, max: 3600, whole: true, help: 'Reads every competitor site politely.' },
  { key: 'aboveBenchmarkPct', label: 'Match only when our price is above the lowest by', unit: 'percent', min: 0, max: 100, whole: false, help: 'For the Match the lowest price seen way only.' },
  { key: 'minConfidence', label: 'Ignore prices read with confidence below', unit: 'from 0 to 1', min: 0, max: 1, whole: false, help: "Google's benchmark counts 0.9, a competitor page 0.6 to 0.8." },
  { key: 'recommendationTtlDays', label: 'A suggestion can be adopted for', unit: 'days', min: 1, max: 90, whole: true, help: 'After this a suggestion is no longer offered.' },
];

function numberProblem(text: string, n: (typeof NUMBERS)[number]): string | null {
  const t = text.trim();
  if (!(n.whole ? /^\d+$/ : /^\d+(\.\d+)?$/).test(t)) return n.whole ? 'A whole number.' : 'A number.';
  const v = Number(t);
  return v < n.min || v > n.max ? `From ${n.min} to ${n.max}.` : null;
}

const hostsOf = (text: string) =>
  Array.from(new Set(text.split(/[\s,]+/).map((h) => h.trim().toLowerCase()).filter(Boolean)));

const DiscoverySwitches: React.FC<{
  status: DiscoveryStatus;
  canSwitch: boolean;
  canRun: boolean;
  onChanged: () => void;
  onRunStarted?: () => void;
}> = ({ status, canSwitch, canRun, onChanged, onRunStarted }) => {
  const [form, setForm] = useState<Form>(() => formOf(status));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<unknown>(null);
  const [runKey, setRunKey] = useState<string | null>(null);

  useEffect(() => { setForm(formOf(status)); }, [status]);

  const original = useMemo(() => formOf(status), [status]);
  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const problems = useMemo(() => {
    const out: Partial<Record<keyof Form, string>> = {};
    for (const n of NUMBERS) {
      const p = numberProblem(String(form[n.key]), n);
      if (p) out[n.key] = p;
    }
    if (hostsOf(form.hosts).some((h) => !/^\.?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h))) {
      out.hosts = 'Host names only, like example.com or .example.com, one per line.';
    }
    return out;
  }, [form]);

  const blocked = whyDisabled(canSwitch, [
    !dirty && 'Nothing has changed.',
    Object.keys(problems).length > 0 && 'Fix the boxes marked in red first.',
  ]);

  const set = (patch: Partial<Form>) => { setSaved(false); setForm((f) => ({ ...f, ...patch })); };

  const save = async () => {
    if (blocked) return;
    const patch: DiscoveryPatch = {};
    if (form.enabled !== original.enabled) patch.enabled = form.enabled;
    if (form.merchantCenter !== original.merchantCenter) patch.merchantCenter = form.merchantCenter;
    if (form.competitorUrls !== original.competitorUrls) patch.competitorUrls = form.competitorUrls;
    if (form.hosts !== original.hosts) patch.allowedHosts = hostsOf(form.hosts);
    for (const n of NUMBERS) {
      if (form[n.key] !== original[n.key]) (patch as Record<string, number>)[n.key] = Number(String(form[n.key]).trim());
    }
    setSaving(true);
    setError(null);
    try {
      await saveDiscoverySwitches(patch);
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  const runBlocked = whyDisabled(canRun, [
    !status.tables_present && 'Pricing is not set up on this store yet.',
    !status.enabled && 'Switch on price discovery and save first.',
    !(status.merchant_center || status.competitor_urls) && 'Switch on at least one place to read prices from, and save first.',
    dirty && 'Save your changes first.',
  ], 'Manage products');

  const runNow = async () => {
    if (runBlocked) return;
    setRunning(true);
    setRunError(null);
    setRunKey(null);
    try {
      const r = await runDiscoveryNow();
      setRunKey(r?.run_key ?? '');
      onRunStarted?.();
    } catch (e) {
      setRunError(e);
    } finally {
      setRunning(false);
    }
  };

  const switches: Array<{ key: 'enabled' | 'merchantCenter' | 'competitorUrls'; label: string; help: string }> = [
    { key: 'enabled', label: 'Run price discovery every day', help: 'The master switch. Off: nothing is read and no price changes.' },
    { key: 'merchantCenter', label: "Read Google's prices (Merchant Center)", help: "Google's benchmark of other sellers and its suggested prices, through your Google connection under Marketing, Connections." },
    { key: 'competitorUrls', label: 'Read competitor pages', help: 'Only the pages you list under competitor pages, and only from the sites allowed below.' },
  ];

  return (
    <div className="space-y-4">
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {switches.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4 px-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">{s.label}</div>
              <div className="text-xs text-gray-500">{s.help}</div>
            </div>
            <OnOff on={form[s.key]} label={s.label} disabled={!canSwitch || saving}
              title={canSwitch ? undefined : 'You need the Manage settings permission.'}
              onToggle={() => set({ [s.key]: !form[s.key] } as Partial<Form>)} />
          </div>
        ))}
      </div>

      <details className="rounded-lg border border-gray-200 bg-white px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-gray-800">Where and how often prices are read</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Field label="Competitor sites allowed (one per line)" className="md:col-span-2">
            <textarea
              value={form.hosts}
              rows={3}
              disabled={!canSwitch || saving}
              onChange={(e) => set({ hosts: e.target.value })}
              placeholder="example.com"
              className="w-full rounded-lg border border-gray-200 bg-white p-2 font-mono text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <span className="text-xs text-gray-500">A leading dot means the site and its sub-sites. Empty: no competitor page is read.</span>
            {problems.hosts && <span className="text-xs text-red-700">{problems.hosts}</span>}
          </Field>
          {NUMBERS.map((n) => (
            <Field key={n.key} label={n.label}>
              <span className="inline-flex items-center gap-1.5">
                <TextInput inputMode="decimal" value={String(form[n.key])} disabled={!canSwitch || saving}
                  aria-invalid={!!problems[n.key]}
                  onChange={(e) => set({ [n.key]: e.target.value } as Partial<Form>)}
                  className="w-28 text-right tabular-nums" />
                <span className="text-sm text-gray-500">{n.unit}</span>
              </span>
              <span className={problems[n.key] ? 'text-xs text-red-700' : 'text-xs text-gray-500'}>{problems[n.key] ?? n.help}</span>
            </Field>
          ))}
        </div>
      </details>

      {error ? <ErrorNote error={error} what="Saving the discovery switches" /> : null}
      {saved && !dirty && <Notice tone="good">Saved.</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        <Btn type="button" onClick={() => void save()} disabled={!!blocked || saving} title={blocked ?? undefined}>
          {saving ? 'Saving' : 'Save switches'}
        </Btn>
        <Btn type="button" variant="outline" onClick={() => void runNow()} disabled={!!runBlocked || running} title={runBlocked ?? undefined}>
          <Play aria-hidden /> {running ? 'Starting' : 'Run now'}
        </Btn>
        {runBlocked && !dirty && <span className="text-xs text-gray-500">{runBlocked}</span>}
      </div>

      {runKey !== null && (
        <Notice tone="good" title="The run has started">
          It continues on the server and appears under Runs within a minute or two{runKey ? ` (run ${runKey})` : ''}. Changes it makes appear under Changes.
        </Notice>
      )}
      {runError ? (
        errorCode(runError) === PRICING_CODES.discoveryOff
          ? <Notice tone="warn" title="Discovery is off">Switch on price discovery and at least one place to read prices from, save, then run.</Notice>
          : <ErrorNote error={runError} what="Running discovery now" />
      ) : null}

      <p className="text-xs text-gray-500">
        The daily run also needs Growcord's server switch to be on; Run now does not.
      </p>
    </div>
  );
};

export default DiscoverySwitches;
