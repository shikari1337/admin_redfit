import React, { useRef, useState } from 'react';
import { uploadAPI, aiAPI } from '../../services/api';
import MediaPicker from './MediaPicker';

/**
 * Reusable single-image field: upload a file, generate with AI, or paste a URL.
 * Shows a preview with a remove button. Self-contained so it can be dropped
 * anywhere (A+ content blocks, banners, etc.) without breaking layout/theme.
 */
export interface ImageFieldProps {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  /** Default prompt used for the ✨ AI generate action. */
  aiPrompt?: string;
  className?: string;
}

const ImageField: React.FC<ImageFieldProps> = ({ value, onChange, folder = 'products', aiPrompt, className = '' }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'upload' | 'ai'>('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const upload = async (file: File) => {
    setBusy('upload');
    try {
      const res: any = await uploadAPI.uploadSingle(file, folder);
      // Response interceptor may unwrap { success, data } → data, so check res.url first.
      const url = res?.url || res?.data?.url || res?.data?.data?.url;
      if (url) onChange(url);
    } catch (e) { console.error('Upload failed', e); }
    finally { setBusy(''); }
  };

  const generate = async () => {
    const prompt = window.prompt('Describe the image to generate:', aiPrompt || '');
    if (!prompt) return;
    setBusy('ai');
    try {
      const url = await aiAPI.generateImage(prompt, { folder });
      if (url) onChange(url);
    } catch (e) { console.error('AI image generation failed', e); }
    finally { setBusy(''); }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {value ? (
        <div className="relative w-full">
          <img src={value} alt="preview" className="w-full max-h-44 object-contain rounded border border-gray-200 bg-gray-50" />
          <button type="button" onClick={() => onChange('')}
            className="absolute top-1 right-1 bg-white/90 border border-gray-300 rounded-full w-6 h-6 text-xs text-gray-600 hover:text-red-600">✕</button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center text-xs text-gray-400">
          No image yet
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ''; }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
          className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
          {busy === 'upload' ? 'Uploading…' : '⬆ Upload'}
        </button>
        <button type="button" onClick={() => setPickerOpen(true)} disabled={!!busy}
          className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
          🖼 Library
        </button>
        <button type="button" onClick={generate} disabled={!!busy}
          className="px-2.5 py-1 text-xs border border-purple-200 text-purple-600 rounded hover:bg-purple-50 disabled:opacity-50">
          {busy === 'ai' ? '✨ …' : '✨ AI Image'}
        </button>
      </div>

      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={onChange} folder={folder} />

      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="…or paste an image URL"
        className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
      />
    </div>
  );
};

export default ImageField;
