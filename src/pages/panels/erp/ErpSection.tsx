/**
 * Inventory ▸ ERP — connect a distributor's ERP, say once which of its fields is which of
 * ours, and let the hourly run keep the store's stock set from it (DEC-068).
 *
 * Ported from the generated console's hand-written ERP screens
 * (`growcord-rs/ui/apps/admin/src/screens/erp/ErpScreen.tsx`) onto this admin's own kit.
 * Permissions: `settings.read` to look, `settings.manage` to change anything; the server
 * decides, these screens only choose what to offer and say why a control is off.
 *
 *   /panel/inventory/erp                     connections
 *   /panel/inventory/erp/connect             connect one (form from the connector's config_fields)
 *   /panel/inventory/erp/c/:id/:tab?         one connection (stock · warehouses · feeds · mapping · runs · records · settings)
 */
import React, { useState } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { Cable, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Btn, Card, Chip, EmptyState, Field, Page, PageHeader, SectionCard, StatusChip, TextInput,
} from '@/components/erp';
import {
  ERP_HOME, erpApi, erpConnUrl, plural, stockFeed, whenText, applyText,
  type ErpConnection, type ErpConnector,
} from '../../../lib/v2/erp';
import { ErrorNote, Loading, MANAGE, Notice, READ, useLoad } from './shared';
import ErpConnectionPage from './ErpConnection';

const ErpSection: React.FC = () => {
  const { hasPerm } = useAuth();
  if (!hasPerm(READ)) {
    return (
      <Page width="narrow">
        <EmptyState
          icon={Cable}
          title="You cannot see the ERP connections."
          description="They are part of this store's settings, so reading them needs the Read settings permission. Ask an owner to add it to your role."
        />
      </Page>
    );
  }
  return (
    <Routes>
      <Route index element={<Connections />} />
      <Route path="connect" element={<Connect />} />
      <Route path="c/:id/*" element={<ErpConnectionPage />} />
      <Route path="*" element={<Page><EmptyState title="No such ERP page." action={<Link className="underline" to={ERP_HOME}>All ERP connections</Link>} /></Page>} />
    </Routes>
  );
};

export default ErpSection;

/* ── the list ───────────────────────────────────────────────────────────── */

function Connections() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm(MANAGE);
  const all = useLoad(() => erpApi.connections(), []);
  const list = all.data ?? [];
  const connectLink = canManage
    ? <Btn asChild><Link to={`${ERP_HOME}/connect`}><Plus /> Connect an ERP</Link></Btn>
    : null;
  return (
    <Page>
      <PageHeader
        icon={Cable}
        title="ERP"
        description="Your distributor's ERP holds the real stock and raises the real invoices. Connect it once and this store's stock is set from it, by SKU, every hour."
        actions={(
          <>
            <Btn variant="outline" onClick={() => void all.reload()} disabled={all.loading}><RefreshCw /> Refresh</Btn>
            {connectLink}
          </>
        )}
      />
      {all.loading && !all.data && <Loading label="Reading the ERP connections…" />}
      {!!all.error && <ErrorNote error={all.error} what="The ERP app" onRetry={() => void all.reload()} />}
      {all.data && list.length === 0 && (
        <Card>
          <EmptyState
            icon={Cable}
            title="No ERP is connected yet."
            description={canManage
              ? 'Connect one and this store will keep its stock in step with the distributor’s, every hour.'
              : 'Someone with the Manage settings permission can connect one.'}
            action={connectLink}
          />
        </Card>
      )}
      {list.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => <ConnectionCard key={c.id} c={c} />)}
        </div>
      )}
    </Page>
  );
}

function ConnectionCard({ c }: { c: ErpConnection }) {
  const held = c.feeds.reduce((sum, f) => sum + f.records_held, 0);
  const mapped = c.feeds.filter((f) => f.mapping_saved).length;
  const failing = c.feeds.filter((f) => f.last_run_status === 'failed').length;
  const stock = stockFeed(c);
  const last = c.last_stock_apply;
  return (
    <SectionCard
      title={c.label}
      description={`${c.connector} · ${c.currency} · ${c.timezone}`}
      action={c.enabled
        ? <StatusChip status={c.last_probe_ok === false ? 'failed' : 'active'} label={c.last_probe_ok === false ? 'Not reachable' : 'On'} />
        : <StatusChip status="pending" label="Paused" />}
    >
      <div className="space-y-3 text-sm">
        {c.missing.length > 0 && (
          <Notice tone="warn" title="Not finished">{plural(c.missing.length, 'setting')} still to fill in: {c.missing.join(', ')}.</Notice>
        )}
        {failing > 0 && <Notice tone="bad" title="A feed is failing">{plural(failing, 'feed')} ended badly on the last run.</Notice>}
        <p className="text-gray-700">{plural(c.feeds.length, 'feed')}, {mapped} mapped · {plural(held, 'record')} held</p>
        {stock && last !== undefined && (
          <p className="text-gray-700">
            <span className="font-medium">Stock: </span>
            {last ? <>{applyText(last, 'the ERP')} <span className="text-gray-500">({whenText(last.finished_us ?? last.started_us)})</span></> : 'not yet set from this ERP.'}
          </p>
        )}
        <p className="text-xs text-gray-500">Last tested {whenText(c.last_probe_us)}.</p>
        <Btn asChild size="sm"><Link to={erpConnUrl(c.id)}>Open</Link></Btn>
      </div>
    </SectionCard>
  );
}

/* ── connecting one ─────────────────────────────────────────────────────── */

/**
 * Choosing an ERP and filling in its form. The form is built from the connector's OWN
 * declaration (`config_fields`), so a second ERP added in Rust gets a working form here.
 */
function Connect() {
  const nav = useNavigate();
  const { hasPerm } = useAuth();
  const catalogue = useLoad(() => erpApi.connectors(), []);
  const [chosen, setChosen] = useState('');
  const [label, setLabel] = useState('');
  const [currency, setCurrency] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!hasPerm(MANAGE)) {
    return (
      <Page width="narrow">
        <EmptyState title="Connecting an ERP needs the Manage settings permission." action={<Link className="underline" to={ERP_HOME}>Back to ERP</Link>} />
      </Page>
    );
  }

  const connectors = catalogue.data ?? [];
  const connector = connectors.find((c) => c.key === chosen) ?? null;

  const pick = (c: ErpConnector) => {
    setChosen(c.key);
    setLabel(c.label);
    setCurrency(c.default_currency);
    setConfig(Object.fromEntries(c.config_fields.map((f) => [f.key, f.default ?? ''])));
    setError(null);
  };

  const unfilled = connector?.config_fields.filter((f) => f.required && !(config[f.key] ?? '').trim()) ?? [];

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connector || unfilled.length) return;
    setBusy(true);
    setError(null);
    try {
      const made = await erpApi.create({
        connector: connector.key,
        label: label.trim() || connector.label,
        currency: currency.trim() || connector.default_currency,
        timezone: timezone.trim(),
        enabled: true,
        // Blank fields are left out rather than saved as empty text: absent is reported as
        // missing, which is the truth; "" would look filled in.
        config: Object.fromEntries(Object.entries(config).filter(([, v]) => v.trim() !== '')),
      });
      nav(erpConnUrl(made.id));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page width="narrow">
      <PageHeader
        title="Connect an ERP"
        description="Nothing is fetched yet: this only records how to reach it. Test it and check the mapping next."
        actions={<Btn variant="outline" asChild><Link to={ERP_HOME}>Back</Link></Btn>}
      />
      <ol className="flex flex-wrap gap-2 text-xs font-medium" aria-label="Steps">
        <li><Chip tone={connector ? 'green' : 'blue'}>1. Choose the ERP</Chip></li>
        <li><Chip tone={connector ? 'blue' : 'neutral'}>2. How to reach it</Chip></li>
        <li><Chip>3. Test, then map its fields</Chip></li>
      </ol>

      <SectionCard title="Which ERP?">
        {catalogue.loading && <Loading label="Reading the ERPs this store could connect to…" />}
        {!!catalogue.error && <ErrorNote error={catalogue.error} what="Connecting an ERP" onRetry={() => void catalogue.reload()} />}
        {catalogue.data && !connectors.length && <EmptyState title="This server has no ERP connectors." />}
        <div className="grid gap-3 sm:grid-cols-2">
          {connectors.map((c) => (
            <div key={c.key} className={`rounded-lg border p-4 ${c.key === chosen ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-gray-900">{c.label}</div>
                {c.key === chosen && <Chip tone="green">Chosen</Chip>}
              </div>
              <p className="mt-1 text-sm text-gray-600">{c.description}</p>
              <p className="mt-1 text-xs text-gray-500">{c.family} · {plural(c.feeds.length, 'feed')} · amounts in {c.default_currency}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
                {c.feeds.map((f) => <li key={f.key}><span className="font-medium text-gray-800">{f.label}</span> — {f.description}</li>)}
              </ul>
              <Btn className="mt-3" size="sm" variant={c.key === chosen ? 'outline' : 'primary'} onClick={() => pick(c)} aria-pressed={c.key === chosen}>
                {c.key === chosen ? 'Chosen' : 'Choose'}
              </Btn>
            </div>
          ))}
        </div>
      </SectionCard>

      {connector && (
        <SectionCard title={`How to reach ${connector.label}`}>
          <form className="space-y-4" onSubmit={(e) => void create(e)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name it">
                <TextInput value={label} onChange={(e) => setLabel(e.target.value)} />
                <span className="text-xs text-gray-500">What this connection is called in your own panel.</span>
              </Field>
              <Field label="Currency">
                <TextInput value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
                <span className="text-xs text-gray-500">Every amount this ERP sends is read in this currency.</span>
              </Field>
              <Field label="Time zone">
                <TextInput value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                <span className="text-xs text-gray-500">The dates this ERP writes are read as this zone's.</span>
              </Field>
              {connector.config_fields.map((f) => (
                <Field key={f.key} label={<>{f.label}{f.required && <span className="text-red-600" aria-hidden> *</span>}</>}>
                  <TextInput
                    type={f.secret ? 'password' : 'text'}
                    autoComplete={f.secret ? 'new-password' : 'off'}
                    required={f.required}
                    value={config[f.key] ?? ''}
                    onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                  />
                  {f.help && <span className="text-xs text-gray-500">{f.help}</span>}
                </Field>
              ))}
            </div>
            {unfilled.length > 0 && <Notice tone="info" title="Still to fill in">{unfilled.map((f) => f.label).join(', ')}.</Notice>}
            {!!error && <ErrorNote error={error} what="Connecting an ERP" />}
            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="outline" asChild><Link to={ERP_HOME}>Cancel</Link></Btn>
              <Btn type="submit" disabled={busy || unfilled.length > 0} title={unfilled.length ? `Fill in ${unfilled.map((f) => f.label).join(', ')} first.` : undefined}>
                {busy ? 'Connecting…' : 'Connect'}
              </Btn>
            </div>
          </form>
        </SectionCard>
      )}
    </Page>
  );
}
