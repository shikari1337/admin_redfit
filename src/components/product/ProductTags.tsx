import React, { useState } from 'react';
import { FaPlus, FaTimes } from 'react-icons/fa';
import { fieldInputCls } from './FormField';

interface TagOption {
  _id: string;
  name: string;
  slug?: string;
  isActive?: boolean;
}

interface ProductTagsProps {
  tags: Array<string | { _id: string; name: string }>; // Can be tag IDs (strings) or tag names (strings) or tag objects
  availableTags: TagOption[];
  onTagsChange: (tags: Array<string | { _id: string; name: string }>) => void;
  onRefresh: () => void;
  loading: boolean;
  error?: string;
}

const ProductTags: React.FC<ProductTagsProps> = ({
  tags,
  availableTags,
  onTagsChange,
  onRefresh,
  loading,
  error,
}) => {
  const [newTagName, setNewTagName] = useState('');

  /**
   * Normalize tag ID to string (defensive programming)
   * Handles buffer objects, ObjectId instances, and string IDs
   */
  // Accepts PostgreSQL UUIDs (36-char), legacy Mongo ObjectIds (24-hex), objects
  // with _id/id, and Mongo buffer objects. Returns null only for empties.
  const normalizeTagId = (id: any): string | null => {
    if (!id) return null;

    if (typeof id === 'string') {
      const t = id.trim();
      return t.length ? t : null;
    }

    if (typeof id === 'object') {
      if (id._id) return normalizeTagId(id._id);
      if (id.id) return normalizeTagId(id.id);
      if (id.buffer) {
        try {
          const keys = Object.keys(id.buffer).map(Number).sort((a, b) => a - b);
          const arr = keys.map(k => Number(id.buffer[k]));
          if (arr.length === 12) {
            const hex = arr.map(b => b.toString(16).padStart(2, '0')).join('');
            if (/^[0-9a-fA-F]{24}$/.test(hex)) return hex;
          }
        } catch { return null; }
      }
    }

    const str = String(id).trim();
    return str && str !== '[object Object]' ? str : null;
  };

  // Check if a tag is selected (by ID or name)
  const isTagSelected = (tagId: string, tagName: string): boolean => {
    return tags.some(tag => {
      if (typeof tag === 'string') {
        // Check if it's an ID match or name match
        const normalizedId = normalizeTagId(tag);
        return normalizedId === tagId || tag.toLowerCase() === tagName.toLowerCase();
      }
      if (typeof tag === 'object' && tag._id) {
        return normalizeTagId(tag._id) === tagId;
      }
      return false;
    });
  };

  // Get tag name from tag value
  const getTagName = (tag: string | { _id: string; name: string }): string => {
    if (typeof tag === 'string') {
      // If it's a valid ObjectId, find the tag name from availableTags
      const normalizedId = normalizeTagId(tag);
      if (normalizedId) {
        const foundTag = availableTags.find(t => normalizeTagId(t._id) === normalizedId);
        return foundTag?.name || tag;
      }
      // Otherwise it's a tag name string
      return tag;
    }
    return tag.name || tag._id;
  };

  const toggleTag = (tagId: string, tagName: string) => {
    const normalizedId = normalizeTagId(tagId);
    if (!normalizedId) {
      console.error('Invalid tag ID:', tagId);
      return;
    }
    
    const selected = isTagSelected(normalizedId, tagName);
    let newTags: Array<string | { _id: string; name: string }>;
    
    if (selected) {
      // Remove tag
      newTags = tags.filter(tag => {
        if (typeof tag === 'string') {
          const normalizedTagId = normalizeTagId(tag);
          return normalizedTagId !== normalizedId && tag.toLowerCase() !== tagName.toLowerCase();
        }
        if (typeof tag === 'object' && tag._id) {
          return normalizeTagId(tag._id) !== normalizedId;
        }
        return true;
      });
    } else {
      // Add tag by ID (preferred - uses existing tag)
      newTags = [...tags, normalizedId];
    }
    
    onTagsChange(newTags);
  };

  const addTagByName = () => {
    const trimmedName = newTagName.trim();
    if (!trimmedName) return;
    
    // Check if tag already exists by name
    const existsByName = tags.some(tag => {
      const tagName = getTagName(tag);
      return tagName.toLowerCase() === trimmedName.toLowerCase();
    });
    
    if (existsByName) {
      setNewTagName('');
      return;
    }
    
    // Add as string name (WordPress style - backend will create tag on-the-fly)
    onTagsChange([...tags, trimmedName]);
    setNewTagName('');
  };

  const removeTag = (index: number) => {
    const newTags = tags.filter((_, idx) => idx !== index);
    onTagsChange(newTags);
  };

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Add New Tag by Name */}
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTagByName();
              }
            }}
            placeholder="Type a tag and press Enter"
            aria-label="New tag name"
            className={`${fieldInputCls} flex-1 !w-auto`}
          />
          <button
            type="button"
            onClick={addTagByName}
            className="h-9 px-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <FaPlus size={11} />
            Add
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-400">New names are created automatically — no setup needed.</p>
      </div>

      {/* Selected Tags */}
      {tags.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">On this product</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, index) => {
              const tagName = getTagName(tag);
              return (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-md text-sm"
                >
                  {tagName}
                  <button
                    type="button"
                    onClick={() => removeTag(index)}
                    aria-label={`Remove tag ${tagName}`}
                    className="text-blue-500 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                  >
                    <FaTimes size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Tags */}
      {availableTags.length === 0 ? (
        <p className="text-sm text-gray-500">
          No tags available. Add tags from the Tags section or create them by name above.
        </p>
      ) : (
        <div>
          <p className="text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Pick from existing</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {availableTags.map((tag) => {
              const tagId = normalizeTagId(tag._id);
              if (!tagId) {
                console.warn('⚠️ Invalid tag ID, skipping:', tag);
                return null;
              }

              const selected = isTagSelected(tagId, tag.name);

              return (
                <label
                  key={tagId}
                  className={`flex items-center gap-2 px-3 py-2 border rounded-md transition-colors cursor-pointer ${
                    selected
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="text-blue-600 focus:ring-blue-400 rounded border-gray-300"
                    checked={selected}
                    onChange={() => toggleTag(tagId, tag.name)}
                  />
                  <span className="text-sm text-gray-700 min-w-0 truncate">
                    {tag.name}
                    {!tag.isActive && (
                      <span className="ml-2 text-xs text-gray-400">(inactive)</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      <p className="mt-2 text-xs text-gray-400">
        Tags help customers find products — pick existing ones or type a new name above.
      </p>
    </div>
  );
};

export default ProductTags;

