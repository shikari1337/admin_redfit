import React, { useRef } from 'react';
import ProductImageUpload from './ProductImageUpload';

interface ProductMediaPanelProps {
  images: string[];
  descriptionImage: string;
  videos: string[];
  customerOrderImages: string[];
  uploading: boolean;          // product gallery
  uploadingBanner?: boolean;
  uploadingCustomer?: boolean;
  uploadingVideo: boolean;
  onImagesChange: (images: string[]) => void;
  onDescriptionImageChange: (image: string) => void;
  onVideosChange: (videos: string[]) => void;
  onCustomerOrderImagesChange: (images: string[]) => void;
  onImageUpload: (files: FileList) => Promise<void>;
  onDescriptionImageUpload: (files: FileList) => Promise<void>;
  onCustomerOrderImagesUpload: (files: FileList) => Promise<void>;
  onVideoFileUpload: (files: FileList) => void;
  onAddVideoUrl: () => void;
  errors?: { images?: string };
}

const SectionHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="flex items-baseline gap-1 mb-2">
    <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
    {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
  </div>
);

const ProductMediaPanel: React.FC<ProductMediaPanelProps> = ({
  images, descriptionImage, videos, customerOrderImages,
  uploading, uploadingBanner, uploadingCustomer, uploadingVideo,
  onImagesChange, onDescriptionImageChange, onVideosChange, onCustomerOrderImagesChange,
  onImageUpload, onDescriptionImageUpload, onCustomerOrderImagesUpload,
  onVideoFileUpload, onAddVideoUrl,
  errors = {},
}) => {
  const videoInputRef = useRef<HTMLInputElement>(null);

  const removeVideo = (idx: number) => {
    onVideosChange(videos.filter((_, i) => i !== idx));
  };

  const getVideoThumb = (url: string) => {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
    if (yt) return `https://img.youtube.com/vi/${yt[1]}/mqdefault.jpg`;
    return null;
  };

  return (
    <div className="space-y-4">

      {/* Product Images */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <SectionHeader title="Product Images" subtitle="(main gallery)" />
        <ProductImageUpload
          images={images}
          onImagesChange={onImagesChange}
          onUpload={onImageUpload}
          uploading={uploading}
          error={errors.images}
          multiple={true}
          label="Drop images or click to upload"
        />
        <p className="mt-2 text-xs text-gray-400">First image is the primary thumbnail. Drag to reorder.</p>
      </div>

      {/* Description Banner Image */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <SectionHeader title="Description Banner" subtitle="(100% width)" />
        <ProductImageUpload
          images={descriptionImage ? [descriptionImage] : []}
          onImagesChange={imgs => onDescriptionImageChange(imgs[0] || '')}
          onUpload={onDescriptionImageUpload}
          uploading={!!uploadingBanner}
          multiple={false}
          label="Upload banner image"
          maxImages={1}
        />
        <p className="mt-2 text-xs text-gray-400">Wide image shown above/below product description.</p>
      </div>

      {/* Videos */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <SectionHeader title="Videos" />
        <div className="space-y-2">
          {videos.map((url, idx) => {
            const thumb = getVideoThumb(url);
            return (
              <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200">
                {thumb ? (
                  <img src={thumb} alt="video" className="w-14 h-10 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-14 h-10 bg-gray-200 rounded flex items-center justify-center shrink-0">
                    <span className="text-xs text-gray-500">▶</span>
                  </div>
                )}
                <p className="text-xs text-gray-600 truncate flex-1">{url}</p>
                <button type="button" onClick={() => removeVideo(idx)}
                  className="text-red-400 hover:text-red-600 text-sm shrink-0">✕</button>
              </div>
            );
          })}
          <div className="flex gap-2">
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files?.length) onVideoFileUpload(e.target.files); e.currentTarget.value = ''; }}
            />
            <button type="button" onClick={() => videoInputRef.current?.click()}
              disabled={uploadingVideo}
              className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
              {uploadingVideo ? 'Uploading…' : '+ Upload Video'}
            </button>
            <button type="button" onClick={onAddVideoUrl}
              className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
              + Paste URL
            </button>
          </div>
        </div>
      </div>

      {/* Customer Order Photos */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <SectionHeader title="Customer Photos" subtitle="(social proof)" />
        <ProductImageUpload
          images={customerOrderImages}
          onImagesChange={onCustomerOrderImagesChange}
          onUpload={onCustomerOrderImagesUpload}
          uploading={!!uploadingCustomer}
          multiple={true}
          label="Upload customer photos"
        />
        <p className="mt-2 text-xs text-gray-400">Real customer photos shown in the reviews section.</p>
      </div>

    </div>
  );
};

export default ProductMediaPanel;
