import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaEye, FaEyeSlash } from 'react-icons/fa';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

interface Page {
  _id: string;
  title: string;
  slug: string;
  pageType: string;
  template: string;
  description?: string;
  isActive: boolean;
  isVisible: boolean;
  contentBlocks: any[];
  createdAt: string;
  updatedAt: string;
}

const Pages: React.FC = () => {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPages();
  }, []);

  const fetchPages = async () => {
    try {
      setLoading(true);
      const response = await api.get('/pages/admin/all');
      setPages(response.data.data || []);
    } catch (error: any) {
      console.error('Failed to fetch pages:', error);
      alert(error.response?.data?.message || 'Failed to fetch pages');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    
    try {
      await api.delete(`/pages/${id}`);
      alert('Page deleted successfully');
      fetchPages();
    } catch (error: any) {
      console.error('Failed to delete page:', error);
      alert(error.response?.data?.message || 'Failed to delete page');
    }
  };

  const toggleActive = async (page: Page) => {
    try {
      await api.put(`/pages/${page._id}`, {
        ...page,
        isActive: !page.isActive,
      });
      fetchPages();
    } catch (error: any) {
      console.error('Failed to update page:', error);
      alert(error.response?.data?.message || 'Failed to update page');
    }
  };

  const toggleVisible = async (page: Page) => {
    try {
      await api.put(`/pages/${page._id}`, {
        ...page,
        isVisible: !page.isVisible,
      });
      fetchPages();
    } catch (error: any) {
      console.error('Failed to update page:', error);
      alert(error.response?.data?.message || 'Failed to update page');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pages</h1>
          <p className="text-sm text-gray-600 mt-2">Manage your website pages</p>
        </div>
        <Link
          to="/pages/new"
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <FaPlus className="w-4 h-4" />
          Create Page
        </Link>
      </div>

      {pages.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-600 mb-4">No pages found. Create your first page to get started.</p>
          <Link
            to="/pages/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <FaPlus className="w-4 h-4" />
            Create Page
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Template
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Blocks
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
              {pages.map((page) => (
                <tr key={page._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{page.title}</div>
                    {page.description && (
                      <div className="text-sm text-gray-500">{page.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">/{page.slug}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {page.pageType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{page.template || 'default'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {page.contentBlocks?.filter(b => b.enabled).length || 0} blocks
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive(page)}
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          page.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                        title={page.isActive ? 'Active' : 'Inactive'}
                      >
                        {page.isActive ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        onClick={() => toggleVisible(page)}
                        className="text-gray-400 hover:text-gray-600"
                        title={page.isVisible ? 'Visible' : 'Hidden'}
                      >
                        {page.isVisible ? <FaEye /> : <FaEyeSlash />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/pages/${page._id}/edit`}
                        className="text-red-600 hover:text-red-900"
                        title="Edit"
                      >
                        <FaEdit className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(page._id, page.title)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
                      >
                        <FaTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Pages;

