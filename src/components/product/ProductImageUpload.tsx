import React, { useRef } from 'react';
import { FaUpload, FaTimes } from 'react-icons/fa';

interface ProductImageUploadProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  onUpload: (files: FileList) => Promise<void>;
  uploading: boolean;
  error?: string;
  multiple?: boolean;
  label?: string;
  maxImages?: number;
}

const ProductImageUpload: React.FC<ProductImageUploadProps> = ({
  images,
  onImagesChange,
  onUpload,
  uploading,
  error,
  multiple = true,
  label = 'Product Images',
  maxImages,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await onUpload(files);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const canAddMore = maxImages ? images.length < maxImages : true;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label} {!multiple && <span className="text-red-500">*</span>}
      </label>
      <div className="space-y-3">
        {images.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {images.map((img, index) => (
              <div key={index} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-300">
                  <img src={img} alt={`${label} ${index + 1}`} className="w-full h-full object-cover" />
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <FaTimes size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {canAddMore && (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple={multiple}
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            <label
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer ${uploading ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">Uploading...</p>
                </>
              ) : (
                <>
                  <FaUpload className="mx-auto text-4xl text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    Click to upload {multiple ? 'images' : 'image'} or drag and drop
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Supports JPG, PNG, GIF up to 10MB</p>
                </>
              )}
            </label>
          </div>
        )}
        {maxImages && images.length >= maxImages && (
          <p className="text-xs text-gray-500">Maximum {maxImages} images reached</p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {images.length === 0 && !uploading && (
          <p className="text-sm text-red-500">At least one image is required</p>
        )}
      </div>
    </div>
  );
};

export default ProductImageUpload;

