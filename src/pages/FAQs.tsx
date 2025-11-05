import React, { useState, useEffect } from 'react';
import { FaPlus, FaEdit, FaTrash, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import api from '../services/api';

interface FAQ {
  _id: string;
  question: string;
  answer: string;
  category: 'delivery' | 'quality' | 'bulk-order' | 'store-address' | 'payment' | 'return' | 'general';
  isActive: boolean;
  displayOrder: number;
}

const FAQs: React.FC = () => {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFAQ, setEditingFAQ] = useState<FAQ | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    category: 'general' as FAQ['category'],
    isActive: true,
    displayOrder: 0,
  });

  useEffect(() => {
    fetchFAQs();
  }, []);

  const fetchFAQs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/faqs');
      setFaqs(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch FAQs:', error);
      alert('Failed to fetch FAQs');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingFAQ) {
        await api.put(`/faqs/${editingFAQ._id}`, formData);
        alert('FAQ updated successfully');
      } else {
        await api.post('/faqs', formData);
        alert('FAQ created successfully');
      }
      setIsModalOpen(false);
      setEditingFAQ(null);
      resetForm();
      fetchFAQs();
    } catch (error: any) {
      console.error('Failed to save FAQ:', error);
      alert(error.response?.data?.message || 'Failed to save FAQ');
    }
  };

  const handleEdit = (faq: FAQ) => {
    setEditingFAQ(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      isActive: faq.isActive,
      displayOrder: faq.displayOrder,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this FAQ?')) return;
    
    try {
      await api.delete(`/faqs/${id}`);
      alert('FAQ deleted successfully');
      fetchFAQs();
    } catch (error: any) {
      console.error('Failed to delete FAQ:', error);
      alert(error.response?.data?.message || 'Failed to delete FAQ');
    }
  };

  const resetForm = () => {
    setFormData({
      question: '',
      answer: '',
      category: 'general',
      isActive: true,
      displayOrder: 0,
    });
  };

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const categoryLabels: Record<string, string> = {
    'delivery': 'Delivery & Shipping',
    'quality': 'Product Quality',
    'bulk-order': 'Bulk Orders',
    'store-address': 'Store Address',
    'payment': 'Payment',
    'return': 'Returns & Exchanges',
    'general': 'General',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading FAQs...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">FAQs</h1>
        <button
          onClick={() => {
            resetForm();
            setEditingFAQ(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
        >
          <FaPlus /> Add FAQ
        </button>
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="space-y-2 p-4">
          {faqs.map((faq, index) => (
            <div key={faq._id} className="bg-zinc-800 rounded-lg border border-zinc-700">
              <div className="flex items-center justify-between p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs bg-red-600 text-white px-2 py-1 rounded">
                      {categoryLabels[faq.category] || faq.category}
                    </span>
                    {!faq.isActive && (
                      <span className="text-xs bg-zinc-600 text-white px-2 py-1 rounded">
                        Inactive
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">Order: {faq.displayOrder}</span>
                  </div>
                  <h3 className="font-semibold text-white">{faq.question}</h3>
                  {expandedIndex === index && (
                    <p className="text-zinc-300 mt-2 whitespace-pre-line">{faq.answer}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleExpand(index)}
                    className="text-zinc-400 hover:text-white p-2"
                  >
                    {expandedIndex === index ? <FaChevronUp /> : <FaChevronDown />}
                  </button>
                  <button
                    onClick={() => handleEdit(faq)}
                    className="text-blue-400 hover:text-blue-300 p-2"
                  >
                    <FaEdit />
                  </button>
                  <button
                    onClick={() => handleDelete(faq._id)}
                    className="text-red-400 hover:text-red-300 p-2"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {faqs.length === 0 && (
            <div className="text-center text-zinc-400 py-8">
              No FAQs found. Add your first FAQ.
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-white mb-4">
              {editingFAQ ? 'Edit FAQ' : 'Add FAQ'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Question *
                </label>
                <input
                  type="text"
                  required
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Answer *
                </label>
                <textarea
                  required
                  rows={6}
                  value={formData.answer}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Category *
                </label>
                <select
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as FAQ['category'] })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-red-500"
                >
                  <option value="delivery">Delivery & Shipping</option>
                  <option value="quality">Product Quality</option>
                  <option value="bulk-order">Bulk Orders</option>
                  <option value="store-address">Store Address</option>
                  <option value="payment">Payment</option>
                  <option value="return">Returns & Exchanges</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.displayOrder}
                    onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4 text-red-600 bg-zinc-800 border-zinc-700 rounded focus:ring-red-500"
                    />
                    <span>Active</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingFAQ(null);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  {editingFAQ ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FAQs;

