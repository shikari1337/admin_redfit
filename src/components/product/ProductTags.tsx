import React, { useState } from 'react';
import { FaPlus, FaTimes } from 'react-icons/fa';

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
  const normalizeTagId = (id: any): string | null => {
    if (!id) return null;
    
    // Already a string ID
    if (typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) {
      return id;
    }
    
    // Buffer object
    if (id && typeof id === 'object' && id.buffer) {
      try {
        let bufferArray: number[];
        if (Array.isArray(id.buffer)) {
          bufferArray = id.buffer;
        } else if (typeof id.buffer === 'object') {
          const keys = Object.keys(id.buffer).map(k => Number(k)).sort((a, b) => a - b);
          bufferArray = keys.map(k => Number(id.buffer[k]));
        } else {
          return null;
        }
        if (bufferArray.length === 12) {
          const hex = bufferArray.map(b => b.toString(16).padStart(2, '0')).join('');
          if (hex.length === 24 && /^[0-9a-fA-F]{24}$/.test(hex)) {
            return hex;
          }
        }
      } catch (error) {
        console.error('Failed to convert buffer to ObjectId:', error);
        return null;
      }
    }
    
    // Object with _id property
    if (id && typeof id === 'object' && id._id) {
      return normalizeTagId(id._id);
    }
    
    // Try to convert to string as last resort
    const str = String(id).trim();
    if (str.length === 24 && /^[0-9a-fA-F]{24}$/.test(str)) {
      return str;
    }
    
    return null;
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
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">
          Tags (Optional)
        </label>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Add New Tag by Name */}
      <div className="mb-4 flex gap-2">
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
          placeholder="Enter tag name and press Enter"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          type="button"
          onClick={addTagByName}
          className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-1"
        >
          <FaPlus size={12} />
          Add
        </button>
      </div>

      {/* Selected Tags */}
      {tags.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">Selected Tags:</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, index) => {
              const tagName = getTagName(tag);
              return (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm"
                >
                  {tagName}
                  <button
                    type="button"
                    onClick={() => removeTag(index)}
                    className="text-blue-600 hover:text-blue-800"
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
          <p className="text-xs text-gray-500 mb-2">Available Tags:</p>
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
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="text-blue-600 focus:ring-blue-500 rounded"
                    checked={selected}
                    onChange={() => toggleTag(tagId, tag.name)}
                  />
                  <span className="text-sm text-gray-700">
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
      
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      <p className="mt-1 text-xs text-gray-500">
        Tags help customers find products. You can select existing tags or create new ones by name (WordPress style).
      </p>
    </div>
  );
};

export default ProductTags;

