import React from 'react';
import { Play, X, ImageOff, ChevronLeft, ChevronRight, Upload, Loader2, Trash2 } from 'lucide-react';
import { reviewsAPI, type ReviewMedia as Asset } from '@/services/api';
import { cn } from '@/lib/utils';

/**
 * Review media: thumbnail strip, full-screen lightbox, and an uploader.
 *
 * Video is a first-class asset here, not an afterthought — a video review shows
 * a play badge in the strip and plays inline in the lightbox rather than opening
 * a raw file URL in a new tab.
 */

export const MediaThumb: React.FC<{
  asset: Asset;
  size?: number;
  onClick?: () => void;
  className?: string;
}> = ({ asset, size = 44, onClick, className }) => {
  const [broken, setBroken] = React.useState(false);
  const isVideo = asset.type === 'video';
  const src = asset.thumb || (isVideo ? undefined : asset.url);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: size, height: size }}
      className={cn(
        'group relative shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100',
        onClick && 'cursor-zoom-in hover:border-gray-300',
        className,
      )}
      aria-label={isVideo ? 'Play video review' : 'View photo'}
    >
      {src && !broken ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : isVideo ? (
        // No poster frame: the API stores video as-is (no transcode/thumbnail
        // pipeline), so a labelled placeholder beats a broken <img>.
        <span className="flex h-full w-full items-center justify-center bg-gray-900 text-white">
          <Play className="h-4 w-4 fill-current" />
        </span>
      ) : (
        <span className="flex h-full w-full items-center justify-center text-gray-400">
          <ImageOff className="h-4 w-4" />
        </span>
      )}
      {isVideo && src && !broken && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/35">
          <Play className="h-4 w-4 fill-white text-white" />
        </span>
      )}
    </button>
  );
};

/** Horizontal strip with a "+N" overflow chip. */
export const MediaStrip: React.FC<{
  media: Asset[];
  max?: number;
  size?: number;
  onOpen?: (index: number) => void;
}> = ({ media, max = 3, size = 44, onOpen }) => {
  if (!media?.length) return <span className="text-xs text-gray-400">—</span>;
  const shown = media.slice(0, max);
  const rest = media.length - shown.length;

  return (
    <div className="flex items-center gap-1">
      {shown.map((m, i) => (
        <MediaThumb key={`${m.url}-${i}`} asset={m} size={size} onClick={onOpen ? () => onOpen(i) : undefined} />
      ))}
      {rest > 0 && (
        <button
          type="button"
          onClick={onOpen ? () => onOpen(shown.length) : undefined}
          style={{ width: size, height: size }}
          className="shrink-0 rounded-md border border-gray-200 bg-gray-50 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          +{rest}
        </button>
      )}
    </div>
  );
};

/** Full-screen viewer with keyboard navigation. */
export const MediaLightbox: React.FC<{
  media: Asset[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}> = ({ media, index, onIndex, onClose }) => {
  const current = media[index];

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex(Math.min(index + 1, media.length - 1));
      if (e.key === 'ArrowLeft') onIndex(Math.max(index - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, media.length, onIndex, onClose]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {index < media.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}
          className="absolute right-4 top-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        {current.type === 'video' ? (
          <video src={current.url} controls autoPlay playsInline className="max-h-[80vh] w-full rounded-lg bg-black" />
        ) : (
          <img src={current.url} alt="" className="max-h-[80vh] rounded-lg object-contain" />
        )}
        <p className="mt-3 text-center text-xs text-white/60">
          {index + 1} of {media.length} · {current.type}
        </p>
      </div>
    </div>
  );
};

/** Editable media list: upload, preview, reorder-by-removal. */
export const MediaEditor: React.FC<{
  media: Asset[];
  onChange: (m: Asset[]) => void;
  max?: number;
}> = ({ media, onChange, max = 8 }) => {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lightbox, setLightbox] = React.useState<number | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const next = [...media];
    for (const file of Array.from(files).slice(0, max - media.length)) {
      try {
        next.push(await reviewsAPI.uploadMedia(file));
      } catch (e: any) {
        setError(e?.response?.data?.message || `Could not upload ${file.name}`);
      }
    }
    onChange(next.slice(0, max));
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {media.map((m, i) => (
          <span key={`${m.url}-${i}`} className="relative">
            <MediaThumb asset={m} size={64} onClick={() => setLightbox(i)} />
            <button
              type="button"
              onClick={() => onChange(media.filter((_, j) => j !== i))}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-1 text-white shadow hover:bg-red-700"
              aria-label="Remove attachment"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}

        {media.length < max && (
          <label className={cn(
            'flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md',
            'border-2 border-dashed border-gray-300 text-gray-400 transition hover:border-indigo-400 hover:text-indigo-500',
            busy && 'pointer-events-none opacity-60',
          )}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span className="text-[10px]">{busy ? 'Uploading' : 'Add'}</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.currentTarget.value = ''; }}
            />
          </label>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Photos up to 8 MB, video up to 64 MB (MP4, WebM, MOV). Max {max} attachments.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {lightbox !== null && (
        <MediaLightbox media={media} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
};
