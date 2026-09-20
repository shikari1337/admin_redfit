/**
 * AI Studio client — the admin's door to `/ai/status`, `/ai/text`, `/ai/image`
 * and the product-page planner. One module, so every ✨ button asks the same
 * status question and shows the same honest reason when AI is off.
 *
 * `useAiStatus()` is cached for the session (re-fetched on demand) — the
 * status is what decides whether a button generates or explains how to
 * switch AI on. Nothing here hides a button: an unconfigured store sees the
 * button in its "set up" state with a link, which is the owner's fix for
 * "it was configured earlier but now UI isn't showing it".
 */
import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';

export type AiEntity = 'product' | 'variation' | 'category' | 'brand' | 'page' | 'blog' | 'store' | 'generic';
export type AiAction = 'generate' | 'improve' | 'shorten' | 'expand' | 'fix' | 'simplify' | 'translate' | 'custom';
export type AiTone = 'default' | 'friendly' | 'professional' | 'premium' | 'playful' | 'clinical';
export type AiLength = 'auto' | 'short' | 'medium' | 'long';
export type AiFormat = 'text' | 'html' | 'json';
export type AiProviderId = 'gemini' | 'openai';
export type AiImageStyle = 'auto' | 'studio' | 'lifestyle' | 'flatlay' | 'ingredients' | 'minimal' | 'illustration' | 'nature';

export interface AiProviderStatus {
  id: AiProviderId; label: string; enabled: boolean; configured: boolean; source: 'store' | 'env' | null;
  textModel: string; imageModel: string; reason?: string;
}

export interface AiStatus {
  ok: boolean;
  text: { provider: AiProviderId; model: string } | null;
  image: { provider: AiProviderId; model: string } | null;
  providers: AiProviderStatus[];
  preferences: { textProvider: string; imageProvider: string };
  modules: { ai_content: boolean; ai_images: boolean };
  setupPath: string;
  reason?: string;
}

export interface AiTextRequest {
  entity?: AiEntity; entityId?: string | null; draft?: Record<string, any> | null;
  field: string; fieldLabel?: string; format?: AiFormat; action?: AiAction;
  currentValue?: string; instruction?: string; tone?: AiTone; length?: AiLength; language?: string;
  local?: Record<string, string | undefined>; provider?: AiProviderId;
}

export interface AiTextResult { value: any; format: AiFormat; provider: AiProviderId; model: string; field: string; label: string; maxChars: number | null }

export interface AiImageRequest {
  slot?: string; entity?: AiEntity; entityId?: string | null; draft?: Record<string, any> | null;
  prompt?: string; instruction?: string; style?: AiImageStyle; referenceImages?: string[];
  local?: Record<string, string | undefined>; width?: number; height?: number; count?: number; folder?: string; provider?: AiProviderId;
}

export interface AiImageResult {
  images: Array<{ url: string; key: string; width: number; height: number; bytes: number }>;
  provider: AiProviderId; model: string; slot: string; spec: { width: number; height: number; aspect: string; label: string }; prompt: string;
}

export interface PlannerQuestion { id: string; question: string; type: 'text' | 'choice'; options?: string[]; placeholder?: string; why?: string }
export interface PlannerRequest {
  entityId?: string | null; draft?: Record<string, any> | null; notes?: string; audience?: string; tone?: string;
  assets: Array<{ url: string; note?: string }>; answers?: Record<string, string>;
  include?: Partial<Record<'specifications' | 'faqs' | 'dosage' | 'importantInfo' | 'seo' | 'tags' | 'aplus', boolean>>;
}

const unwrap = (r: any) => (r?.data?.success !== undefined && r?.data?.data !== undefined ? r.data.data : r?.data);

/** Turn an axios failure into the sentence the server meant. */
export function aiErrorMessage(e: any): string {
  return e?.response?.data?.message || e?.response?.data?.error?.message || e?.message || 'AI request failed';
}

export const aiStudioAPI = {
  status: async (): Promise<AiStatus> => unwrap(await api.get('/ai/status')),
  fields: async (): Promise<Record<string, { label: string; format: AiFormat; maxChars: number | null }>> => unwrap(await api.get('/ai/fields')),
  text: async (body: AiTextRequest): Promise<AiTextResult> => unwrap(await api.post('/ai/text', body)),
  image: async (body: AiImageRequest): Promise<AiImageResult> => unwrap(await api.post('/ai/image', body)),
  describeImage: async (url: string): Promise<string> => (unwrap(await api.post('/ai/describe-image', { url }))?.description ?? ''),
  pageQuestions: async (body: PlannerRequest): Promise<{ understood: string; questions: PlannerQuestion[]; provider: string; model: string }> =>
    unwrap(await api.post('/ai/product-page/questions', body)),
  pageGenerate: async (body: PlannerRequest): Promise<{ page: any; provider: string; model: string }> =>
    unwrap(await api.post('/ai/product-page/generate', body)),
};

let cachedStatus: AiStatus | null = null;
let inflight: Promise<AiStatus> | null = null;
const listeners = new Set<() => void>();

export async function loadAiStatus(force = false): Promise<AiStatus> {
  if (cachedStatus && !force) return cachedStatus;
  if (inflight && !force) return inflight;
  inflight = aiStudioAPI.status().then((s) => { cachedStatus = s; listeners.forEach((l) => l()); return s; }).finally(() => { inflight = null; });
  return inflight;
}

export interface AiAvailability {
  status: AiStatus | null;
  loading: boolean;
  /** Text generation will work right now. */
  canText: boolean;
  /** Image generation will work right now. */
  canImage: boolean;
  /** Why not, in one sentence — shown in the button's tooltip and the dialog. */
  textReason: string | null;
  imageReason: string | null;
  setupPath: string;
  refresh: () => void;
}

export function useAiStatus(): AiAvailability {
  const [status, setStatus] = useState<AiStatus | null>(cachedStatus);
  const [loading, setLoading] = useState(!cachedStatus);
  useEffect(() => {
    let alive = true;
    const sync = () => { if (alive) setStatus(cachedStatus); };
    listeners.add(sync);
    if (!cachedStatus) loadAiStatus().catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; listeners.delete(sync); };
  }, []);
  const refresh = useCallback(() => { loadAiStatus(true).catch(() => {}); }, []);
  const setupPath = status?.setupPath || '/settings/api-integrations';
  const textReason = !status ? null
    : !status.modules?.ai_content ? 'AI content generation is not enabled for this store (ask the platform team to switch on the "AI Content Generation" module).'
    : !status.text ? (status.reason || 'No AI provider is configured for text.')
    : null;
  const imageReason = !status ? null
    : !status.modules?.ai_images ? 'AI image generation is not enabled for this store (ask the platform team to switch on the "AI Image Generation" module).'
    : !status.image ? (status.reason || 'No AI provider is configured for images.')
    : null;
  return {
    status, loading,
    canText: !!status && !textReason, canImage: !!status && !imageReason,
    textReason, imageReason, setupPath, refresh,
  };
}

export const ACTION_LABELS: Record<AiAction, string> = {
  generate: 'Write', improve: 'Improve', shorten: 'Shorten', expand: 'Expand', fix: 'Fix grammar', simplify: 'Simplify', translate: 'Translate', custom: 'Custom',
};
export const TONE_LABELS: Record<AiTone, string> = {
  default: 'Store default', friendly: 'Friendly', professional: 'Professional', premium: 'Premium', playful: 'Playful', clinical: 'Clinical',
};
export const STYLE_LABELS: Record<AiImageStyle, string> = {
  auto: 'Best fit', studio: 'Studio', lifestyle: 'Lifestyle', flatlay: 'Flat-lay', ingredients: 'Ingredients', minimal: 'Minimal', illustration: 'Illustration', nature: 'Nature',
};
