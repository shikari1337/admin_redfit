import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, SectionCard, Btn, Chip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, TextInput, SelectInput, Field,
} from '../../components/erp';

/**
 * STATUTORY RATE CODES — the owner/CA screen for date-effective GST.
 *
 * Plain-language promise: "When the government changes a GST rate, documents
 * automatically use the rate that was law on their own date." Old invoices (and
 * credit notes raised against them) keep the old rate; new documents get the new
 * one — without editing a single product.
 *
 * Two deliberate locks, both shown here:
 *   1. the master switch (off by default), and
 *   2. a per-tax-rule link to a CITED statutory code.
 * A tax rule with no link keeps its own typed-in rate, always.
 */

interface TaxRuleRow {
  id: string; name: string; staticRate: number; isActive: boolean; isInclusive: boolean;
  ruleCode: string | null; effectiveRate: number; rateSource: 'static' | 'registry'; note: string;
}
interface CodeVersion {
  ratePct: number | null; effectiveFrom: string; effectiveTo: string | null;
  statutoryRef: string; sourceUrl: string | null; verificationState: string; notes: string | null;
}
interface CodeRow {
  ruleCode: string; currentRatePct: number | null; currentEffectiveFrom: string | null;
  versions: CodeVersion[];
}

const today = () => new Date().toISOString().slice(0, 10);

/** Place-of-supply rule (IGST s.10) — see backend utils/placeOfSupply.ts. */
type PosRule = 'ship_to' | 'bill_to_when_present';
const POS_RULE_LABEL: Record<PosRule, string> = {
  ship_to: 'Where the goods are delivered (ship-to) — s.10(1)(a)',
  bill_to_when_present: 'The buyer\'s own state when it differs (bill-to) — s.10(1)(b)',
};

const GstRateCodes: React.FC = () => {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('accounting.post');

  const [asOf, setAsOf] = useState(today());
  const [data, setData] = useState<{
    dateEffectiveRates: boolean; posRule?: PosRule; asOf: string;
    taxRules: TaxRuleRow[]; registryCodes: CodeRow[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [openCode, setOpenCode] = useState<string | null>(null);

  const load = async (date = asOf) => {
    setLoading(true);
    try {
      setData(payload(await api.get('/accounting/gst-rates', { params: { asOf: date } })));
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not load rate codes.' });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const toggleEngine = async (enabled: boolean) => {
    setSaving('config');
    setMsg(null);
    try {
      await api.put('/accounting/gst-rates/config', { dateEffectiveRates: enabled });
      setMsg({
        kind: 'ok',
        text: enabled
          ? 'Date-effective rates are ON. Linked tax rules now resolve their rate from each document’s date.'
          : 'Date-effective rates are OFF. Every tax rule uses the rate typed into it, exactly as before.',
      });
      await load();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not change the setting.' });
    } finally { setSaving(null); }
  };

  const savePosRule = async (rule: PosRule) => {
    if (!data) return;
    setSaving('posRule');
    setMsg(null);
    try {
      await api.put('/accounting/gst-rates/config', {
        dateEffectiveRates: data.dateEffectiveRates, posRule: rule,
      });
      setMsg({
        kind: 'ok',
        text: rule === 'bill_to_when_present'
          ? 'Place of supply now follows the BUYER’s state when it differs from the delivery address (IGST s.10(1)(b)). This changes CGST+SGST vs IGST on new bill-to/ship-to documents.'
          : 'Place of supply follows the DELIVERY address, exactly as before.',
      });
      await load();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not change the setting.' });
    } finally { setSaving(null); }
  };

  const linkRule = async (taxRuleId: string, ruleCode: string) => {
    setSaving(taxRuleId);
    setMsg(null);
    try {
      await api.put(`/accounting/gst-rates/tax-rules/${taxRuleId}`, { ruleCode: ruleCode || null });
      setMsg({ kind: 'ok', text: ruleCode ? `Linked to ${ruleCode}.` : 'Link removed — this rule uses its own rate.' });
      await load();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? 'Could not save the link.' });
    } finally { setSaving(null); }
  };

  const codes = data?.registryCodes ?? [];
  const timeline = codes.find((c) => c.ruleCode === openCode);

  return (
    <Page>
      <PageHeader
        title="Statutory rate codes"
        description="When the government changes a GST rate, documents automatically use the rate that was law on their date. Link each of your tax rules to the official rule it follows, and old invoices keep their old rate while new ones get the new one — without touching a single product."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Check rates as on">
              <TextInput type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </Field>
            <Btn onClick={() => load(asOf)}>Check</Btn>
          </div>
        }
      />

      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${msg.kind === 'ok'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-red-300 bg-red-50 text-red-800'}`}>
          {msg.text}
        </div>
      )}

      <SectionCard
        title="Use the rate that was law on each document's date"
        description="Off by default. While it is off nothing changes: every tax rule charges the rate typed into it. Turn it on only after a CA has checked the links below — it changes the tax printed on new documents."
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="text-sm text-gray-600">
            <div className="mb-1 font-medium text-gray-900">
              Currently{' '}
              {data?.dateEffectiveRates
                ? <span className="text-emerald-700">ON — linked rules resolve by date</span>
                : <span className="text-gray-700">OFF — every rule uses its own typed-in rate</span>}
            </div>
            Example: homoeopathic medicines were 12% until 21 September 2025 and 5% from 22 September 2025.
            With this on, an invoice dated 1 September 2025 charges 12% and one dated 1 October 2025 charges 5% —
            from the same tax rule.
          </div>
          <Btn
            variant={data?.dateEffectiveRates ? 'danger' : 'success'}
            disabled={!canWrite || saving === 'config' || !data}
            onClick={() => toggleEngine(!data?.dateEffectiveRates)}
          >
            {saving === 'config' ? 'Saving…' : data?.dateEffectiveRates ? 'Switch off' : 'Switch on'}
          </Btn>
        </div>
      </SectionCard>

      <SectionCard
        title="Place of supply on a bill-to / ship-to sale"
        description="Which state decides CGST+SGST vs IGST when the person paying and the address you deliver to are in different states. Delivery address is the default and matches how every existing document was taxed."
      >
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 py-4">
          <div className="max-w-2xl text-sm text-gray-600">
            <div className="mb-1 font-medium text-gray-900">
              Currently{' '}
              {data?.posRule === 'bill_to_when_present'
                ? <span className="text-amber-700">the buyer’s state (bill-to) when it differs</span>
                : <span className="text-gray-700">the delivery address (ship-to)</span>}
            </div>
            Example: a Delhi wholesaler buys from your Karnataka warehouse and asks you to deliver
            straight to his customer in Karnataka. On “delivery address” that is an in-state sale
            (CGST+SGST). Under IGST s.10(1)(b) the supply was made to the Delhi buyer, so it is an
            inter-state sale (IGST). Only change this on a CA’s advice — it changes the tax printed on
            new invoices. Where the buyer has a GSTIN, its first two digits decide the state.
          </div>
          <Field label="Place of supply follows">
            <SelectInput
              value={data?.posRule ?? 'ship_to'}
              disabled={!canWrite || saving === 'posRule' || !data}
              onChange={(e) => savePosRule(e.target.value as PosRule)}
              className="min-w-[24rem]"
            >
              {(Object.keys(POS_RULE_LABEL) as PosRule[]).map((r) => (
                <option key={r} value={r}>{POS_RULE_LABEL[r]}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Your tax rules"
        description="Link a rule to the official rate it follows. Leave it unlinked and the rule keeps charging the rate you typed in — that is always the safe default."
      >
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Tax rule</Th>
              <Th num>Rate typed in</Th>
              <Th>Official rule it follows</Th>
              <Th num>Rate on {data?.asOf ?? asOf}</Th>
              <Th>Why</Th>
            </THead>
            <TBody>
              {loading && <EmptyRow colSpan={5}>Loading…</EmptyRow>}
              {!loading && (data?.taxRules.length ?? 0) === 0 &&
                <EmptyRow colSpan={5}>No tax rules yet. Create them under Settings → Tax rules.</EmptyRow>}
              {!loading && data?.taxRules.map((t) => (
                <Tr key={t.id}>
                  <Td className="font-medium">
                    {t.name}
                    {!t.isActive && <Chip tone="neutral" className="ml-2">inactive</Chip>}
                    {t.isInclusive && <Chip tone="blue" className="ml-2">price includes tax</Chip>}
                  </Td>
                  <Td num>{t.staticRate}%</Td>
                  <Td>
                    <SelectInput
                      value={t.ruleCode ?? ''}
                      disabled={!canWrite || saving === t.id}
                      onChange={(e) => linkRule(t.id, e.target.value)}
                      className="min-w-[19rem]"
                    >
                      <option value="">— not linked (use my own rate) —</option>
                      {codes.map((c) => (
                        <option key={c.ruleCode} value={c.ruleCode}>
                          {c.ruleCode}{c.currentRatePct !== null ? ` — ${c.currentRatePct}% today` : ''}
                        </option>
                      ))}
                    </SelectInput>
                  </Td>
                  <Td num className="font-semibold">
                    {t.effectiveRate}%
                    {t.rateSource === 'registry'
                      ? <Chip tone="green" className="ml-2">official</Chip>
                      : <Chip tone="neutral" className="ml-2">your rate</Chip>}
                  </Td>
                  <Td muted className="max-w-[26rem]">{t.note}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>

      <SectionCard
        title="Official rate rules on record"
        description="Every rate here is stored with the notification it came from and the exact dates it applied. Click a code to see its full history — that is what a CA verifies."
      >
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Code</Th><Th num>Rate today</Th><Th>In force since</Th><Th num>Versions</Th><Th />
            </THead>
            <TBody>
              {codes.length === 0 && <EmptyRow colSpan={5}>No GST rate rules in the statutory registry.</EmptyRow>}
              {codes.map((c) => (
                <Tr key={c.ruleCode}>
                  <Td className="font-medium">{c.ruleCode}</Td>
                  <Td num>{c.currentRatePct !== null ? `${c.currentRatePct}%` : '—'}</Td>
                  <Td muted>{c.currentEffectiveFrom ?? '—'}</Td>
                  <Td num>{c.versions.length}</Td>
                  <Td>
                    <Btn variant="outline"
                      onClick={() => setOpenCode(openCode === c.ruleCode ? null : c.ruleCode)}>
                      {openCode === c.ruleCode ? 'Hide history' : 'Rate history'}
                    </Btn>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>

      {timeline && (
        <SectionCard
          title={`Rate history — ${timeline.ruleCode}`}
          description="Each row is one version of the rule, with the dates it applied and the source it was taken from. A document dated inside a row's window uses that row's rate."
        >
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th num>Rate</Th><Th>From</Th><Th>To</Th><Th>Source</Th><Th>Verified</Th>
              </THead>
              <TBody>
                {timeline.versions.map((v, i) => (
                  <Tr key={i}>
                    <Td num className="font-semibold">{v.ratePct !== null ? `${v.ratePct}%` : '—'}</Td>
                    <Td>{v.effectiveFrom}</Td>
                    <Td>{v.effectiveTo ?? 'still in force'}</Td>
                    <Td muted className="max-w-[30rem]">
                      {v.statutoryRef}
                      {v.sourceUrl && (
                        <>
                          {' '}
                          <a href={v.sourceUrl} target="_blank" rel="noreferrer"
                            className="text-blue-600 underline">source</a>
                        </>
                      )}
                      {v.notes && <div className="mt-0.5 text-xs text-gray-500">{v.notes}</div>}
                    </Td>
                    <Td>
                      <Chip tone={v.verificationState === 'T1' ? 'green' : v.verificationState === 'T2' ? 'blue' : 'amber'}>
                        {v.verificationState}
                      </Chip>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </SectionCard>
      )}

      <SectionCard title="What to know before switching this on" flush>
        <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
          <li>Nothing changes until you both link a tax rule AND switch the setting on. Unlinked rules always keep their own rate.</li>
          <li>Rates come from the statutory registry with their source notification attached — they are never guessed.</li>
          <li>If no official rule was in force on a document's date, that document falls back to your typed-in rate rather than failing.</li>
          <li>Changing a rate affects the tax printed on documents. Have a CA confirm the links first — that is what the “Verified” column is for.</li>
        </ul>
      </SectionCard>
    </Page>
  );
};

export default GstRateCodes;
