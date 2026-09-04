import React, { useEffect, useState } from 'react';
import { FaPlus, FaEdit, FaTrash, FaSearch } from 'react-icons/fa';
import { tagsAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface Tag {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  is_active?: boolean;
  isActive?: boolean;
  product_count?: number;
  productCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

// PG returns snake_case (is_active, product_count). Normalize to the camelCase
// the component reads so status/toggle/edit all work against the PostgreSQL API.
const normalizeTag = (t: any): Tag => ({
  ...t,
  isActive: t?.is_active ?? t?.isActive ?? false,
  productCount: t?.product_count ?? t?.productCount ?? 0,
});

const Tags: React.FC = () => {
  const { hasPerm } = useAuth();
  // Backend requires products.manage for create/update (incl. the active
  // toggle) and products.delete for removal (routes/tags.ts) — this page had
  // NO client-side gating before.
  const canManageTags = hasPerm('products.manage');
  const canDeleteTags = hasPerm('products.delete');
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTags();
  }, [filterActive, searchTerm]);

  const fetchTags = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (filterActive !== null) {
        params.active = filterActive;
      }
      if (searchTerm) {
        params.search = searchTerm;
      }
      const response = await tagsAPI.getAll(params);
      const tagsData = response.data || response;
      setTags(Array.isArray(tagsData) ? tagsData.map(normalizeTag) : []);
    } catch (err: any) {
      console.error('Failed to fetch tags:', err);
      setError(err.response?.data?.message || 'Failed to fetch tags');
      setTags([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete tag "${name}"? This will remove it from all products.`)) {
      return;
    }

    try {
      await tagsAPI.delete(id);
      await fetchTags();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete tag');
    }
  };

  const handleToggleActive = async (tag: Tag) => {
    try {
      await tagsAPI.update(tag._id, { isActive: !tag.isActive });
      await fetchTags();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update tag');
    }
  };

  const filteredTags = tags.filter(tag => {
    if (filterActive !== null && tag.isActive !== filterActive) return false;
    if (searchTerm && !tag.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !tag.slug.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading tags...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Tags</h1>
        {canManageTags && (
          <button
            onClick={() => navigate('/products/tags/new')}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <FaPlus className="mr-2" />
            Create Tag
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>
          <select
            value={filterActive === null ? 'all' : filterActive.toString()}
            onChange={(e) => setFilterActive(e.target.value === 'all' ? null : e.target.value === 'true')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {/* Tags Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Slug
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Products
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTags.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No tags found
                </td>
              </tr>
            ) : (
              filteredTags.map((tag) => (
                <tr key={tag._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{tag.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{tag.slug}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500 truncate max-w-xs">
                      {tag.description || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{tag.productCount || 0}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => canManageTags && handleToggleActive(tag)}
                      disabled={!canManageTags}
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        tag.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      } ${!canManageTags ? 'cursor-default' : ''}`}
                    >
                      {tag.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {canManageTags && (
                      <button
                        onClick={() => navigate(`/products/tags/${tag._id}/edit`)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        <FaEdit />
                      </button>
                    )}
                    {canDeleteTags && (
                      <button
                        onClick={() => handleDelete(tag._id, tag.name)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <FaTrash />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Tags;

