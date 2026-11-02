/**
 * `PUT /settings` (the legacy flat "save these sections" call) on v2 — MSG-0 §5, lane ADMIN-MSG-1.
 *
 * v2 has no flat settings write (`PATCH /commerce/settings`, settings.ts:445, is not mounted). Every store
 * setting is a registry definition written with `PATCH /commerce/settings/registry/{key}`, body
 * `{ fieldPath: value }` with the definition's own dotted field paths (`svc/settings_center.rs` `write`:
 * validated against the definition, its own write permission checked). So the call is answered by:
 *
 *   1. reading the registry once (`GET /commerce/settings/registry`) for each definition's field paths;
 *   2. for every top-level section of the body that IS a definition (`smtp`, `whatsapp_settings`, `razorpay`,
 *      `metaPixel`, `ga4`, `gemini`, `openai`, `aiPreferences`, …), flattening it to dotted paths and sending
 *      only the paths the definition declares, and only values that were given (a masked secret the page
 *      left out stays as it is);
 *   3. saying what could NOT be saved: a section or path this server has no setting for, when it carries
 *      something a person typed (a credential, host, address or id). Silent loss of a credential is the one
 *      thing this must never do.
 *
 * Sections are written one after the other; there is no cross-key transaction, so a refusal names what was
 * already saved.
 */
import { v2call } from '../http';

const S = '/api/v2/commerce';

/** A value a person typed that must not vanish silently. */
const MEANINGFUL = /(token|secret|key|password|sid|host|user|email|url|id|number)$/i;

function flatten(obj: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (obj !== undefined) {
    out[prefix] = obj;
  }
  return out;
}

const shown = (v: unknown) => typeof v === 'string' && v.trim() !== '';

export async function saveSettingsThroughRegistry(body: unknown): Promise<{ saved: string[]; notSaved: string[] }> {
  const sections = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const reg = await v2call<any>('GET', `${S}/settings/registry`);
  const defs: any[] = reg?.definitions ?? reg?.center?.definitions ?? [];
  const byKey = new Map<string, any>(defs.map((d) => [String(d?.key), d]));

  const saved: string[] = [];
  const notSaved: string[] = [];
  for (const [key, section] of Object.entries(sections)) {
    if (section === undefined) continue;
    const def = byKey.get(key);
    const leaves = flatten(section);
    if (!def) {
      for (const [p, v] of Object.entries(leaves)) if (MEANINGFUL.test(p) && shown(v)) notSaved.push(`${key}.${p}`);
      continue;
    }
    const paths = new Set<string>((def.fields ?? []).map((f: any) => String(f?.path ?? '')));
    const patch: Record<string, unknown> = {};
    if (paths.has('')) {
      // A definition whose whole value is one field.
      patch[''] = section;
    } else {
      for (const [p, v] of Object.entries(leaves)) {
        if (paths.has(p)) patch[p] = v;
        else if (MEANINGFUL.test(p) && shown(v)) notSaved.push(`${key}.${p}`);
      }
    }
    if (!Object.keys(patch).length) continue;
    try {
      await v2call('PATCH', `${S}/settings/registry/${encodeURIComponent(key)}`, { data: patch });
      saved.push(def.title || key);
    } catch (e: any) {
      const why = e?.response?.data?.message || e?.response?.data?.error?.message || e?.message || 'refused';
      const err = new Error(`${def.title || key} was not saved: ${why}${saved.length ? ` (already saved: ${saved.join(', ')})` : ''}`) as Error & { response?: unknown };
      err.response = e?.response ?? { status: 400, data: { success: false, message: err.message } };
      if (err.response && typeof err.response === 'object') {
        (err.response as any).data = { ...((err.response as any).data ?? {}), message: err.message };
      }
      throw err;
    }
  }
  if (notSaved.length) {
    const msg = `Saved: ${saved.join(', ') || 'nothing'}. Not saved — this server has no store setting for: ${notSaved.join(', ')}.`;
    const err = new Error(msg) as Error & { response?: unknown };
    err.response = { status: 422, statusText: 'Partly saved', headers: {}, data: { success: false, code: 'v2.settings_partly_saved', message: msg } };
    throw err;
  }
  return { saved, notSaved };
}
