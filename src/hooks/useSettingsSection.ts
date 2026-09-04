import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

/**
 * Shared load/mask/submit lifecycle for an admin Settings page.
 *
 * The common shape this replaces, duplicated across ~10 Settings pages:
 *   1. `loading`/`saving` state
 *   2. fetch `GET /settings/admin` on mount, unwrap the response, map fields into a
 *      local `formData` object with per-field fallback defaults (and, for secret
 *      fields, mask them as `••••••••` instead of ever showing the real value)
 *   3. `handleSubmit` → `PUT /settings` with the whole `formData`, alert on success/failure
 *
 * The axios interceptor in `services/api.ts` (`normalizeResponse`) already unwraps
 * `{success, data}` responses, so by the time `.data` is read here it IS the settings
 * object — no `response.data?.success && response.data?.data ? … : …` ternary needed.
 *
 * Pages whose load/save doesn't fit the single-object mold (multiple independent save
 * buttons writing to different keys, multi-step wizards) are better left on their own
 * logic — this hook covers the common case, not every settings page.
 */

export interface UseSettingsSectionOptions<T> {
  /**
   * Turn the raw settings payload (already unwrapped) into this section's form state.
   * Only called when the payload is truthy — mirrors the `if (settings) { setFormData(...) }`
   * guard every page already had.
   */
  parse: (raw: any) => T;
  /** Initial form state, and what the form falls back to via `setFormData(defaults)` if
   *  a page's `onLoadError` chooses to reset (the hook itself never forces a reset). */
  defaults: T;
  /**
   * Override how the raw settings payload is fetched. Defaults to `GET /settings/admin`.
   * Use this for pages that read a dedicated endpoint (e.g. `gstSettingsAPI.get()`) or
   * merge several calls (`Promise.all`) into one raw object for `parse`.
   */
  fetcher?: () => Promise<any>;
  /**
   * Override how `formData` is persisted. Defaults to `PUT /settings` with `formData` as
   * the body. Use this for pages that mask/unmask secret fields before sending, or that
   * write to several dedicated endpoints instead of the generic bulk key.
   */
  submitter?: (formData: T) => Promise<void>;
  /** Extra side effect run with the raw payload after every successful load — for derived
   *  state that lives outside the form itself (e.g. a read-only "Razorpay: Enabled" badge,
   *  or `storeSlug`/`environment`). */
  onLoaded?: (raw: any) => void;
  /** Called instead of the default (silent `console.error`) when the load fails. Use this
   *  to reproduce a page's existing `alert(...)` and/or `setFormData(defaults)` behavior. */
  onLoadError?: (error: any) => void;
  /** Shown via `alert()` after a successful save. Omit to handle success feedback yourself
   *  via `onSuccess` (e.g. a page with its own inline "Saved" indicator). */
  successMessage?: string;
  /** Called after a successful save, before the `successMessage` alert (if any). */
  onSuccess?: (formData: T) => void;
  /** Called on a failed save INSTEAD of the default `alert(error.response?.data?.message ||
   *  'Failed to save settings')`. Use for pages with their own inline error banner. */
  onError?: (error: any) => void;
  /** Skip the automatic fetch-on-mount, e.g. a page that needs to sequence its own effects
   *  (multiple `Promise.all` calls) before calling `reload()` itself. */
  skipInitialFetch?: boolean;
}

export interface UseSettingsSectionResult<T> {
  formData: T;
  setFormData: React.Dispatch<React.SetStateAction<T>>;
  loading: boolean;
  saving: boolean;
  /** Re-run the fetch + parse cycle — e.g. after a related save (on a different endpoint)
   *  invalidates what's shown, the way ShippingSettings re-fetches after saving carrier
   *  credentials to a dedicated endpoint. */
  reload: () => Promise<void>;
  /** Wire directly to a `<form onSubmit>` (or call with no argument from a plain button). */
  handleSubmit: (e?: { preventDefault?: () => void }) => Promise<void>;
}

async function defaultFetcher(): Promise<any> {
  const response = await api.get('/settings/admin');
  return response.data;
}

export function useSettingsSection<T>(options: UseSettingsSectionOptions<T>): UseSettingsSectionResult<T> {
  const { defaults, skipInitialFetch } = options;
  const [formData, setFormData] = useState<T>(defaults);
  const [loading, setLoading] = useState(!skipInitialFetch);
  const [saving, setSaving] = useState(false);

  // Latest options without forcing reload/handleSubmit to change identity every render —
  // pages pass fresh inline closures (parse/onLoaded/submitter) on every render.
  const optsRef = useRef(options);
  optsRef.current = options;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const raw = optsRef.current.fetcher ? await optsRef.current.fetcher() : await defaultFetcher();
      if (raw) {
        setFormData(optsRef.current.parse(raw));
        optsRef.current.onLoaded?.(raw);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      optsRef.current.onLoadError?.(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!skipInitialFetch) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = useCallback(async (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    setSaving(true);
    try {
      if (optsRef.current.submitter) {
        await optsRef.current.submitter(formData);
      } else {
        await api.put('/settings', formData as any);
      }
      optsRef.current.onSuccess?.(formData);
      if (optsRef.current.successMessage) alert(optsRef.current.successMessage);
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      if (optsRef.current.onError) optsRef.current.onError(error);
      else alert(error?.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [formData]);

  return { formData, setFormData, loading, saving, reload, handleSubmit };
}

export default useSettingsSection;
