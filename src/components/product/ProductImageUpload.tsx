import React, { useRef, useState } from 'react';
import { FaUpload, FaTimes } from 'react-icons/fa';
import { GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MediaPicker from '../common/MediaPicker';

interface ProductImageUploadProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  onUpload: (files: FileList) => Promise<void>;
  uploading: boolean;
  error?: string;
  multiple?: boolean;
  label?: string;
  maxImages?: number;
  /** Folder used by the media-library picker. */
  folder?: string;
}

interface SortableThumbProps {
  id: string;
  img: string;
  index: number;
  label: string;
  isPrimary: boolean;
  showPrimaryBadge: boolean;
  onRemove: () => void;
}

// Drag any thumbnail to the front of the grid to make it the primary image —
// the first slot always renders full width (see the col-span on isPrimary).
const SortableThumb: React.FC<SortableThumbProps> = ({ img, index, label, isPrimary, showPrimaryBadge, onRemove, id }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative group ${isPrimary ? 'col-span-2 sm:col-span-3' : ''}`}>
      <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-300">
        <img src={img} alt={`${label} ${index + 1}`} className="w-full h-full object-cover" />
      </div>
      {showPrimaryBadge && (
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-medium">
          Primary
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className={`absolute top-1 right-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${isPrimary ? 'p-1.5' : 'p-1'}`}
      >
        <FaTimes size={isPrimary ? 14 : 12} />
      </button>
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Drag to reorder — drop first to make it the primary image"
        className="absolute bottom-1 left-1 bg-black/50 hover:bg-black/70 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={14} />
      </button>
    </div>
  );
};

const ProductImageUpload: React.FC<ProductImageUploadProps> = ({
  images,
  onImagesChange,
  onUpload,
  uploading,
  error,
  multiple = true,
  label = 'Product Images',
  maxImages,
  folder = 'products/gallery',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addFromLibrary = (url: string) => {
    if (maxImages === 1 || !multiple) onImagesChange([url]);
    else if (!images.includes(url)) onImagesChange([...images, url]);
  };

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = images.indexOf(String(active.id));
    const newIndex = images.indexOf(String(over.id));
    if (oldIndex !== -1 && newIndex !== -1) onImagesChange(arrayMove(images, oldIndex, newIndex));
  };

  const canAddMore = maxImages ? images.length < maxImages : true;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div className="space-y-3">
        {images.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={images} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {images.map((img, index) => (
                  <SortableThumb
                    key={img}
                    id={img}
                    img={img}
                    index={index}
                    label={label}
                    isPrimary={index === 0}
                    showPrimaryBadge={multiple && index === 0 && images.length > 1}
                    onRemove={() => removeImage(index)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              🖼 Choose from Media Library
            </button>
          </div>
        )}
        <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={addFromLibrary} folder={folder} />
        {maxImages && images.length >= maxImages && (
          <p className="text-xs text-gray-500">Maximum {maxImages} images reached</p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
};

export default ProductImageUpload;
