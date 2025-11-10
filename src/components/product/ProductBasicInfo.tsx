import React from 'react';
import ProductImageUpload from './ProductImageUpload';

interface ProductBasicInfoProps {
  name: string;
  description: string;
  richDescription: string;
  descriptionImage: string;
  images: string[];
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onRichDescriptionChange: (description: string) => void;
  onDescriptionImageChange: (image: string) => void;
  onImagesChange: (images: string[]) => void;
  onImageUpload: (files: FileList) => Promise<void>;
  onDescriptionImageUpload: (files: FileList) => Promise<void>;
  uploading: boolean;
  errors: {
    name?: string;
    images?: string;
  };
}

const ProductBasicInfo: React.FC<ProductBasicInfoProps> = ({
  name,
  description,
  richDescription,
  descriptionImage,
  images,
  onNameChange,
  onDescriptionChange,
  onRichDescriptionChange,
  onDescriptionImageChange,
  onImagesChange,
  onImageUpload,
  onDescriptionImageUpload,
  uploading,
  errors,
}) => {
  const handleDescriptionImageUpload = async (files: FileList) => {
    if (files.length > 0) {
      await onDescriptionImageUpload(files);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Information</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 ${
              errors.name ? 'border-red-500' : 'border-gray-300'
            }`}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., Redfit Premium T-Shirt"
          />
          {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Short Description</label>
          <textarea
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Short description for product cards..."
          />
          <p className="mt-1 text-xs text-gray-500">Short description for product cards</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Rich Description (HTML)</label>
          <textarea
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
            value={richDescription}
            onChange={(e) => onRichDescriptionChange(e.target.value)}
            placeholder="<p>HTML content here</p>"
          />
          <p className="mt-1 text-xs text-gray-500">HTML content for detailed product description</p>
        </div>

        <ProductImageUpload
          images={images}
          onImagesChange={onImagesChange}
          onUpload={onImageUpload}
          uploading={uploading}
          error={errors.images}
          multiple={true}
          label="Product Images"
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description Banner Image (100% width)
          </label>
          <ProductImageUpload
            images={descriptionImage ? [descriptionImage] : []}
            onImagesChange={(imgs) => onDescriptionImageChange(imgs[0] || '')}
            onUpload={handleDescriptionImageUpload}
            uploading={uploading}
            multiple={false}
            label="Description Banner"
            maxImages={1}
          />
          <p className="mt-1 text-xs text-gray-500">Banner image displayed above/below product description (100% width)</p>
        </div>
      </div>
    </div>
  );
};

export default ProductBasicInfo;

