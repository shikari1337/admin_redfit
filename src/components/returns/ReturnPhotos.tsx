import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';

/**
 * The evidence a customer sent with a return.
 *
 * Before migration 167 there was nowhere to put one, so a damage claim arrived
 * as a sentence of free text and the desk had to email for a photo — by which
 * time the parcel had usually been repacked. These are the store's OWN images
 * (the upload route magic-byte sniffs the bytes and the server drops any URL
 * that is not on our storage host), so they are safe to render inline.
 */

export interface ReturnPhoto {
  url: string;
  mime?: string | null;
  bytes?: number | null;
  uploaded_at?: string | null;
}

interface Props {
  photos?: ReturnPhoto[] | null;
  /** Small = the row/line thumbnails; large = the detail header strip. */
  size?: 'sm' | 'md';
  label?: string;
}

const ReturnPhotos: React.FC<Props> = ({ photos, size = 'md', label }) => {
  const list = (photos ?? []).filter((p) => p && typeof p.url === 'string');
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [broken, setBroken] = useState<Record<number, boolean>>({});

  if (list.length === 0) return null;

  const box = size === 'sm' ? 'h-12 w-12' : 'h-20 w-20';
  const step = (d: number) =>
    setOpenAt((i) => (i === null ? null : (i + d + list.length) % list.length));

  return (
    <div>
      {label && (
        <p className="text-xs font-medium text-muted-foreground mb-1.5">
          {label} <span className="text-muted-foreground/70">({list.length})</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {list.map((p, i) => (
          <button
            key={p.url + i}
            type="button"
            onClick={() => setOpenAt(i)}
            title="Open photo"
            className={`${box} rounded-lg border border-border overflow-hidden bg-muted
                        hover:ring-2 hover:ring-primary/40 transition shrink-0
                        flex items-center justify-center`}
          >
            {broken[i] ? (
              <ImageOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <img
                src={p.url}
                alt={`Return evidence ${i + 1}`}
                loading="lazy"
                className="h-full w-full object-cover"
                onError={() => setBroken((b) => ({ ...b, [i]: true }))}
              />
            )}
          </button>
        ))}
      </div>

      {openAt !== null && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setOpenAt(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setOpenAt(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
          {list.length > 1 && (
            <>
              <button type="button" onClick={() => step(-1)} aria-label="Previous"
                className="absolute left-4 text-white/80 hover:text-white p-2">
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button type="button" onClick={() => step(1)} aria-label="Next"
                className="absolute right-4 text-white/80 hover:text-white p-2">
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}
          <figure className="max-h-full max-w-3xl text-center">
            <img
              src={list[openAt].url}
              alt={`Return evidence ${openAt + 1}`}
              className="max-h-[78vh] max-w-full object-contain rounded-lg mx-auto"
            />
            <figcaption className="text-white/70 text-xs mt-3">
              {openAt + 1} of {list.length}
              {list[openAt].uploaded_at
                ? ` · sent ${String(list[openAt].uploaded_at).slice(0, 10)}` : ''}
              {' · '}
              <a href={list[openAt].url} target="_blank" rel="noreferrer"
                 className="underline hover:text-white">open full size</a>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
};

export default ReturnPhotos;
