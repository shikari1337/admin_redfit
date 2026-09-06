import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';
import { localeDate } from '../../../utils/date';

/**
 * AI Ads Studio — propose, review, apply.
 *
 * The review step is real, not decorative: every field of a generated plan is
 * editable here and the edited object is what gets sent to
 * POST /connectors/ai/drafts/:id/apply. Nothing reaches Google until Apply is
 * pressed, and campaigns always arrive PAUSED, so a mistake costs nothing.
 */

const KIND_LABEL: Record<string, string> = {
  campaign_plan: 'Campaign plan',
  keywords: 'Keywords',
  rsa: 'Ad copy',
  pmax_assets: 'Performance Max assets',
  optimization: 'Account audit',
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-blue-100 text-blue-800',
  applied: 'bg-green-100 text-green-800',
  discarded: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-800',
};

const SEVERITY_STYLE: Record<string, string> = {
  high: 'border-red-300 bg-red-50',
  medium: 'border-amber-300 bg-amber-50',
  low: 'border-gray-200 bg-gray-50',
};

type Tab = 'campaign' | 'keywords' | 'copy' | 'pmax' | 'audit';

const AdsAiStudio: React.FC = () => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm?.('ads.manage') ?? true;

  const [tab, setTab] = useState<Tab>('campaign');
  const [drafts, setDrafts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [edited, setEdited] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [form, setForm] = useState<Record<string, any>>({
    goal: '', brandName: '', landingUrl: '', monthlyBudget: '',
    campaignType: 'search', targetAudience: '',
    seedTopic: '', productOrTheme: '', usp: '', theme: '',
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const loadDrafts = useCallback(async () => {
    try { setDrafts(payload<any[]>(await api.get('/connectors/ai/drafts')) ?? []); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  }, []);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  const openDraft = async (id: string) => {
    setError(''); setInfo('');
    try {
      const d = payload<any>(await api.get(`/connectors/ai/drafts/${id}`));
      setSelected(d);
      setEdited(JSON.parse(JSON.stringify(d.output ?? {})));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const generate = async (endpoint: string, body: any, label: string) => {
    setBusy(label); setError(''); setInfo('');
    try {
      const d = payload<any>(await api.post(`/connectors/ai/${endpoint}`, body));
      setInfo(`${KIND_LABEL[d.kind] ?? 'Draft'} generated — review it below, then apply.`);
      await loadDrafts();
      await openDraft(d.id);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
    } finally { setBusy(''); }
  };

  const applyDraft = async () => {
    if (!selected) return;
    if (!window.confirm(
      'Apply this plan to Google Ads?\n\nThe campaign will be created PAUSED — it will not spend '
      + 'until you activate it in Google Ads.')) return;
    setBusy('apply'); setError(''); setInfo('');
    try {
      const r = payload<any>(await api.post(`/connectors/ai/drafts/${selected.id}/apply`, {
        edited,
        landingUrl: selected.input?.landingUrl ?? form.landingUrl,
        brandName: selected.input?.brandName ?? form.brandName,
      }));
      setInfo(
        `Created campaign ${r.campaignId} (PAUSED) with ${r.adGroups?.length ?? 0} ad groups, `
        + `${r.negativeKeywords ?? 0} negative keywords.`
        + (r.warnings?.length ? ` ${r.warnings.length} warning(s) — see below.` : ''));
      await loadDrafts();
      await openDraft(selected.id);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message);
    } finally { setBusy(''); }
  };

  const discard = async (id: string) => {
    await api.post(`/connectors/ai/drafts/${id}/discard`, {});
    if (selected?.id === id) { setSelected(null); setEdited(null); }
    await loadDrafts();
  };

  const generateCreatives = async () => {
    if (!selected) return;
    const prompts: string[] = edited?.imagePrompts ?? [];
    const base = prompts[0] ?? window.prompt('Describe the image to generate:') ?? '';
    if (!base) return;
    setBusy('creative'); setError('');
    try {
      const r = payload<any>(await api.post('/connectors/ai/creative-set', {
        basePrompt: base, draftId: selected.id,
      }));
      setInfo(`Generated ${r.created?.length ?? 0} creatives.`
        + (r.failed?.length ? ` ${r.failed.length} failed.` : ''));
      await openDraft(selected.id);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(''); }
  };

  const Field: React.FC<{ label: string; k: string; type?: string; placeholder?: string }> =
    ({ label, k, type = 'text', placeholder }) => (
      <label className="block">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <input type={type} value={form[k] ?? ''} placeholder={placeholder}
          onChange={(e) => set(k, e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2 text-sm" />
      </label>
    );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI Ads Studio</h1>
          <p className="mt-1 text-sm text-gray-600">
            The AI proposes; you review and apply. Campaigns are always created <strong>paused</strong>,
            so nothing spends until you say so.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/panel/marketing/connections" className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
            Connections
          </Link>
          <Link to="/panel/marketing/ads" className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
            Ads Manager
          </Link>
        </div>
      </div>

      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {info && <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{info}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          {/* ── Generator ─────────────────────────────────────────── */}
          <div className="mb-6 rounded-lg border bg-white">
            <div className="flex flex-wrap gap-1 border-b p-2">
              {([
                ['campaign', 'Campaign plan'], ['keywords', 'Keywords'], ['copy', 'Ad copy'],
                ['pmax', 'Performance Max'], ['audit', 'Account audit'],
              ] as Array<[Tab, string]>).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`rounded px-3 py-1.5 text-sm ${
                    tab === k ? 'bg-primary text-primary-foreground' : 'hover:bg-gray-100'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {tab === 'campaign' && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Business goal" k="goal" placeholder="Sell more mother tinctures this month" />
                    <Field label="Brand name" k="brandName" placeholder="HomeoMead" />
                    <Field label="Landing page URL" k="landingUrl" placeholder="https://…" />
                    <Field label="Monthly budget (₹)" k="monthlyBudget" type="number" placeholder="30000" />
                    <label className="block">
                      <span className="text-xs font-medium text-gray-700">Campaign type</span>
                      <select value={form.campaignType} onChange={(e) => set('campaignType', e.target.value)}
                        className="mt-1 w-full rounded border px-3 py-2 text-sm">
                        {['search', 'shopping', 'performance_max', 'display', 'remarketing'].map((t) => (
                          <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </label>
                    <Field label="Target audience (optional)" k="targetAudience" placeholder="Homeopathy practitioners, 30-55" />
                  </div>
                  <button disabled={!canManage || busy === 'campaign' || !form.goal || !form.landingUrl || !form.brandName}
                    onClick={() => generate('plan-campaign', {
                      goal: form.goal, brandName: form.brandName, landingUrl: form.landingUrl,
                      campaignType: form.campaignType, targetAudience: form.targetAudience,
                      monthlyBudget: form.monthlyBudget ? Number(form.monthlyBudget) : undefined,
                    }, 'campaign')}
                    className="mt-4 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
                    {busy === 'campaign' ? 'Thinking…' : 'Generate campaign plan'}
                  </button>
                </>
              )}

              {tab === 'keywords' && (
                <>
                  <Field label="Seed topic" k="seedTopic" placeholder="arnica montana dilution" />
                  <p className="mt-2 text-xs text-gray-500">
                    Grounded on your catalog, your organic Search Console queries, and — if Google Ads is
                    connected — your real paid search terms.
                  </p>
                  <button disabled={!canManage || busy === 'keywords' || !form.seedTopic}
                    onClick={() => generate('plan-keywords', { seedTopic: form.seedTopic }, 'keywords')}
                    className="mt-4 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
                    {busy === 'keywords' ? 'Thinking…' : 'Generate keywords'}
                  </button>
                </>
              )}

              {tab === 'copy' && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Product or theme" k="productOrTheme" placeholder="Arnica Montana 30CH" />
                    <Field label="Brand name" k="brandName" />
                    <Field label="Landing page URL" k="landingUrl" placeholder="https://…" />
                    <Field label="Key selling points" k="usp" placeholder="Free delivery over ₹499, genuine brands" />
                  </div>
                  <button disabled={!canManage || busy === 'copy' || !form.productOrTheme || !form.landingUrl || !form.brandName}
                    onClick={() => generate('plan-ad-copy', {
                      productOrTheme: form.productOrTheme, landingUrl: form.landingUrl,
                      brandName: form.brandName, usp: form.usp,
                    }, 'copy')}
                    className="mt-4 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
                    {busy === 'copy' ? 'Writing…' : 'Generate ad copy'}
                  </button>
                </>
              )}

              {tab === 'pmax' && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Theme" k="theme" placeholder="Winter immunity range" />
                    <Field label="Brand name" k="brandName" />
                    <Field label="Landing page URL" k="landingUrl" placeholder="https://…" />
                  </div>
                  <button disabled={!canManage || busy === 'pmax' || !form.theme || !form.landingUrl || !form.brandName}
                    onClick={() => generate('plan-pmax', {
                      theme: form.theme, landingUrl: form.landingUrl, brandName: form.brandName,
                    }, 'pmax')}
                    className="mt-4 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
                    {busy === 'pmax' ? 'Thinking…' : 'Generate PMax assets'}
                  </button>
                </>
              )}

              {tab === 'audit' && (
                <>
                  <p className="text-sm text-gray-600">
                    Reads your live Google Ads campaigns, search terms and keyword performance from the last
                    30 days and returns ranked findings. Advisory only — nothing is changed.
                  </p>
                  <button disabled={busy === 'audit'}
                    onClick={() => generate('audit', {}, 'audit')}
                    className="mt-4 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
                    {busy === 'audit' ? 'Analysing…' : 'Run account audit'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Review ────────────────────────────────────────────── */}
          {selected && (
            <div className="rounded-lg border bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                <div>
                  <h2 className="font-semibold">{selected.title}</h2>
                  <p className="text-xs text-gray-500">
                    {KIND_LABEL[selected.kind] ?? selected.kind} ·{' '}
                    <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[selected.status]}`}>{selected.status}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  {selected.kind === 'pmax_assets' && (
                    <button onClick={generateCreatives} disabled={busy === 'creative' || !canManage}
                      className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
                      {busy === 'creative' ? 'Generating…' : 'Generate images'}
                    </button>
                  )}
                  {selected.kind === 'campaign_plan' && selected.status === 'draft' && (
                    <button onClick={applyDraft} disabled={busy === 'apply' || !canManage}
                      className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
                      {busy === 'apply' ? 'Applying…' : 'Apply to Google Ads'}
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4">
                {selected.rationale && (
                  <p className="mb-4 rounded bg-gray-50 p-3 text-sm text-gray-700">{selected.rationale}</p>
                )}

                {/* Audit findings */}
                {selected.kind === 'optimization' && (
                  <div className="space-y-3">
                    {(edited?.findings ?? []).map((f: any, i: number) => (
                      <div key={i} className={`rounded border p-3 ${SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.low}`}>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase">
                            {f.severity}
                          </span>
                          <span className="text-xs text-gray-500">{f.area}</span>
                        </div>
                        <h4 className="mt-1 font-medium">{f.title}</h4>
                        <p className="mt-1 text-sm text-gray-700">{f.detail}</p>
                        <p className="mt-2 text-sm"><strong>Do this:</strong> {f.suggestedAction}</p>
                        {f.estimatedImpact && (
                          <p className="mt-1 text-xs text-gray-600">Estimated impact: {f.estimatedImpact}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Campaign plan — editable */}
                {selected.kind === 'campaign_plan' && edited && (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700">Campaign name</span>
                        <input value={edited.campaignName ?? ''}
                          onChange={(e) => setEdited({ ...edited, campaignName: e.target.value })}
                          className="mt-1 w-full rounded border px-3 py-2 text-sm" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700">Type</span>
                        <input value={edited.campaignType ?? ''} readOnly
                          className="mt-1 w-full rounded border bg-gray-50 px-3 py-2 text-sm" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700">Daily budget (₹)</span>
                        <input type="number" value={edited.recommendedDailyBudget ?? 0}
                          onChange={(e) => setEdited({ ...edited, recommendedDailyBudget: Number(e.target.value) })}
                          className="mt-1 w-full rounded border px-3 py-2 text-sm" />
                      </label>
                    </div>
                    {edited.budgetRationale && (
                      <p className="text-xs text-gray-600">{edited.budgetRationale}</p>
                    )}

                    {(edited.adGroups ?? []).map((ag: any, i: number) => (
                      <div key={i} className="rounded border p-3">
                        <div className="flex items-center justify-between">
                          <input value={ag.name}
                            onChange={(e) => {
                              const next = [...edited.adGroups];
                              next[i] = { ...ag, name: e.target.value };
                              setEdited({ ...edited, adGroups: next });
                            }}
                            className="rounded border px-2 py-1 text-sm font-medium" />
                          <button onClick={() => setEdited({
                            ...edited, adGroups: edited.adGroups.filter((_: any, j: number) => j !== i),
                          })} className="text-xs text-red-600 hover:underline">Remove</button>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{ag.theme}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(ag.keywords ?? []).map((k: any, j: number) => (
                            <span key={j} className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                              {k.text} <em className="not-italic text-gray-400">{k.matchType}</em>
                            </span>
                          ))}
                        </div>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-gray-600">
                            {(ag.headlines ?? []).length} headlines · {(ag.descriptions ?? []).length} descriptions
                          </summary>
                          <div className="mt-2 space-y-1">
                            {(ag.headlines ?? []).map((h: string, j: number) => (
                              <div key={j} className="flex items-center gap-2">
                                <input value={h} maxLength={30}
                                  onChange={(e) => {
                                    const next = [...edited.adGroups];
                                    const hs = [...next[i].headlines]; hs[j] = e.target.value;
                                    next[i] = { ...ag, headlines: hs };
                                    setEdited({ ...edited, adGroups: next });
                                  }}
                                  className="flex-1 rounded border px-2 py-1 text-xs" />
                                <span className={`text-[10px] ${h.length > 30 ? 'text-red-600' : 'text-gray-400'}`}>
                                  {h.length}/30
                                </span>
                              </div>
                            ))}
                            {(ag.descriptions ?? []).map((d: string, j: number) => (
                              <div key={`d${j}`} className="flex items-center gap-2">
                                <input value={d} maxLength={90}
                                  onChange={(e) => {
                                    const next = [...edited.adGroups];
                                    const ds = [...next[i].descriptions]; ds[j] = e.target.value;
                                    next[i] = { ...ag, descriptions: ds };
                                    setEdited({ ...edited, adGroups: next });
                                  }}
                                  className="flex-1 rounded border px-2 py-1 text-xs" />
                                <span className={`text-[10px] ${d.length > 90 ? 'text-red-600' : 'text-gray-400'}`}>
                                  {d.length}/90
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    ))}

                    {(edited.negativeKeywords ?? []).length > 0 && (
                      <div className="rounded border p-3">
                        <h4 className="text-sm font-medium">Negative keywords</h4>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {edited.negativeKeywords.map((k: any, j: number) => (
                            <span key={j} className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-800">
                              −{k.text}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Keywords / RSA / PMax — raw but readable */}
                {['keywords', 'rsa', 'pmax_assets'].includes(selected.kind) && edited && (
                  <div className="space-y-3">
                    {Object.entries(edited).filter(([, v]) => Array.isArray(v)).map(([key, arr]: any) => (
                      <div key={key} className="rounded border p-3">
                        <h4 className="text-sm font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</h4>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {arr.map((item: any, j: number) => (
                            <span key={j} className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                              {typeof item === 'string' ? item : item.text ?? JSON.stringify(item)}
                              {item?.matchType && <em className="ml-1 not-italic text-gray-400">{item.matchType}</em>}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Generated creatives */}
                {!!selected.creatives?.length && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium">Generated creatives</h4>
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {selected.creatives.map((c: any) => (
                        <figure key={c.id} className="overflow-hidden rounded border">
                          <img src={c.asset_url} alt={c.meta?.slot ?? 'creative'} className="w-full object-cover" />
                          <figcaption className="px-2 py-1 text-[11px] text-gray-500">
                            {c.meta?.slot} · {c.aspect_ratio}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}

                {/* Apply warnings */}
                {!!selected.apply_result?.warnings?.length && (
                  <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
                    <h4 className="text-sm font-medium text-amber-900">Applied with warnings</h4>
                    <ul className="mt-1 list-inside list-disc text-xs text-amber-800">
                      {selected.apply_result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Draft list ─────────────────────────────────────────── */}
        <aside>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-600">Drafts</h3>
          <div className="space-y-2">
            {drafts.map((d) => (
              <div key={d.id}
                className={`cursor-pointer rounded border bg-white p-3 hover:border-primary ${
                  selected?.id === d.id ? 'border-primary ring-1 ring-primary' : ''}`}
                onClick={() => openDraft(d.id)}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{d.title}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[d.status]}`}>
                    {d.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                  <span>{KIND_LABEL[d.kind] ?? d.kind}</span>
                  <span>{localeDate(d.created_at, undefined, 'en-IN')}</span>
                </div>
                {d.status === 'draft' && canManage && (
                  <button onClick={(e) => { e.stopPropagation(); discard(d.id); }}
                    className="mt-1 text-[11px] text-red-600 hover:underline">Discard</button>
                )}
              </div>
            ))}
            {!drafts.length && (
              <p className="rounded border border-dashed p-4 text-center text-sm text-gray-500">
                No drafts yet. Generate one above.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AdsAiStudio;
