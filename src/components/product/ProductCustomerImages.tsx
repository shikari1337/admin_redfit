import React from 'react';
import ProductImageUpload from './ProductImageUpload';

interface ProductCustomerImagesProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  onUpload: (files: FileList) => Promise<void>;
  uploading: boolean;
  error?: string;
}

const ProductCustomerImages: React.FC<ProductCustomerImagesProps> = ({
  images,
  onImagesChange,
  onUpload,
  uploading,
  error,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Order Images Gallery</h2>
      <p className="text-sm text-gray-600 mb-4">
        Upload screenshots of customer orders to display on product page
      </p>
      <ProductImageUpload
        images={images}
        onImagesChange={onImagesChange}
        onUpload={onUpload}
        uploading={uploading}
        error={error}
        multiple={true}
        label="Customer Order Images"
      />
    </div>
  );
};

export default ProductCustomerImages;

