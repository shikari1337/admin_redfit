import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Save, Plus, GripVertical, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { contentAPI } from '../services/api';
import ImageUploader from '../components/content/ImageUploader';

const SECTION_TYPES = [
  { id: 'hero', label: 'Hero Section' },
  { id: 'overview', label: 'Project Overview' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'faq', label: 'FAQ' },
  { id: 'gallery', label: 'Image Gallery' },
  { id: 'location', label: 'Location Map' },
  { id: 'contact', label: 'Contact Form' },
  { id: 'html', label: 'Custom HTML' },
];

interface Section {
  id: string;
  type: string;
  title?: string;
  content?: string;
  order?: number;
  images?: string[];
  settings?: Record<string, any>;
}

interface SortableSectionProps {
  section: Section;
  updateSection: (id: string, field: string, value: any) => void;
  removeSection: (id: string) => void;
}

const SortableSection: React.FC<SortableSectionProps> = ({ section, updateSection, removeSection }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id });
  const [expanded, setExpanded] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSettingChange = (key: string, value: any) => {
    updateSection(section.id, 'settings', { ...section.settings, [key]: value });
  };

  const updateListItem = (listKey: string, itemIndex: number, field: string, value: any) => {
    const list = [...(section.settings?.[listKey] || [])];
    list[itemIndex] = { ...list[itemIndex], [field]: value };
    handleSettingChange(listKey, list);
  };

  const removeListItem = (listKey: string, itemIndex: number) => {
    const list = [...(section.settings?.[listKey] || [])];
    list.splice(itemIndex, 1);
    handleSettingChange(listKey, list);
  };

  const addListItem = (listKey: string, initialItem: any) => {
    const list = [...(section.settings?.[listKey] || []), initialItem];
    handleSettingChange(listKey, list);
  };

  const renderSpecificEditor = () => {
    const type = section.type.toLowerCase();

    switch (type) {
      case 'hero':
        return (
          <div className="space-y-4 mt-4 p-4 bg-gray-50 rounded text-sm border border-gray-100">
            <h4 className="font-bold text-gray-700">Hero Settings</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-gray-600 mb-1 font-medium">Main Title</label>
                <input
                  type="text"
                  value={section.settings?.title || ''}
                  onChange={(e) => handleSettingChange('title', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-red-500 outline-none"
                  placeholder="Luxury Living"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-gray-600 mb-1 font-medium">Subtitle</label>
                <textarea
                  value={section.settings?.subtitle || ''}
                  onChange={(e) => handleSettingChange('subtitle', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-red-500 outline-none h-20"
                  placeholder="Experience the pinnacle..."
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1 font-medium">Primary CTA</label>
                <input
                  type="text"
                  value={section.settings?.ctaText || ''}
                  onChange={(e) => handleSettingChange('ctaText', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-red-500 outline-none"
                  placeholder="Enquire Now"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1 font-medium">Background Image</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={section.settings?.fallbackImage || ''}
                    onChange={(e) => handleSettingChange('fallbackImage', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg"
                    placeholder="Image URL"
                  />
                  <ImageUploader
                    onUpload={(url) => handleSettingChange('fallbackImage', url)}
                    currentImage={section.settings?.fallbackImage}
                    label=""
                    context={{ section: 'Hero', purpose: 'Wide hero background image' }}
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'faq':
        return (
          <div className="space-y-4 mt-4 p-4 bg-gray-50 rounded border border-gray-100">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-bold text-gray-700">Questions & Answers</h4>
              <button
                onClick={() => addListItem('faqs', { question: '', answer: '' })}
                className="text-red-600 text-sm hover:underline flex items-center"
              >
                <Plus className="w-3 h-3 mr-1" /> Add Question
              </button>
            </div>
            <div className="space-y-3">
              {(section.settings?.faqs || []).map((faq: any, i: number) => (
                <div key={i} className="bg-white p-3 rounded border border-gray-200">
                  <input
                    type="text"
                    placeholder="Question"
                    value={faq.question || ''}
                    onChange={(e) => updateListItem('faqs', i, 'question', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md mb-2 font-medium"
                  />
                  <textarea
                    placeholder="Answer"
                    value={faq.answer || ''}
                    onChange={(e) => updateListItem('faqs', i, 'answer', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm h-20 resize-y"
                  />
                  <button onClick={() => removeListItem('faqs', i)} className="text-red-400 hover:text-red-600 mt-2">
                    <Trash2 className="w-4 h-4 inline" /> Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        );

      case 'gallery':
        const galleryImages = section.settings?.images || section.images || [];
        return (
          <div className="space-y-4 mt-4 p-4 bg-gray-50 rounded border border-gray-100">
            <h4 className="font-bold text-gray-700">Gallery Images</h4>
            <div className="grid grid-cols-4 gap-4">
              {galleryImages.map((img: string, i: number) => (
                <div key={i} className="relative group aspect-square">
                  <img src={img} alt={`Gallery ${i}`} className="w-full h-full object-cover rounded shadow-sm" />
                  <button
                    onClick={() => {
                      const newImages = galleryImages.filter((_: any, idx: number) => idx !== i);
                      handleSettingChange('images', newImages);
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div className="border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center p-4 min-h-[100px] text-gray-400 bg-white">
                <ImageUploader
                  onUpload={(url) => handleSettingChange('images', [...galleryImages, url])}
                  label="Add"
                  compact
                  context={{ section: 'Gallery', purpose: 'Gallery image' }}
                />
              </div>
            </div>
          </div>
        );

      case 'location':
        return (
          <div className="space-y-4 mt-4 p-4 bg-gray-50 rounded">
            <h4 className="font-bold text-gray-700">Location Settings</h4>
            <input
              type="text"
              value={section.settings?.mapUrl || ''}
              onChange={(e) => handleSettingChange('mapUrl', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Google Maps embed URL"
            />
          </div>
        );

      default:
        return (
          <div className="mt-4">
            <label className="block text-gray-600 mb-1 font-medium">Content (HTML allowed)</label>
            <textarea
              value={section.content || ''}
              onChange={(e) => updateSection(section.id, 'content', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg h-24"
              placeholder="Section content..."
            />
          </div>
        );
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-white p-4 mb-4 rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-center">
        <div {...attributes} {...listeners} className="cursor-grab text-slate-400 hover:text-slate-600 mr-4">
          <GripVertical className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded uppercase">
                {section.type}
              </span>
              <input
                type="text"
                value={section.title || ''}
                onChange={(e) => updateSection(section.id, 'title', e.target.value)}
                className="font-semibold text-slate-800 bg-transparent focus:bg-slate-50 px-2 py-1 rounded outline-none w-64"
                placeholder="Section Title"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1 hover:bg-slate-100 rounded text-slate-500"
              >
                {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
              <button
                onClick={() => removeSection(section.id)}
                className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pl-9 border-t border-slate-100 pt-4">
          <textarea
            placeholder="Content (HTML or Text)..."
            value={section.content || ''}
            onChange={(e) => updateSection(section.id, 'content', e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg mb-4 h-24 text-sm"
          />
          {renderSpecificEditor()}
        </div>
      )}
    </div>
  );
};

const PageEditor: React.FC = () => {
  const { pageSlug } = useParams<{ pageSlug: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState<{ title: string; sections: Section[] }>({ title: '', sections: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const slug = pageSlug || 'home';
    const fetchPage = async () => {
      try {
        const data = await contentAPI.getBySlug(slug);
        const sections = (data?.sections || []).map((s: any, i: number) => ({
          ...s,
          id: s.id || `section-${Date.now()}-${i}`,
          settings: s.settings || {},
        }));
        setPage({
          title: data?.title || slug.charAt(0).toUpperCase() + slug.slice(1),
          sections,
        });
      } catch (error) {
        if ((error as any)?.response?.status === 404) {
          setPage({
            title: (slug.charAt(0).toUpperCase() + slug.slice(1)).replace(/-/g, ' '),
            sections: [],
          });
        } else {
          console.error('Failed to load page content', error);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPage();
  }, [pageSlug]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPage((prev) => {
        const oldIndex = prev.sections.findIndex((s) => s.id === active.id);
        const newIndex = prev.sections.findIndex((s) => s.id === over.id);
        return { ...prev, sections: arrayMove(prev.sections, oldIndex, newIndex) };
      });
    }
  };

  const updateSection = (id: string, field: string, value: any) => {
    setPage((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    }));
  };

  const removeSection = (id: string) => {
    if (confirm('Remove this section?')) {
      setPage((prev) => ({ ...prev, sections: prev.sections.filter((s) => s.id !== id) }));
    }
  };

  const addSection = (type: string) => {
    const newSection: Section = {
      id: `new-${Date.now()}`,
      type,
      title: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      content: '',
      order: page.sections.length,
      images: [],
      settings: {},
    };
    setPage((prev) => ({ ...prev, sections: [...prev.sections, newSection] }));
    setShowAddModal(false);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const slug = pageSlug || 'home';
      const sectionsToSave = page.sections.map((s, index) => ({ ...s, order: index }));
      await contentAPI.save(slug, { ...page, sections: sectionsToSave });
      alert('Page saved successfully!');
    } catch (error) {
      console.error('Error saving page:', error);
      alert('Failed to save page. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl pb-40 mx-auto relative">
      <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 sticky top-4 z-20">
        <div className="flex-1 mr-8">
          <button
            onClick={() => navigate('/content')}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            ← Back to Content
          </button>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Page Title</label>
          <input
            type="text"
            value={page.title || ''}
            onChange={(e) => setPage((prev) => ({ ...prev, title: e.target.value }))}
            className="text-xl font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-red-500 outline-none w-full transition-colors"
            placeholder="Page Title"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center hover:bg-slate-50 transition shadow-sm font-medium text-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Section
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-red-600 text-white px-6 py-2 rounded-lg flex items-center hover:bg-red-700 disabled:opacity-50 transition shadow-lg font-medium text-sm"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={page.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-6">
            {page.sections.map((section) => (
              <SortableSection
                key={section.id}
                section={section}
                updateSection={updateSection}
                removeSection={removeSection}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {page.sections.length === 0 && (
        <div className="text-center py-24 bg-white rounded-2xl border-2 border-dashed border-slate-200">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
            <Plus className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">Start Building</h3>
          <p className="text-slate-500 mb-6 max-w-sm mx-auto">This page is empty. Add a section to get started.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-red-600 hover:text-red-700 font-bold text-sm bg-red-50 px-6 py-3 rounded-lg hover:bg-red-100 transition-colors"
          >
            Choose a Section Type
          </button>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">Add New Section</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="sr-only">Close</span>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-slate-50">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {SECTION_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => addSection(type.id)}
                    className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 rounded-xl hover:border-red-500 hover:ring-1 hover:ring-red-500 hover:shadow-md transition-all group text-center"
                  >
                    <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform font-bold text-sm">
                      {type.label.charAt(0)}
                    </div>
                    <span className="font-medium text-slate-700 text-sm group-hover:text-red-700">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PageEditor;
