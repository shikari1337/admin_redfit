import React, { useState } from 'react';
import { FaUpload, FaMagic, FaImage, FaTimes } from 'react-icons/fa';
import { uploadAPI, productsAPI } from '../../services/api';

interface ImageInputWithActionsProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
  productId?: string;
  sectionId?: string;
  fieldPath?: string;
  contextData?: {
    productName?: string;
    productDescription?: string;
    itemTitle?: string;
    itemDescription?: string;
    sectionHeading?: string;
    sectionSubtitle?: string;
  };
  disabled?: boolean;
  className?: string;
}

const ImageInputWithActions: React.FC<ImageInputWithActionsProps> = ({
  value,
  onChange,
  label = 'Image',
  placeholder = 'Enter image URL manually (https://...)',
  productId,
  sectionId,
  fieldPath,
  contextData,
  disabled = false,
  className = '',
}) => {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setImageError(null);
    try {
      const response = await uploadAPI.uploadSingle(file, 'products');
      const imageUrl = response.data?.url || response.data?.data?.url || response.url;
      if (imageUrl) {
        onChange(imageUrl);
      } else {
        throw new Error('No URL in upload response');
      }
    } catch (error: any) {
      console.error('Image upload error:', error);
      const errorMessage = error.response?.data?.message || 
                         error.response?.data?.error?.message ||
                         error.message || 
                         'Failed to upload image';
      setImageError(errorMessage);
      alert(errorMessage);
    } finally {
      setUploading(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleGenerateImage = async () => {
    if (!productId || !sectionId || !fieldPath) {
      alert('Product ID, Section ID, and Field Path are required for image generation');
      return;
    }

    setGenerating(true);
    try {
      const response = await productsAPI.generateField(
        productId,
        sectionId,
        'image',
        fieldPath,
        {
          customPrompt: customPrompt || undefined,
        }
      );

      if (response.success && response.data?.value) {
        onChange(response.data.value);
        setShowGenerateModal(false);
        setCustomPrompt('');
        alert('Image generated successfully!');
      } else {
        alert('Failed to generate image');
      }
    } catch (error: any) {
      console.error('Error generating image:', error);
      alert(error.response?.data?.message || error.message || 'Failed to generate image');
    } finally {
      setGenerating(false);
    }
  };

  const isValidUrl = (url: string) => {
    return url.startsWith('http://') || url.startsWith('https://');
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-2">
          {/* Upload Button */}
          <label
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors cursor-pointer ${disabled || uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Upload image"
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
              disabled={disabled || uploading}
            />
            {uploading ? (
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

          {/* Generate Button - Only show if productId, sectionId, and fieldPath are provided */}
          {productId && sectionId && fieldPath && (
            <button
              type="button"
              onClick={() => setShowGenerateModal(true)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors ${disabled || generating ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={disabled || generating}
              title="Generate image with AI"
            >
              {generating ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-700"></div>
                  Generating...
                </>
              ) : (
                <>
                  <FaImage size={12} />
                  <FaMagic size={10} />
                  Generate
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Image Preview */}
      {value && isValidUrl(value) ? (
        <div className="relative group mb-3">
          <img
            src={value}
            alt={label}
            className="w-full h-48 object-cover rounded-lg border border-gray-300"
            onError={() => {
              console.error('Image load error:', value);
              setImageError('Failed to load image');
            }}
          />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
            disabled={disabled}
          >
            <FaTimes size={14} />
          </button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mb-3">
          <FaUpload className="mx-auto text-4xl text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            No image uploaded
          </p>
          <p className="text-xs text-gray-500 mt-1">Upload an image, generate with AI, or enter a URL</p>
        </div>
      )}

      {/* URL Input */}
      <input
        type="text"
        value={value || ''}
        onChange={(e) => {
          onChange(e.target.value);
          setImageError(null);
        }}
        className="w-full px-3 py-2 border border-gray-300 rounded-md"
        placeholder={placeholder}
        disabled={disabled}
      />

      {/* Error Messages */}
      {imageError && (
        <p className="mt-1 text-xs text-red-500">{imageError}</p>
      )}
      {value && !isValidUrl(value) && (
        <p className="mt-1 text-xs text-red-500">
          Invalid URL format. Please enter a valid URL starting with http:// or https://
        </p>
      )}

      {/* Generate Image Modal */}
      {showGenerateModal && productId && sectionId && fieldPath && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Generate Image with AI</h3>
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  setCustomPrompt('');
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
                disabled={generating}
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {contextData && (
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-xs font-medium text-gray-700 mb-2">Context Information:</p>
                  {contextData.productName && (
                    <p className="text-xs text-gray-600">
                      <span className="font-medium">Product:</span> {contextData.productName}
                    </p>
                  )}
                  {contextData.itemTitle && (
                    <p className="text-xs text-gray-600 mt-1">
                      <span className="font-medium">Item:</span> {contextData.itemTitle}
                    </p>
                  )}
                  {contextData.itemDescription && (
                    <p className="text-xs text-gray-600 mt-1">
                      <span className="font-medium">Description:</span> {contextData.itemDescription}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Prompt (Optional)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={4}
                  placeholder="Enter a custom prompt for image generation. Leave empty to use default context-based prompt."
                  disabled={generating}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your custom prompt will be added to the default context which includes: Product details, actual product images, section context, and item context (if available)
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  setCustomPrompt('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={generating}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateImage}
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
                    <FaMagic /> Generate Image
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

export default ImageInputWithActions;

