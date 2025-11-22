import React from 'react';
import { FaTrash, FaPlus } from 'react-icons/fa';
import ImageInputWithActions from '../common/ImageInputWithActions';

// Hero Block Editor
export const HeroBlockEditor: React.FC<{ data: any; onChange: (data: any) => void; pageId?: string }> = ({ data, onChange, pageId }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Hero title"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Subtitle</label>
        <input
          type="text"
          value={data?.subtitle || ''}
          onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Hero subtitle"
        />
      </div>
      <ImageInputWithActions
        value={data?.imageUrl || ''}
        onChange={(url) => onChange({ ...data, imageUrl: url })}
        label="Background Image"
        placeholder="Enter image URL or upload"
        productId={pageId}
        sectionId="hero"
        fieldPath="imageUrl"
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Call to Action Text</label>
        <input
          type="text"
          value={data?.callToActionText || ''}
          onChange={(e) => onChange({ ...data, callToActionText: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="e.g., Shop Now"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Call to Action Link</label>
        <input
          type="text"
          value={data?.callToActionLink || ''}
          onChange={(e) => onChange({ ...data, callToActionLink: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="/products or https://..."
        />
      </div>
    </div>
  );
};

// Text Block Editor
export const TextBlockEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Section title"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
        <textarea
          value={data?.content || ''}
          onChange={(e) => onChange({ ...data, content: e.target.value })}
          rows={10}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Enter HTML content or plain text..."
        />
        <p className="text-xs text-gray-500 mt-1">You can use HTML tags for formatting</p>
      </div>
    </div>
  );
};

// Image Block Editor
export const ImageBlockEditor: React.FC<{ data: any; onChange: (data: any) => void; pageId?: string }> = ({ data, onChange, pageId }) => {
  return (
    <div className="space-y-4">
      <ImageInputWithActions
        value={data?.image || ''}
        onChange={(url) => onChange({ ...data, image: url })}
        label="Image"
        placeholder="Enter image URL or upload"
        productId={pageId}
        sectionId="image"
        fieldPath="image"
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Alt Text</label>
        <input
          type="text"
          value={data?.alt || ''}
          onChange={(e) => onChange({ ...data, alt: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Image alt text"
        />
      </div>
    </div>
  );
};

// Text-Image Block Editor
export const TextImageBlockEditor: React.FC<{ data: any; onChange: (data: any) => void; pageId?: string }> = ({ data, onChange, pageId }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
        <textarea
          value={data?.content || ''}
          onChange={(e) => onChange({ ...data, content: e.target.value })}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Enter HTML content or plain text..."
        />
      </div>
      <ImageInputWithActions
        value={data?.image || ''}
        onChange={(url) => onChange({ ...data, image: url })}
        label="Image"
        placeholder="Enter image URL or upload"
        productId={pageId}
        sectionId="text-image"
        fieldPath="image"
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Image Position</label>
        <select
          value={data?.imagePosition || 'left'}
          onChange={(e) => onChange({ ...data, imagePosition: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>
    </div>
  );
};

// Features Block Editor
export const FeaturesBlockEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const updateItem = (index: number, field: string, value: string) => {
    const items = [...(data?.items || [])];
    items[index] = { ...items[index], [field]: value };
    onChange({ ...data, items });
  };

  const addItem = () => {
    onChange({
      ...data,
      items: [...(data?.items || []), { icon: '✨', title: '', description: '' }]
    });
  };

  const removeItem = (index: number) => {
    const items = [...(data?.items || [])];
    items.splice(index, 1);
    onChange({ ...data, items });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Features</label>
        {(data?.items || []).map((item: any, index: number) => (
          <div key={index} className="flex flex-col gap-2 p-3 border border-gray-200 rounded-md bg-gray-50 mb-2">
            <input
              type="text"
              value={item.icon || ''}
              onChange={(e) => updateItem(index, 'icon', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Icon (emoji or URL)"
            />
            <input
              type="text"
              value={item.title || ''}
              onChange={(e) => updateItem(index, 'title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Feature title"
            />
            <textarea
              value={item.description || ''}
              onChange={(e) => updateItem(index, 'description', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Feature description"
            />
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="text-red-500 hover:text-red-700 text-sm self-end"
            >
              <FaTrash className="inline mr-1" /> Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="px-3 py-1 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
        >
          <FaPlus className="inline mr-1" /> Add Feature
        </button>
      </div>
    </div>
  );
};

// CTA Block Editor
export const CTABlockEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Subtitle</label>
        <input
          type="text"
          value={data?.subtitle || ''}
          onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Button Text</label>
        <input
          type="text"
          value={data?.buttonText || ''}
          onChange={(e) => onChange({ ...data, buttonText: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Button Link</label>
        <input
          type="text"
          value={data?.buttonLink || ''}
          onChange={(e) => onChange({ ...data, buttonLink: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
    </div>
  );
};

// FAQ Accordion Block Editor
export const FAQAccordionBlockEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const updateItem = (index: number, field: string, value: string) => {
    const items = [...(data?.items || [])];
    items[index] = { ...items[index], [field]: value };
    onChange({ ...data, items });
  };

  const addItem = () => {
    onChange({
      ...data,
      items: [...(data?.items || []), { question: '', answer: '' }]
    });
  };

  const removeItem = (index: number) => {
    const items = [...(data?.items || [])];
    items.splice(index, 1);
    onChange({ ...data, items });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">FAQ Items</label>
        {(data?.items || []).map((item: any, index: number) => (
          <div key={index} className="flex flex-col gap-2 p-3 border border-gray-200 rounded-md bg-gray-50 mb-2">
            <input
              type="text"
              value={item.question || ''}
              onChange={(e) => updateItem(index, 'question', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Question"
            />
            <textarea
              value={item.answer || ''}
              onChange={(e) => updateItem(index, 'answer', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Answer (HTML supported)"
            />
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="text-red-500 hover:text-red-700 text-sm self-end"
            >
              <FaTrash className="inline mr-1" /> Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="px-3 py-1 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
        >
          <FaPlus className="inline mr-1" /> Add FAQ
        </button>
      </div>
    </div>
  );
};

