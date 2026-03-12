import { useState, useEffect } from 'react';
import { Upload, Loader, X } from 'lucide-react';
import { uploadAPI, aiAPI } from '../../services/api';
import MediaGallery from './MediaGallery';

interface ImageUploaderProps {
  onUpload: (url: string) => void;
  currentImage?: string;
  label?: string;
  context?: Record<string, unknown>;
  compact?: boolean;
  className?: string;
}

const ImageUploader = ({
  onUpload,
  currentImage,
  label = 'Upload Image',
  context = {},
  compact = false,
  className = '',
}: ImageUploaderProps) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentImage ?? null);

  useEffect(() => {
    setPreview(currentImage ?? null);
  }, [currentImage]);

  const [generating, setGenerating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [prompt, setPrompt] = useState('');

  // Pre-fill prompt from context when modal opens
  useEffect(() => {
    if (!showModal || !context) return;
    if (prompt) return;

    const skipKeys = ['page', 'section', 'company', 'website'];
    let basePrompt = '';

    if (context.purpose) basePrompt += `Create an image for: ${context.purpose}.\n`;
    if (context.content) basePrompt += `Context: ${context.content}.\n`;

    Object.entries(context).forEach(([key, value]) => {
      if (skipKeys.includes(key) || key === 'purpose' || key === 'content' || !value) return;
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
      basePrompt += `${label}: ${value}\n`;
    });

    if (context.company) basePrompt += `\nBrand: ${context.company}`;
    if (context.website) basePrompt += ` (${context.website})`;

    if (!basePrompt.trim()) basePrompt = 'High quality professional image.';

    setPrompt(basePrompt);
  }, [showModal]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadAPI.uploadSingle(file, 'content');
      const url = result?.url ?? result?.data?.url;
      if (url) {
        setPreview(url);
      } else {
        alert('Image upload failed - no URL returned');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onUpload('');
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const url = await aiAPI.generateImage(prompt, context);
      if (url) {
        setPreview(url);
      } else {
        alert('Image generation failed. Please try again.');
      }
    } catch (error) {
      console.error('Generation failed:', error);
      alert('Image generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const confirmSelection = () => {
    if (preview) {
      onUpload(preview);
    }
    setShowModal(false);
  };

  const previewUrl =
    !preview
      ? ''
      : preview.startsWith('http') || preview.startsWith('data:') || preview.startsWith('//')
        ? preview
        : `${import.meta.env.VITE_API_SERVER_URL || ''}${preview.startsWith('/') ? '' : '/'}${preview}`;

  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}

      {preview ? (
        <div className="relative inline-block group">
          <img
            src={previewUrl}
            alt="Preview"
            className={`object-cover rounded-lg border border-gray-200 ${compact ? 'h-24 w-24' : 'h-32 w-auto'}`}
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="p-2 bg-white text-gray-800 rounded-full hover:bg-gray-100"
              title="Change Image"
            >
              <Upload className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
              title="Remove"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className={`flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors ${compact ? 'w-full aspect-square p-2' : 'px-6 py-4 w-full'}`}
        >
          <div className="flex flex-col items-center text-gray-500">
            <Upload className={compact ? 'w-6 h-6' : 'w-8 h-8 mb-2'} />
            {!compact && <span className="text-sm font-medium">Upload or Generate with AI</span>}
          </div>
        </button>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
            {/* Left: AI Generation */}
            <div className="w-full md:w-1/2 p-6 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="text-2xl">✨</span> Generate with AI
              </h3>
              <div className="flex-1 flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Prompt</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the image you want (e.g. 'Industrial factory floor with modern machinery, cinematic lighting')"
                    className="w-full h-32 p-3 border rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none shadow-sm"
                  />
                  <p className="text-xs text-slate-500 mt-2">💡 Tip: Be specific about lighting, style, and subject.</p>
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !prompt.trim()}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center transition-all"
                >
                  {generating ? <Loader className="w-5 h-5 animate-spin" /> : 'Generate Image'}
                </button>
              </div>
            </div>

            {/* Right: Preview & Upload */}
            <div className="w-full md:w-1/2 p-6 flex flex-col bg-white">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800">Upload or Select</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center bg-slate-100 rounded-xl border border-dashed border-slate-300 relative overflow-hidden group min-h-[200px]">
                {preview ? (
                  <>
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-3">
                      <label className="cursor-pointer px-4 py-2 bg-white rounded-full font-bold hover:scale-105 transition-transform shadow-lg text-sm">
                        Upload New
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={handleFileChange}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowLibrary(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-700 transition-transform hover:scale-105 shadow-lg text-sm"
                      >
                        Choose from Library
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6">
                    <Upload className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium mb-4">No image selected</p>
                    <div className="flex gap-2 justify-center">
                      <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 transition-colors font-medium text-slate-700">
                        Upload
                        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowLibrary(true)}
                        className="inline-flex items-center px-4 py-2 bg-slate-100 border border-transparent rounded-lg hover:bg-slate-200 text-slate-700 font-medium"
                      >
                        Choose from Library
                      </button>
                    </div>
                  </div>
                )}

                {uploading && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl">
                    <Loader className="w-8 h-8 text-blue-600 animate-spin" />
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSelection}
                  disabled={!preview}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Use This Image
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLibrary && (
        <MediaGallery
          onSelect={(url) => {
            setPreview(url);
            setShowLibrary(false);
          }}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
};

export default ImageUploader;
