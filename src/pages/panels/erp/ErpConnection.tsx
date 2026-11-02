/**
 * One ERP connection: what it holds, what it is doing, and what an admin comes here to do —
 * set stock from it, test it, map a feed, fetch. Port of the generated console's
 * `screens/erp/Connection.tsx` onto this admin's kit, plus the Stock sync tab (ERP-STOCK-1) and the
 * Warehouses tab (ERP-WH-1: the ERP's branches, mapped to the store's warehouses).
 * Everything that writes needs `settings.manage` and says why when it is off.
 */
import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Cable, RefreshCw } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Btn, EmptyState, Field, Page, PageHeader, Pagination, SectionCard, SelectInput, StatusChip, TabBar,
  TableShell, TBody, Td, TextInput, Th, THead, Tr, EmptyRow, num,
} from '@/components/erp';
import {
  ERP_BACKFILL_FROM_KEY, ERP_HOME, ORDER_PUSH_KEYS, bytesText, dayText, erpApi, erpConnUrl, errorText, n, outcomeText, plural, prettyJson, readRejected, statusTone, whenText,
  type ErpConnection, type ErpConnectionFeed, type ErpConnector, type ErpProbe,
} from '../../../lib/v2/erp';
import {
  Code, ConfirmDialog, ErrorNote, Loading, MANAGE, Notice, OnOff, Pre, useLoad, whyDisabled,
} from './shared';
import ErpStockSync from './ErpStockSync';
import ErpMapping from './ErpMapping';
import ErpWarehouses from './ErpWarehouses';
import ErpOrderPushSettingsCard from './ErpOrderPushSettings';
import { useErpFeedRun } from '../../../hooks/useErpStockRun';

const TABS = [
  { key: 'stock', label: 'Stock sync' },
  { key: 'warehouses', label: 'Warehouses' },
  { key: 'feeds', label: 'Feeds' },
  { key: 'mapping', label: 'Mapping' },
  { key: 'runs', label: 'Run log' },
  { key: 'records', label: 'What we hold' },
  { key: 'settings', label: 'Settings' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const ErpConnectionPage: React.FC = () => {
  const { id = '', '*': rest = '' } = useParams();
  const nav = useNavigate();
  const one = useLoad(() => erpApi.connection(id), [id], !!id);
  const catalogue = useLoad(() => erpApi.connectors(), []);
  const [tabPart, subPart = ''] = rest.split('/');
  const tab: TabKey = (TABS.find((t) => t.key === tabPart)?.key ?? 'stock');

  if (one.loading && !one.data) return <Page><Loading label="Reading the connection…" /></Page>;
  if (one.error) {
    return (
      <Page>
        <BackLink />
        <ErrorNote error={one.error} what="This ERP connection" onRetry={() => void one.reload()} />
      </Page>
    );
  }
  const c = one.data;
  if (!c) return <Page><EmptyState title="No such connection." action={<BackLink />} /></Page>;
  const connector = catalogue.data?.find((x) => x.key === c.connector) ?? null;
  const refresh = () => void one.reload();

  return (
    <Page>
      <Header c={c} onChange={refresh} />
      <TabBar
        tabs={TABS}
        active={tab}
        onChange={(k) => nav(erpConnUrl(c.id, k))}
        className="overflow-x-auto"
      />
      {tab === 'stock' && <ErpStockSync c={c} connector={connector} connectorError={catalogue.error} onChange={refresh} />}
      {tab === 'warehouses' && <ErpWarehouses c={c} view={subPart} onChange={refresh} />}
      {tab === 'feeds' && <Feeds c={c} connector={connector} onChange={refresh} />}
      {tab === 'mapping' && <ErpMapping c={c} feed={decodeURIComponent(subPart)} onChange={refresh} />}
      {tab === 'runs' && <Runs c={c} />}
      {tab === 'records' && <Records c={c} />}
      {tab === 'settings' && <Settings c={c} connector={connector} connectorLoading={catalogue.loading} onChange={refresh} />}
    </Page>
  );
};

export default ErpConnectionPage;

function BackLink() {
  return (
    <Link to={ERP_HOME} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
      <ArrowLeft className="h-4 w-4" /> All ERP connections
    </Link>
  );
}

/* ── the header: state, and the one live call that belongs here ─────────── */

function Header({ c, onChange }: { c: ErpConnection; onChange: () => void }) {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(MANAGE);
  const [probe, setProbe] = useState<ErpProbe | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'good' | 'warn' | 'bad'; text: string } | null>(null);
  const blocked = whyDisabled(canManage, [c.missing.length > 0 && `Fill in ${c.missing.join(', ')} first.`]);
  // ERP-EMPTY-1: it answered, but with nothing in it — usually a setting it does not know.
  const warned = !!(probe?.reachable && probe.warning);

  const test = async () => {
    setBusy(true);
    setResult(null);
    setProbe(null);
    try {
      const p = await erpApi.test(c.id);
      setProbe(p);
      setResult(!p.reachable
        ? { tone: 'bad', text: p.message || 'It answered, but not with rows we could read.' }
        : p.warning
          ? { tone: 'warn', text: `${p.warning} (Reached it in ${num(p.took_ms)} ms.)` }
          : { tone: 'good', text: `Reached it in ${num(p.took_ms)} ms and read ${plural(p.sample.length, 'row')}.` });
      onChange();
    } catch (e) {
      setResult({ tone: 'bad', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BackLink />
      <PageHeader
        icon={Cable}
        title={<span className="inline-flex flex-wrap items-center gap-2">{c.label}
          {!c.enabled && <StatusChip status="pending" label="Paused" />}
          {warned
            ? <StatusChip status="pending" tone="amber" label="Check settings" />
            : c.last_probe_ok === false && <StatusChip status="failed" label="Last test failed" />}
        </span>}
        description={`${c.connector} · amounts in ${c.currency} · dates read as ${c.timezone}`}
        actions={(
          <Btn variant="outline" disabled={!!blocked || busy} title={blocked ?? undefined} onClick={() => void test()}>
            {busy ? 'Testing…' : 'Test the connection'}
          </Btn>
        )}
      />
      {blocked && canManage && <p className="text-xs text-gray-500">{blocked}</p>}
      {result && (
        <Notice
          tone={result.tone}
          title={result.tone === 'good' ? 'It answered' : result.tone === 'warn' ? 'It answered, but sent nothing — check the settings' : 'It did not answer'}
        >
          <p>{result.text}</p>
          {result.tone === 'warn' && (
            <p>
              Correct it on the <Link className="font-medium underline" to={erpConnUrl(c.id, 'settings')}>Settings</Link> tab and test again.
              A feed that already ran with the wrong setting asks only for what changed since its “Up to”: use “Read whole history again” on the{' '}
              <Link className="font-medium underline" to={erpConnUrl(c.id, 'feeds')}>Feeds</Link> tab to read it from the start.
            </p>
          )}
        </Notice>
      )}
      {c.last_probe_ok === false && c.last_probe_note && !result && (
        <Notice tone="bad" title={`Last test failed ${whenText(c.last_probe_us)}`}>{c.last_probe_note}</Notice>
      )}
      {probe && probe.sample.length > 0 && (
        <details className="rounded-lg border border-gray-200 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-gray-700">What came back from {probe.endpoint}</summary>
          <div className="mt-2"><Pre>{prettyJson(probe.sample.slice(0, 2))}</Pre></div>
        </details>
      )}
    </div>
  );
}

/* ── feeds ──────────────────────────────────────────────────────────────── */

function Feeds({ c, connector, onChange }: { c: ErpConnection; connector: ErpConnector | null; onChange: () => void }) {
  if (!c.feeds.length) {
    return <EmptyState title="This connector declares no feeds." description="Nothing can be fetched until it does." />;
  }
  const unmapped = c.feeds.filter((f) => f.enabled && !f.mapping_saved).length;
  return (
    <div className="space-y-4">
      {c.missing.length > 0 && (
        <Notice tone="warn" title="This connection is not finished">
          {plural(c.missing.length, 'setting')} still to fill in: {c.missing.join(', ')}. Nothing will be fetched until they are.{' '}
          <Link className="font-medium underline" to={erpConnUrl(c.id, 'settings')}>Fill them in</Link>.
        </Notice>
      )}
      {unmapped > 0 && c.missing.length === 0 && (
        <Notice tone="info" title="Some feeds are not mapped yet">
          {plural(unmapped, 'feed')} will run on the connector’s suggested mapping until you confirm your own. Open its mapping to check it against real rows.
        </Notice>
      )}
      <TableShell>
        <table className="w-full min-w-[760px] text-sm">
          <THead>
            <Th>Feed</Th><Th>Mapping</Th><Th>Up to</Th><Th>Last run</Th><Th num>Held</Th><Th>On</Th><Th><span className="sr-only">Actions</span></Th>
          </THead>
          <TBody>
            {c.feeds.map((f) => <FeedRow key={f.key} c={c} f={f} connector={connector} onChange={onChange} />)}
          </TBody>
        </table>
      </TableShell>
      <p className="text-xs text-gray-500">
        Every enabled feed is fetched again each hour, asking only for what changed since “Up to”. The stock feed is fetched right before stock is set from it.
        “Read whole history again” clears “Up to” and reads everything since the connection’s history date — for after a setting (the provider, say) was corrected.
      </p>
    </div>
  );
}

function FeedRow({ c, f, connector, onChange }: { c: ErpConnection; f: ErpConnectionFeed; connector: ErpConnector | null; onChange: () => void }) {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(MANAGE);
  const [busy, setBusy] = useState<'' | 'toggle'>('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [askBackfill, setAskBackfill] = useState(false);
  // Which of the two the run below was started as: both follow the same run to its end.
  const [how, setHow] = useState<'sync' | 'backfill'>('sync');
  // A fetch answers at once and runs in the background; this follows it to its end.
  const feedRun = useErpFeedRun(c.id, () => onChange());
  const declared = connector?.feeds.find((x) => x.key === f.key) ?? null;
  // Where a full read starts: the connection's own setting when set (the view never carries its
  // value, only that it is set), else the feed's declared start.
  const fromLabel = connector?.config_fields.find((x) => x.key === ERP_BACKFILL_FROM_KEY)?.label ?? 'Fetch history from';
  const fromText = !c.configured.includes(ERP_BACKFILL_FROM_KEY) && declared?.backfill_from
    ? dayText(declared.backfill_from)
    : `the “${fromLabel}” date on the Settings tab`;
  const isStock = f.entity === 'stock';
  const blocked = whyDisabled(canManage, [
    c.missing.length > 0 && 'The connection is not finished.',
    !c.enabled && 'The connection is paused.',
    !f.enabled && 'This feed is switched off.',
  ]);

  const toggle = async () => {
    setBusy('toggle');
    setNote(null);
    try {
      await erpApi.setFeed(c.id, f.key, !f.enabled);
      setNote({ ok: true, text: `${f.label} ${f.enabled ? 'switched off' : 'switched on'}.` });
      onChange();
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
    } finally {
      setBusy('');
    }
  };

  const sync = () => {
    setNote(null);
    setHow('sync');
    void feedRun.start(() => erpApi.sync(c.id, f.key));
  };

  // The same path as "Fetch now", from the start of the feed's history instead of from "Up to".
  const backfill = () => {
    setAskBackfill(false);
    setNote(null);
    setHow('backfill');
    void feedRun.start(() => erpApi.backfill(c.id, f.key));
  };

  // What the fetch is doing / did, in words.
  const r = feedRun.run;
  const runNote: { tone: 'good' | 'bad' | 'info' | 'warn'; text: string } | null = feedRun.error
    ? { tone: feedRun.alreadyRunning ? 'warn' : 'bad', text: feedRun.error }
    : !r ? null
      : r.status === 'running'
        ? {
          tone: 'info',
          text: `${feedRun.alreadyRunning ? 'Already running — showing its progress' : how === 'backfill' ? 'Reading the whole history again in the background' : 'Fetching in the background'}: ${bytesText(r.bytes_received)} received, ${n(r.records_written)} of ${plural(r.rows_fetched, 'row')} saved so far.${feedRun.following ? '' : ' Follow it on the Run log tab.'}`,
        }
        : r.status === 'ok'
          ? { tone: 'good', text: `${how === 'backfill' ? 'Read the whole history again into the ERP copy' : 'Fetched into the ERP copy'}: ${outcomeText(r)}.${isStock ? ' Store stock is set from it on the Stock sync tab.' : ''}` }
          : { tone: 'bad', text: r.message || r.status || 'The fetch did not finish.' };

  return (
    <>
      <Tr>
        <Td>
          <div className="font-medium text-gray-900">{f.label}</div>
          <div className="text-xs text-gray-500">{declared?.description ?? f.entity}</div>
        </Td>
        <Td>{f.mapping_saved ? <StatusChip status="ok" label="Yours" /> : <StatusChip status="pending" label="Suggested" />}</Td>
        <Td>{f.cursor ? <Code>{f.cursor}</Code> : <span className="text-gray-400">nothing yet</span>}</Td>
        <Td>
          {f.last_run_status
            ? <div className="space-y-0.5"><StatusChip status={f.last_run_status} tone={statusTone(f.last_run_status)} /><div className="text-xs text-gray-500">{whenText(f.last_run_us)}</div></div>
            : <span className="text-gray-400">never</span>}
        </Td>
        <Td num>{num(f.records_held)}</Td>
        <Td>
          <OnOff
            on={f.enabled}
            label={`${f.label} feed`}
            busy={busy === 'toggle'}
            disabled={!canManage || !!busy}
            title={canManage ? (f.enabled ? 'Switch this feed off' : 'Switch this feed on') : 'You need the Manage settings permission.'}
            onToggle={() => void toggle()}
          />
        </Td>
        <Td>
          <div className="flex flex-wrap justify-end gap-2">
            <Btn asChild size="sm" variant="outline"><Link to={erpConnUrl(c.id, `mapping/${encodeURIComponent(f.key)}`)}>Mapping</Link></Btn>
            <Btn size="sm" disabled={!!blocked || !!busy || feedRun.working} title={blocked ?? 'Fetch what changed since the last run'} onClick={sync} aria-busy={feedRun.working && how === 'sync'}>
              {feedRun.working && how === 'sync' ? 'Fetching…' : 'Fetch now'}
            </Btn>
            <Btn
              size="sm"
              variant="outline"
              disabled={!!blocked || !!busy || feedRun.working}
              title={blocked ?? `Read everything since ${fromText} again, not only what changed since “Up to”`}
              onClick={() => setAskBackfill(true)}
              aria-busy={feedRun.working && how === 'backfill'}
            >
              {feedRun.working && how === 'backfill' ? 'Reading…' : 'Read whole history again'}
            </Btn>
          </div>
          <ConfirmDialog
            open={askBackfill}
            title={`Read all of ${f.label || f.key} again?`}
            confirmLabel="Read whole history again"
            onClose={() => setAskBackfill(false)}
            onConfirm={backfill}
          >
            <p>
              This clears “Up to” and asks {c.label} for everything since {fromText} again, not only what changed since the last run.
            </p>
            <p>
              Records already held are updated in place, never deleted{isStock ? ', so store stock keeps its figures while it runs' : ''}.{' '}
              {isStock ? 'For stock this can take a few minutes.' : 'A long history can take a few minutes.'} You can leave this page: the Run log tab shows it to its end.
            </p>
            <p>Use it after correcting a setting (the provider, say) that made earlier fetches come back empty or wrong.</p>
          </ConfirmDialog>
        </Td>
      </Tr>
      {(note || runNote) && (
        <tr>
          <td colSpan={7} className="space-y-2 px-4 pb-3">
            {note && <Notice tone={note.ok ? 'good' : 'bad'}>{note.text}</Notice>}
            {runNote && <Notice tone={runNote.tone}>{runNote.text}</Notice>}
          </td>
        </tr>
      )}
    </>
  );
}

/* ── the run log ────────────────────────────────────────────────────────── */

function Runs({ c }: { c: ErpConnection }) {
  const runs = useLoad(() => erpApi.runs(c.id, 50), [c.id]);
  const items = runs.data?.items ?? [];
  return (
    <SectionCard
      title="Run log"
      description="Every fetch of every feed, newest first — by the hourly run or by hand."
      action={<Btn variant="outline" size="sm" onClick={() => void runs.reload()} disabled={runs.loading}><RefreshCw /> Refresh</Btn>}
      flush
    >
      {runs.loading && !runs.data && <div className="p-5"><Loading label="Reading the run log…" /></div>}
      {!!runs.error && <div className="p-5"><ErrorNote error={runs.error} what="The run log" onRetry={() => void runs.reload()} /></div>}
      {runs.data && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <THead>
              <Th>Started</Th><Th>Feed</Th><Th>How</Th><Th>Ended</Th><Th num>Read</Th><Th num>Changed</Th><Th>Window</Th>
            </THead>
            <TBody>
              {items.length === 0 && <EmptyRow colSpan={7}>Nothing has run yet. Fetch a feed, or wait for the hourly run.</EmptyRow>}
              {items.map((r) => {
                const rejected = readRejected(r.rejected);
                const bad = r.status === 'failed' || r.rows_unkeyed > 0 || rejected.length > 0;
                return (
                  <Tr key={r.id} className={r.status === 'failed' ? 'bg-red-50/40' : undefined}>
                    <Td className="whitespace-nowrap">{whenText(r.started_us)}</Td>
                    <Td>{r.feed}</Td>
                    <Td>{r.trigger === 'schedule' ? 'Hourly' : r.trigger === 'manual' ? 'By hand' : r.trigger === 'backfill' ? 'Whole history' : r.trigger}</Td>
                    <Td><StatusChip status={r.status} tone={statusTone(r.status)} /></Td>
                    <Td num>{num(r.rows_fetched)}</Td>
                    <Td num>{num(r.records_changed)}</Td>
                    <Td>
                      {r.cursor_from ? <Code>{r.cursor_from}</Code> : <span className="text-gray-400">the start</span>}
                      {' → '}
                      {r.cursor_to ? <Code>{r.cursor_to}</Code> : <span className="text-gray-400">unchanged</span>}
                      {bad && (
                        <div className="mt-1 text-xs text-red-700">
                          {r.message}
                          {r.rows_unkeyed > 0 && <> {plural(r.rows_unkeyed, 'row')} could not be identified and were not stored.</>}
                          {rejected.length > 0 && <> Values that would not convert: {rejected.map(([k, v]) => `${k} (${num(v)})`).join(', ')}.</>}
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </table>
        </div>
      )}
      {runs.data && items.length > 0 && (
        <p className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-500">The {num(items.length)} most recent of {num(runs.data.total)} runs.</p>
      )}
    </SectionCard>
  );
}

/* ── what the mirror holds ──────────────────────────────────────────────── */

const PAGE = 20;

function Records({ c }: { c: ErpConnection }) {
  const entities = [...new Set(c.feeds.map((f) => f.entity))];
  const [entity, setEntity] = useState(entities.includes('stock') ? 'stock' : entities[0] ?? '');
  const [page, setPage] = useState(1);
  const offset = (page - 1) * PAGE;
  const rows = useLoad(() => erpApi.records(c.id, entity, PAGE, offset), [c.id, entity, offset], !!entity);
  if (!entities.length) return <EmptyState title="This connection holds nothing yet." />;
  return (
    <SectionCard
      title="What we hold"
      description="This store’s own copy of what the ERP sent, exactly as it arrived and as we read it."
      action={(
        <Field className="w-44" label={<span className="sr-only">Which records</span>}>
          <SelectInput aria-label="Which records" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
            {entities.map((k) => <option key={k} value={k}>{k}</option>)}
          </SelectInput>
        </Field>
      )}
    >
      {rows.loading && <Loading label={`Reading the ${entity} records…`} />}
      {!!rows.error && <ErrorNote error={rows.error} what="The ERP copy" onRetry={() => void rows.reload()} />}
      {rows.data && !rows.loading && rows.data.items.length === 0 && (
        <EmptyState title={`No ${entity} records yet.`} description="Fetch the feed that fills them." />
      )}
      {rows.data && !rows.loading && rows.data.items.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{plural(rows.data.total, 'record')} held.</p>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {rows.data.items.map((r) => (
              <li key={r.natural_key} className="p-3">
                <details>
                  <summary className="cursor-pointer"><Code>{r.natural_key}</Code></summary>
                  <div className="mt-2 space-y-2">
                    <Pre>{prettyJson(r.record)}</Pre>
                    <details>
                      <summary className="cursor-pointer text-xs text-gray-600">The row exactly as the ERP sent it</summary>
                      <div className="mt-2"><Pre>{prettyJson(r.raw)}</Pre></div>
                    </details>
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE} total={rows.data.total} onPage={setPage} />
        </div>
      )}
    </SectionCard>
  );
}

/* ── settings ───────────────────────────────────────────────────────────── */

function Settings({ c, connector, connectorLoading, onChange }: { c: ErpConnection; connector: ErpConnector | null; connectorLoading: boolean; onChange: () => void }) {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(MANAGE);
  const nav = useNavigate();
  const [label, setLabel] = useState(c.label);
  const [currency, setCurrency] = useState(c.currency);
  const [timezone, setTimezone] = useState(c.timezone);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'' | 'save' | 'pause' | 'archive'>('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [askArchive, setAskArchive] = useState(false);
  const noPerm = canManage ? undefined : 'You need the Manage settings permission.';
  // The stock settings have their own tab; they are left out here so there is one place to change them.
  // So are the order-push ones, while the server reports them ("Orders to the ERP" below).
  const pushKeys: string[] = c.order_push ? Object.values(ORDER_PUSH_KEYS) : [];
  const fields = (connector?.config_fields ?? []).filter((f) => f.key !== 'apply_stock' && f.key !== 'stock_branches' && !pushKeys.includes(f.key));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setNote(null);
    try {
      await erpApi.update(c.id, {
        label: label.trim(),
        currency: currency.trim(),
        timezone: timezone.trim(),
        // Only fields actually typed into are sent: an untouched secret keeps its value.
        config: Object.fromEntries(Object.entries(config).filter(([, v]) => v !== '')),
      });
      setConfig({});
      setNote({ ok: true, text: 'Saved.' });
      onChange();
    } catch (err) {
      setNote({ ok: false, text: errorText(err) });
    } finally {
      setBusy('');
    }
  };

  const setEnabled = async (enabled: boolean) => {
    setBusy('pause');
    setNote(null);
    try {
      await erpApi.update(c.id, { enabled });
      setNote({ ok: true, text: enabled ? 'The hourly run will include this connection again.' : 'Paused: the hourly run will skip it.' });
      onChange();
    } catch (err) {
      setNote({ ok: false, text: errorText(err) });
    } finally {
      setBusy('');
    }
  };

  const archive = async () => {
    setBusy('archive');
    setNote(null);
    try {
      await erpApi.archive(c.id);
      nav(ERP_HOME);
    } catch (err) {
      setAskArchive(false);
      setNote({ ok: false, text: errorText(err) });
      setBusy('');
    }
  };

  const held = c.feeds.reduce((sum, f) => sum + f.records_held, 0);

  return (
    <div className="space-y-4">
      {note && <Notice tone={note.ok ? 'good' : 'bad'}>{note.text}</Notice>}
      <SectionCard title="This connection">
        <form className="space-y-4" onSubmit={(e) => void save(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name it"><TextInput value={label} disabled={!canManage} onChange={(e) => setLabel(e.target.value)} /></Field>
            <Field label="Currency">
              <TextInput value={currency} maxLength={3} disabled={!canManage} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
              <span className="text-xs text-gray-500">Every amount this ERP sends is read in this currency.</span>
            </Field>
            <Field label="Time zone">
              <TextInput value={timezone} disabled={!canManage} onChange={(e) => setTimezone(e.target.value)} />
              <span className="text-xs text-gray-500">The dates this ERP writes are read as this zone's.</span>
            </Field>
            {fields.map((f) => {
              const filled = c.configured.includes(f.key);
              return (
                <Field key={f.key} label={<>{f.label}{f.required && <span className="text-red-600" aria-hidden> *</span>}</>}>
                  <TextInput
                    type={f.secret ? 'password' : 'text'}
                    autoComplete={f.secret ? 'new-password' : 'off'}
                    disabled={!canManage}
                    placeholder={filled ? (f.secret ? '••••••••' : 'set — type to replace') : 'not set'}
                    value={config[f.key] ?? ''}
                    onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                  />
                  <span className="text-xs text-gray-500">
                    {f.help}{f.secret ? ' Saved and never shown again — leave blank to keep it.' : filled ? ' Leave blank to keep what is saved.' : ''}
                  </span>
                </Field>
              );
            })}
          </div>
          {connectorLoading && <p className="text-xs text-gray-500">Reading this ERP’s settings…</p>}
          {!connectorLoading && !connector && <p className="text-xs text-gray-500">This server did not describe this ERP’s own settings, so only the name, currency and zone can be changed here.</p>}
          {c.missing.length > 0 && <Notice tone="warn" title="Still to fill in">{c.missing.join(', ')}.</Notice>}
          <div className="flex justify-end">
            <Btn type="submit" disabled={!canManage || !!busy} title={noPerm}>{busy === 'save' ? 'Saving…' : 'Save'}</Btn>
          </div>
        </form>
      </SectionCard>

      {c.order_push && <ErpOrderPushSettingsCard c={c} settings={c.order_push} onChange={onChange} />}

      <SectionCard title="Pause or disconnect">
        <p className="text-sm text-gray-700">
          {c.enabled
            ? 'Pausing stops the hourly run, including the hourly stock update. Nothing already fetched is lost.'
            : 'This connection is paused: the hourly run skips it, so store stock is not being updated from it.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="outline" disabled={!canManage || !!busy} title={noPerm} onClick={() => void setEnabled(!c.enabled)}>
            {busy === 'pause' ? 'Saving…' : c.enabled ? 'Pause the hourly run' : 'Start the hourly run again'}
          </Btn>
          <span className="flex-1" />
          <Btn variant="dangerOutline" disabled={!canManage || !!busy} title={noPerm} onClick={() => setAskArchive(true)}>Disconnect</Btn>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={askArchive}
        title={`Disconnect ${c.label}?`}
        confirmLabel="Disconnect"
        danger
        busy={busy === 'archive'}
        onClose={() => setAskArchive(false)}
        onConfirm={() => void archive()}
      >
        <p>
          The hourly run stops, store stock is no longer set from this ERP, and the connection leaves the list. Nothing is deleted: the{' '}
          {plural(held, 'record')} it fetched and the mappings you saved stay in the database.
        </p>
        <p>Connecting the same ERP again starts a new connection, so its form and mappings would be filled in afresh.</p>
      </ConfirmDialog>
    </div>
  );
}
