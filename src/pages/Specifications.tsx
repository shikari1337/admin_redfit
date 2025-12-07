import React, { useEffect, useState } from 'react';
import { FaPlus, FaEdit, FaTrash, FaSearch, FaLink } from 'react-icons/fa';
import { specificationsAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

interface Specification {
  _id: string;
  name: string;
  slug?: string;
  productId?: string | null;
  sections: Array<{
    heading: string;
    items: Array<{ key: string; value: string }>;
  }>;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const Specifications: React.FC = () => {
  const [specifications, setSpecifications] = useState<Specification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterShared, setFilterShared] = useState<boolean | null>(null);
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSpecifications();
  }, [filterShared, filterActive]);

  const fetchSpecifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (filterShared !== null) {
        params.shared = filterShared;
      }
      if (filterActive !== null) {
        params.active = filterActive;
      }
      const response = await specificationsAPI.getAll(params);
      const specsData = response.data || response;
      setSpecifications(Array.isArray(specsData) ? specsData : []);
    } catch (err: any) {
      console.error('Failed to fetch specifications:', err);
      setError(err.response?.data?.message || 'Failed to fetch specifications');
      setSpecifications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete specification "${name}"?`)) {
      return;
    }

    try {
      await specificationsAPI.delete(id);
      await fetchSpecifications();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete specification');
    }
  };

  const handleToggleActive = async (spec: Specification) => {
    try {
      await specificationsAPI.update(spec._id, { isActive: !spec.isActive });
      await fetchSpecifications();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update specification');
    }
  };

  const filteredSpecs = specifications.filter(spec => {
    if (filterShared !== null) {
      const isShared = !spec.productId;
      if (filterShared !== isShared) return false;
    }
    if (filterActive !== null && spec.isActive !== filterActive) return false;
    if (searchTerm && !spec.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !spec.slug?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading specifications...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Specifications</h1>
          <p className="text-sm text-gray-500 mt-1">Manage product specifications (shared templates and product-specific)</p>
        </div>
        <button
          onClick={() => navigate('/products/specifications/new')}
          className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <FaPlus className="mr-2" />
          Create Specification
        </button>
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
                placeholder="Search specifications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>
          <select
            value={filterShared === null ? 'all' : filterShared.toString()}
            onChange={(e) => setFilterShared(e.target.value === 'all' ? null : e.target.value === 'true')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
          >
            <option value="all">All Types</option>
            <option value="true">Shared Templates</option>
            <option value="false">Product-Specific</option>
          </select>
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

      {/* Specifications Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sections
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
            {filteredSpecs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No specifications found
                </td>
              </tr>
            ) : (
              filteredSpecs.map((spec) => (
                <tr key={spec._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{spec.name}</div>
                    {spec.slug && (
                      <div className="text-xs text-gray-500">Slug: {spec.slug}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {spec.productId ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          Product-Specific
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 flex items-center">
                          <FaLink className="mr-1" />
                          Shared Template
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{spec.sections?.length || 0} sections</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleToggleActive(spec)}
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        spec.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {spec.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => navigate(`/products/specifications/${spec._id}/edit`)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      <FaEdit />
                    </button>
                    <button
                      onClick={() => handleDelete(spec._id, spec.name)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <FaTrash />
                    </button>
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

export default Specifications;

