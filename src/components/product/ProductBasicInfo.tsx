import React, { useState } from 'react';
import RichTextEditor from '../common/RichTextEditor';

interface ProductBasicInfoProps {
  name: string;
  title?: string;
  description: string;
  richDescription: string;
  onNameChange: (name: string) => void;
  onTitleChange?: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onRichDescriptionChange: (description: string) => void;
  errors: {
    name?: string;
  };
}

const ProductBasicInfo: React.FC<ProductBasicInfoProps> = ({
  name, title = '', description, richDescription,
  onNameChange, onTitleChange, onDescriptionChange, onRichDescriptionChange,
  errors,
}) => {
  const [showTitle, setShowTitle] = useState(!!title);
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Product Information</h2>
      <div className="space-y-4">

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Product Name <span className="text-red-500">*</span>
            <span className="ml-1 text-xs font-normal text-gray-400">(used on storefront &amp; for the URL slug)</span>
          </label>
          <input
            type="text"
            required
            className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="e.g., Arnica Montana 30CH 30ml"
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        {onTitleChange !== undefined && !showTitle && (
          <button type="button" onClick={() => setShowTitle(true)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            + Add a separate display title (optional)
          </button>
        )}
        {onTitleChange !== undefined && showTitle && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Display Title
              <span className="ml-1 text-xs font-normal text-gray-400">(overrides Product Name on the storefront — leave blank to just use the name)</span>
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              value={title}
              onChange={e => onTitleChange(e.target.value)}
              placeholder="Override name shown on storefront and listings"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Short Description
            <span className="ml-1 text-xs font-normal text-gray-400">(shown in product cards)</span>
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            value={description}
            onChange={e => onDescriptionChange(e.target.value)}
            placeholder="1–2 sentence summary shown in search results and category grids…"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Full Description
            <span className="ml-1 text-xs font-normal text-gray-400">(rich formatting)</span>
          </label>
          <RichTextEditor
            value={richDescription}
            onChange={onRichDescriptionChange}
            placeholder="Detailed product description — use the toolbar to format headings, lists, links…"
            minHeight={220}
          />
        </div>

      </div>
    </div>
  );
};

export default ProductBasicInfo;
