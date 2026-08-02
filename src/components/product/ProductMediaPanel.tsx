import React, { useRef } from 'react';
import ProductImageUpload from './ProductImageUpload';
import { FieldGroup } from './FormField';

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
    <div className="space-y-5">

      {/* Product Images */}
      <FieldGroup title="Product photos"
        description="The main gallery customers flip through. The first photo is the cover — drag to reorder.">
        <ProductImageUpload
          images={images}
          onImagesChange={onImagesChange}
          onUpload={onImageUpload}
          uploading={uploading}
          error={errors.images}
          multiple={true}
          label="Drop images or click to upload"
        />
      </FieldGroup>

      {/* Description Banner Image */}
      <FieldGroup title="Description banner"
        description="One wide image shown full-width near the product description (optional).">
        <ProductImageUpload
          images={descriptionImage ? [descriptionImage] : []}
          onImagesChange={imgs => onDescriptionImageChange(imgs[0] || '')}
          onUpload={onDescriptionImageUpload}
          uploading={!!uploadingBanner}
          multiple={false}
          label="Upload banner image"
          maxImages={1}
        />
      </FieldGroup>

      {/* Videos */}
      <FieldGroup title="Videos"
        description="Upload a video file or paste a YouTube / Vimeo link.">
        <div className="space-y-2">
          {videos.map((url, idx) => {
            const thumb = getVideoThumb(url);
            return (
              <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-md border border-gray-200">
                {thumb ? (
                  <img src={thumb} alt="video" className="w-14 h-10 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-14 h-10 bg-gray-200 rounded flex items-center justify-center shrink-0">
                    <span className="text-xs text-gray-500">▶</span>
                  </div>
                )}
                <p className="text-xs text-gray-600 truncate flex-1">{url}</p>
                <button type="button" onClick={() => removeVideo(idx)} aria-label="Remove video"
                  className="text-gray-400 hover:text-red-600 text-sm shrink-0 px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded">✕</button>
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
              className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
              {uploadingVideo ? 'Uploading…' : '+ Upload Video'}
            </button>
            <button type="button" onClick={onAddVideoUrl}
              className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
              + Paste URL
            </button>
          </div>
        </div>
      </FieldGroup>

      {/* Customer Order Photos */}
      <FieldGroup title="Customer photos"
        description="Real customer photos shown in the reviews section (social proof).">
        <ProductImageUpload
          images={customerOrderImages}
          onImagesChange={onCustomerOrderImagesChange}
          onUpload={onCustomerOrderImagesUpload}
          uploading={!!uploadingCustomer}
          multiple={true}
          label="Upload customer photos"
        />
      </FieldGroup>

    </div>
  );
};

export default ProductMediaPanel;
