import React, { useEffect, useMemo, useState } from 'react';
import { Upload, LayoutGrid, Sparkles, Link2, X, Loader2, Info } from 'lucide-react';
import { uploadAPI } from '../../services/api';
import MediaPicker from './MediaPicker';
import AiImageDialog from './AiImageDialog';
import InfoTip from './InfoTip';
import { useImageSpec, specHint, checkAgainstSpec, readImageDimensions } from '../../lib/imageSpecs';
import { useAiStatus, type AiEntity } from '../../lib/ai';

/**
 * THE single-image field for the whole admin — one component, so every image
 * anywhere (product banner, category image, brand logo, hero slide, blog
 * cover, trust badge, attribute swatch…) offers the same four actions:
 * Upload · Library · AI · URL, prints the size the slot needs, and judges the
 * picked file against it.
 *
 * `spec` names the slot (config/imageSpecs.ts key). `entity`/`entityId`/
 * `draft` give the AI its context. The older `productId/sectionId/fieldPath/
 * contextData` props still work (they map onto the new ones) so the 13
 * existing consumers keep compiling.
 */
export interface ImageInputWithActionsProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
  /** Image slot key, e.g. "product.aplus.banner". Falls back to a generic 16:9 slot. */
  spec?: string;
  entity?: AiEntity;
  entityId?: string | null;
  draft?: () => Record<string, any> | null | undefined;
  /** Product photos etc. the generator may keep faithful. */
  referenceImages?: string[];
  local?: Record<string, string | undefined>;
  /** Bucket folder new uploads land in. */
  folder?: string;
  help?: React.ReactNode;
  info?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  /** Smaller chrome for dense editors (block items, table cells). */
  compact?: boolean;
  /** Hide the paste-a-URL box (still reachable from the picker's URL tab). */
  hideUrlInput?: boolean;
  /** Legacy props — mapped onto entity/entityId/local. */
  productId?: string;
  sectionId?: string;
  fieldPath?: string;
  contextData?: { productName?: string; productDescription?: string; itemTitle?: string; itemDescription?: string; sectionHeading?: string; sectionSubtitle?: string };
}

const ImageInputWithActions: React.FC<ImageInputWithActionsProps> = ({
  value, onChange, label = 'Image', placeholder = 'https://… or use the buttons above',
  spec: specKey, entity, entityId, draft, referenceImages, local, folder = 'products', help, info, disabled = false, className = '',
  compact = false, hideUrlInput = false, productId, sectionId, fieldPath, contextData,
}) => {
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [showUrl, setShowUrl] = useState(!hideUrlInput && !compact);
  const [error, setError] = useState<string | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const spec = useImageSpec(specKey);
  const ai = useAiStatus();

  const resolvedEntity: AiEntity = entity || (productId ? 'product' : 'generic');
  const resolvedEntityId = entityId ?? productId ?? null;
  const resolvedLocal = useMemo(() => ({
    ...(sectionId ? { section: sectionId } : {}), ...(fieldPath ? { field: fieldPath } : {}),
    ...(contextData?.itemTitle ? { itemTitle: contextData.itemTitle } : {}),
    ...(contextData?.itemDescription ? { itemDescription: contextData.itemDescription } : {}),
    ...(contextData?.sectionHeading ? { heading: contextData.sectionHeading } : {}),
    ...(contextData?.sectionSubtitle ? { subtitle: contextData.sectionSubtitle } : {}),
    ...(local || {}),
  }), [sectionId, fieldPath, contextData, local]);

  useEffect(() => {
    let alive = true;
    setDims(null);
    if (value && /^https?:\/\//.test(value)) readImageDimensions(value).then((d) => alive && setDims(d));
    return () => { alive = false; };
  }, [value]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const response: any = await uploadAPI.uploadSingle(file, folder);
      const url = response?.url || response?.data?.url || response?.data?.data?.url;
      if (!url) throw new Error('No URL in upload response');
      onChange(url);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.response?.data?.error?.message || err?.message || 'Failed to upload image');
    } finally { setUploading(false); if (e.target) e.target.value = ''; }
  };

  const isValidUrl = (u: string) => /^https?:\/\//.test(u);
  const check = value && isValidUrl(value) && specKey ? checkAgainstSpec(dims, null, spec) : null;
  const btn = `inline-flex items-center gap-1 rounded-md border text-xs font-medium transition-colors ${compact ? 'px-1.5 h-6' : 'px-2 h-7'} disabled:opacity-50 disabled:cursor-not-allowed`;

  return (
    <div className={className}>
      {(label || specKey) && (
        <div className={`flex items-center justify-between gap-2 ${compact ? 'mb-1' : 'mb-1.5'}`}>
          <div className="min-w-0 flex items-center gap-1.5">
            {label && <label className={`${compact ? 'text-xs' : 'text-[13px]'} font-medium text-gray-700 truncate`}>{label}</label>}
            {(info || (specKey && (spec.uses || spec.others.length))) && (
              <InfoTip text={info || spec.description}
                where={specKey ? <>{spec.uses ? `${spec.uses} ` : ''}{spec.others.length ? `Other frontends: ${spec.others.map((o) => `${o.frontend} ${o.width}×${o.height}`).join(', ')}` : ''}</> : undefined} />
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <label className={`${btn} border-gray-300 bg-white text-gray-700 hover:bg-gray-50 cursor-pointer ${disabled || uploading ? 'opacity-50 pointer-events-none' : ''}`} title="Upload a file">
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={disabled || uploading} />
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}{!compact && <span>Upload</span>}
            </label>
            <button type="button" disabled={disabled} onClick={() => setPickerOpen(true)} className={`${btn} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`} title="Choose from the media library">
              <LayoutGrid size={12} />{!compact && <span>Library</span>}
            </button>
            <button type="button" disabled={disabled} onClick={() => setAiOpen(true)}
              className={`${btn} ${ai.canImage ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100' : 'border-gray-200 bg-white text-gray-400'}`}
              title={ai.canImage ? `Generate a ${spec.width}×${spec.height} image with AI` : (ai.imageReason || 'AI images not configured')}>
              <Sparkles size={12} />{!compact && <span>AI</span>}
            </button>
            {!hideUrlInput && (
              <button type="button" disabled={disabled} onClick={() => setShowUrl((v) => !v)} className={`${btn} border-gray-300 bg-white text-gray-500 hover:bg-gray-50`} title="Paste a URL">
                <Link2 size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {value && isValidUrl(value) ? (
        <div className={`relative group ${compact ? 'mb-1.5' : 'mb-2'}`}>
          <div className={`w-full rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center ${compact ? 'h-24' : 'h-44'}`}
            style={specKey && spec.fit === 'cover' ? { aspectRatio: `${spec.width} / ${spec.height}`, height: 'auto', maxHeight: compact ? 160 : 260 } : undefined}>
            <img src={value} alt={label} className={`w-full h-full ${specKey && spec.fit === 'cover' ? 'object-cover' : 'object-contain'}`} onError={() => setError('This image could not be loaded')} />
          </div>
          <button type="button" onClick={() => onChange('')} disabled={disabled} aria-label="Remove image"
            className="absolute top-1.5 right-1.5 bg-white/95 border border-gray-300 text-gray-600 hover:text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <X size={13} />
          </button>
          {(dims || check) && (
            <p className={`mt-1 text-[11px] ${check?.level === 'bad' ? 'text-red-600' : check?.level === 'warn' ? 'text-amber-700' : 'text-gray-500'}`}>
              {dims ? `${dims.width} × ${dims.height} px` : ''}{check ? ` · ${check.message}` : ''}
            </p>
          )}
        </div>
      ) : (
        <button type="button" disabled={disabled} onClick={() => setPickerOpen(true)}
          className={`w-full border-2 border-dashed border-gray-300 rounded-lg text-center hover:border-brand-400 hover:bg-brand-50/30 transition-colors ${compact ? 'p-3 mb-1.5' : 'p-5 mb-2'}`}>
          <Upload className={`mx-auto text-gray-300 ${compact ? 'mb-1' : 'mb-2'}`} size={compact ? 18 : 26} />
          <p className={`${compact ? 'text-xs' : 'text-sm'} text-gray-600`}>No image yet — upload, pick from the library, or generate</p>
          {specKey && <p className="text-[11px] text-brand-800 mt-1">Needs {specHint(spec, { short: true })}</p>}
        </button>
      )}

      {specKey && !compact && (
        <p className="text-[11px] text-gray-500 flex items-center gap-1"><Info size={11} className="text-brand-500 shrink-0" />Needs {specHint(spec)}{spec.uses ? ` · ${spec.uses}` : ''}</p>
      )}
      {help && <p className="text-xs text-gray-400 mt-1">{help}</p>}

      {showUrl && !hideUrlInput && (
        <input type="text" value={value || ''} onChange={(e) => { onChange(e.target.value); setError(null); }} disabled={disabled} placeholder={placeholder}
          className={`mt-1.5 w-full px-2.5 ${compact ? 'h-7 text-xs' : 'h-8 text-sm'} border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400`} />
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {value && !isValidUrl(value) && <p className="mt-1 text-xs text-red-500">Enter a full URL starting with http:// or https://</p>}

      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(url) => { onChange(url); setError(null); }}
        folder={folder} spec={specKey} entity={resolvedEntity} entityId={resolvedEntityId} draft={draft} local={resolvedLocal} referenceImages={referenceImages} title={label} />
      <AiImageDialog open={aiOpen} onClose={() => setAiOpen(false)} onUse={(url) => { onChange(url); setError(null); }}
        slot={specKey} entity={resolvedEntity} entityId={resolvedEntityId} draft={draft} currentUrl={value && isValidUrl(value) ? value : undefined}
        referenceImages={referenceImages} local={resolvedLocal} folder={folder} title={label ? `Generate: ${label}` : undefined} />
    </div>
  );
};

export default ImageInputWithActions;
