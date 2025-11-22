import React, { useState } from 'react';
import { FaUpload, FaMagic, FaImage, FaTimes, FaPlus, FaTrash } from 'react-icons/fa';
import { uploadAPI } from '../../services/api';
import { Editor } from '@tinymce/tinymce-react';

interface BlockEditorProps {
  block: {
    blockId: string;
    blockType: string;
    enabled: boolean;
    order: number;
    data: any;
  };
  onChange: (data: any) => void;
  onGenerateAI?: (blockType: string, existingData: any) => Promise<any>;
}

const BlockEditor: React.FC<BlockEditorProps> = ({ block, onChange, onGenerateAI }) => {
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [generating, setGenerating] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading({ ...uploading, [field]: true });
    try {
      const response = await uploadAPI.uploadSingle(file, 'pages');
      const imageUrl = response.data?.url || response.data?.data?.url || response.url;
      if (imageUrl) {
        onChange({ ...block.data, [field]: imageUrl });
      } else {
        throw new Error('No URL in upload response');
      }
    } catch (error: any) {
      console.error('Image upload error:', error);
      alert(error.response?.data?.message || error.message || 'Failed to upload image');
    } finally {
      setUploading({ ...uploading, [field]: false });
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleGenerateAI = async () => {
    if (!onGenerateAI) {
      alert('AI generation is not available');
      return;
    }

    setGenerating(true);
    try {
      const generated = await onGenerateAI(block.blockType, block.data);
      if (generated) {
        onChange({ ...block.data, ...generated });
        setShowAIModal(false);
        setCustomPrompt('');
        alert('Content generated successfully!');
      }
    } catch (error: any) {
      console.error('Error generating content:', error);
      alert(error.response?.data?.message || error.message || 'Failed to generate content');
    } finally {
      setGenerating(false);
    }
  };

  const ImageInput: React.FC<{ field: string; label: string; value?: string }> = ({ field, label, value = '' }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImageUpload(e, field)}
              disabled={uploading[field]}
            />
            {uploading[field] ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-700"></div>
                Uploading...
              </>
            ) : (
              <>
                <FaUpload size={12} />
                Upload
              </>
            )}
          </label>
        </div>
      </div>
      {value && (value.startsWith('http://') || value.startsWith('https://')) && (
        <div className="relative group">
          <img src={value} alt={label} className="w-full h-48 object-cover rounded-lg border border-gray-300" />
          <button
            type="button"
            onClick={() => onChange({ ...block.data, [field]: '' })}
            className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <FaTimes size={14} />
          </button>
        </div>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange({ ...block.data, [field]: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-md"
        placeholder="Enter image URL or upload"
      />
    </div>
  );

  const renderEditor = () => {
    switch (block.blockType) {
      case 'hero':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
              <input
                type="text"
                value={block.data?.title || ''}
                onChange={(e) => onChange({ ...block.data, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Hero title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subtitle</label>
              <input
                type="text"
                value={block.data?.subtitle || ''}
                onChange={(e) => onChange({ ...block.data, subtitle: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Hero subtitle"
              />
            </div>
            <ImageInput field="imageUrl" label="Background Image" value={block.data?.imageUrl} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Call to Action Text</label>
              <input
                type="text"
                value={block.data?.callToActionText || ''}
                onChange={(e) => onChange({ ...block.data, callToActionText: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., Shop Now"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Call to Action Link</label>
              <input
                type="text"
                value={block.data?.callToActionLink || ''}
                onChange={(e) => onChange({ ...block.data, callToActionLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="/products or https://..."
              />
            </div>
          </div>
        );

      case 'text':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
              <input
                type="text"
                value={block.data?.title || ''}
                onChange={(e) => onChange({ ...block.data, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Section title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
              <Editor
                apiKey={import.meta.env.VITE_TINYMCE_API_KEY || 'no-api-key'}
                value={block.data?.content || ''}
                onEditorChange={(content) => onChange({ ...block.data, content })}
                init={{
                  height: 300,
                  menubar: false,
                  plugins: ['advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview', 'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen', 'insertdatetime', 'media', 'table', 'paste', 'code', 'help', 'wordcount'],
                  toolbar: 'undo redo | formatselect | bold italic backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | help',
                }}
              />
            </div>
          </div>
        );

      case 'image':
        return (
          <div className="space-y-4">
            <ImageInput field="image" label="Image" value={block.data?.image} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Alt Text</label>
              <input
                type="text"
                value={block.data?.alt || ''}
                onChange={(e) => onChange({ ...block.data, alt: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Image alt text"
              />
            </div>
          </div>
        );

      case 'text-image':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
              <input
                type="text"
                value={block.data?.title || ''}
                onChange={(e) => onChange({ ...block.data, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
              <Editor
                apiKey={import.meta.env.VITE_TINYMCE_API_KEY || 'no-api-key'}
                value={block.data?.content || ''}
                onEditorChange={(content) => onChange({ ...block.data, content })}
                init={{
                  height: 200,
                  menubar: false,
                  plugins: ['lists', 'link', 'image', 'code'],
                  toolbar: 'undo redo | formatselect | bold italic | bullist numlist | link image code',
                }}
              />
            </div>
            <ImageInput field="image" label="Image" value={block.data?.image} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Image Position</label>
              <select
                value={block.data?.imagePosition || 'left'}
                onChange={(e) => onChange({ ...block.data, imagePosition: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        );

      case 'features':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
              <input
                type="text"
                value={block.data?.title || ''}
                onChange={(e) => onChange({ ...block.data, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Features</label>
              {(block.data?.items || []).map((item: any, index: number) => (
                <div key={index} className="flex flex-col gap-2 p-3 border border-gray-200 rounded-md bg-gray-50 mb-2">
                  <input
                    type="text"
                    value={item.icon || ''}
                    onChange={(e) => {
                      const items = [...(block.data?.items || [])];
                      items[index].icon = e.target.value;
                      onChange({ ...block.data, items });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Icon (emoji or URL)"
                  />
                  <input
                    type="text"
                    value={item.title || ''}
                    onChange={(e) => {
                      const items = [...(block.data?.items || [])];
                      items[index].title = e.target.value;
                      onChange({ ...block.data, items });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Feature title"
                  />
                  <textarea
                    value={item.description || ''}
                    onChange={(e) => {
                      const items = [...(block.data?.items || [])];
                      items[index].description = e.target.value;
                      onChange({ ...block.data, items });
                    }}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Feature description"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const items = (block.data?.items || []).filter((_: any, i: number) => i !== index);
                      onChange({ ...block.data, items });
                    }}
                    className="text-red-500 hover:text-red-700 text-sm self-end"
                  >
                    <FaTrash className="inline mr-1" /> Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const items = [...(block.data?.items || []), { icon: '✨', title: 'New Feature', description: '' }];
                  onChange({ ...block.data, items });
                }}
                className="px-3 py-1 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
              >
                <FaPlus className="inline mr-1" /> Add Feature
              </button>
            </div>
          </div>
        );

      case 'cta':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
              <input
                type="text"
                value={block.data?.title || ''}
                onChange={(e) => onChange({ ...block.data, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subtitle</label>
              <input
                type="text"
                value={block.data?.subtitle || ''}
                onChange={(e) => onChange({ ...block.data, subtitle: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Button Text</label>
              <input
                type="text"
                value={block.data?.buttonText || ''}
                onChange={(e) => onChange({ ...block.data, buttonText: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Button Link</label>
              <input
                type="text"
                value={block.data?.buttonLink || ''}
                onChange={(e) => onChange({ ...block.data, buttonLink: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        );

      case 'faq-accordion':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
              <input
                type="text"
                value={block.data?.title || ''}
                onChange={(e) => onChange({ ...block.data, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">FAQ Items</label>
              {(block.data?.items || []).map((item: any, index: number) => (
                <div key={index} className="flex flex-col gap-2 p-3 border border-gray-200 rounded-md bg-gray-50 mb-2">
                  <input
                    type="text"
                    value={item.question || ''}
                    onChange={(e) => {
                      const items = [...(block.data?.items || [])];
                      items[index].question = e.target.value;
                      onChange({ ...block.data, items });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Question"
                  />
                  <Editor
                    apiKey={import.meta.env.VITE_TINYMCE_API_KEY || 'no-api-key'}
                    value={item.answer || ''}
                    onEditorChange={(content) => {
                      const items = [...(block.data?.items || [])];
                      items[index].answer = content;
                      onChange({ ...block.data, items });
                    }}
                    init={{
                      height: 150,
                      menubar: false,
                      plugins: ['lists', 'link', 'code'],
                      toolbar: 'undo redo | bold italic | bullist numlist | link code',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const items = (block.data?.items || []).filter((_: any, i: number) => i !== index);
                      onChange({ ...block.data, items });
                    }}
                    className="text-red-500 hover:text-red-700 text-sm self-end"
                  >
                    <FaTrash className="inline mr-1" /> Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const items = [...(block.data?.items || []), { question: '', answer: '' }];
                  onChange({ ...block.data, items });
                }}
                className="px-3 py-1 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
              >
                <FaPlus className="inline mr-1" /> Add FAQ
              </button>
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Block Data (JSON)</label>
            <textarea
              value={JSON.stringify(block.data || {}, null, 2)}
              onChange={(e) => {
                try {
                  const data = JSON.parse(e.target.value);
                  onChange(data);
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-md font-semibold text-gray-800 capitalize">{block.blockType} Block Editor</h4>
        {onGenerateAI && (
          <button
            type="button"
            onClick={() => setShowAIModal(true)}
            className="flex items-center gap-2 px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
          >
            <FaMagic /> Generate with AI
          </button>
        )}
      </div>
      {renderEditor()}

      {/* AI Generation Modal */}
      {showAIModal && onGenerateAI && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Generate Content with AI</h3>
              <button
                onClick={() => {
                  setShowAIModal(false);
                  setCustomPrompt('');
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
                disabled={generating}
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Prompt (Optional)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={4}
                  placeholder="Enter a custom prompt for content generation. Leave empty to use default context-based prompt."
                  disabled={generating}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAIModal(false);
                  setCustomPrompt('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={generating}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateAI}
                disabled={generating}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <FaMagic /> Generate Content
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlockEditor;

