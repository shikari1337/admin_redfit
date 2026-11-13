import React, { useEffect, useMemo, useState } from 'react';
import { FaPlus, FaEdit, FaTrash, FaSearch } from 'react-icons/fa';
import { specificationsAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Specifications: reusable spec tables (`product_specifications`). A product links one from its own
 * page (Additional specifications, Linked template) and the shop's product page shows the set's rows
 * whenever the product has no rows of its own. The v2 adapter (lib/v2/areas/catalog.ts specRow)
 * answers each set with `sections` beside the stored `items`.
 */
interface Specification {
  _id: string;
  name: string;
  sections?: Array<{ heading: string; items: Array<{ key: string; value: string }> }>;
  isActive?: boolean;
  updatedAt?: string;
}

const rowCount = (s: Specification) => (s.sections ?? []).reduce((n, sec) => n + (sec.items?.length ?? 0), 0);

const Specifications: React.FC = () => {
  const { hasPerm } = useAuth();
  // The server requires products.manage for create/update (incl. the active toggle) and products.delete for removal.
  const canManageSpecs = hasPerm('products.manage');
  const canDeleteSpecs = hasPerm('products.delete');
  const [specifications, setSpecifications] = useState<Specification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchSpecifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await specificationsAPI.getAll(filterActive === null ? {} : { active: filterActive });
      const specsData = response?.data || response;
      setSpecifications(Array.isArray(specsData) ? specsData : []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not load the specifications.');
      setSpecifications([]);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSpecifications(); }, [filterActive]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete the specification set "${name}"? Products linked to it stop showing it.`)) return;
    try {
      await specificationsAPI.delete(id);
      await fetchSpecifications();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not delete the specification set.');
    }
  };

  const handleToggleActive = async (spec: Specification) => {
    try {
      await specificationsAPI.update(spec._id, { isActive: !spec.isActive });
      await fetchSpecifications();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not update the specification set.');
    }
  };

  const filteredSpecs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return specifications.filter((spec) => {
      if (filterActive !== null && (spec.isActive !== false) !== filterActive) return false;
      return !q || spec.name.toLowerCase().includes(q);
    });
  }, [specifications, searchTerm, filterActive]);

  const empty = specifications.filter((s) => rowCount(s) === 0).length;
  const paused = specifications.filter((s) => s.isActive === false).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Specifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reusable spec tables. Link one on a product (Additional specifications, Linked template); the product page
            shows it when the product has no rows of its own.
          </p>
        </div>
        {canManageSpecs && (
          <button
            onClick={() => navigate('/products/specifications/new')}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <FaPlus className="mr-2" />
            New set
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex flex-wrap items-center gap-3">
          <span className="flex-1">{error}</span>
          <button onClick={fetchSpecifications} className="text-sm font-medium underline">Try again</button>
        </div>
      )}

      {!loading && (empty > 0 || paused > 0) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm">
          {empty > 0 && <span>{empty} set{empty === 1 ? ' has' : 's have'} no rows and show{empty === 1 ? 's' : ''} nothing on a product page. </span>}
          {paused > 0 && <span>{paused} set{paused === 1 ? ' is' : 's are'} paused: linked products show nothing from {paused === 1 ? 'it' : 'them'}.</span>}
        </div>
      )}

      <div className="bg-white p-4 rounded-lg shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name"
              aria-label="Search specifications"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterActive === null ? 'all' : filterActive.toString()}
            onChange={(e) => setFilterActive(e.target.value === 'all' ? null : e.target.value === 'true')}
            aria-label="Status"
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
          >
            <option value="all">All status</option>
            <option value="true">Active</option>
            <option value="false">Paused</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading specifications...</div>
        ) : filteredSpecs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 space-y-3">
            <p>{specifications.length === 0 ? 'No specification sets yet.' : 'No set matches this search.'}</p>
            {specifications.length === 0 && canManageSpecs && (
              <button onClick={() => navigate('/products/specifications/new')} className="text-red-600 font-medium hover:underline">
                Create the first set
              </button>
            )}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rows</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSpecs.map((spec) => {
                const rows = rowCount(spec);
                const headings = (spec.sections ?? []).map((s) => s.heading).filter(Boolean);
                const active = spec.isActive !== false;
                return (
                  <tr key={spec._id} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{spec.name}</div>
                      {headings.length > 0 && <div className="text-xs text-gray-500 truncate max-w-[260px]">{headings.join(', ')}</div>}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm">
                      {rows > 0 ? <span className="text-gray-700">{rows} row{rows === 1 ? '' : 's'}</span> : <span className="text-amber-700">No rows</span>}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      {canManageSpecs ? (
                        <button
                          onClick={() => handleToggleActive(spec)}
                          title={active ? 'Pause this set' : 'Show this set again'}
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
                        >
                          {active ? 'Active' : 'Paused'}
                        </button>
                      ) : (
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {active ? 'Active' : 'Paused'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {canManageSpecs && (
                        <button
                          onClick={() => navigate(`/products/specifications/${spec._id}/edit`)}
                          aria-label={`Edit ${spec.name}`}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          <FaEdit />
                        </button>
                      )}
                      {canDeleteSpecs && (
                        <button
                          onClick={() => handleDelete(spec._id, spec.name)}
                          aria-label={`Delete ${spec.name}`}
                          className="text-red-600 hover:text-red-900"
                        >
                          <FaTrash />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Specifications;
