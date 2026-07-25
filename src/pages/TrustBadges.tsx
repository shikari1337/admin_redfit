import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Pencil, Trash2, GripVertical, ShieldCheck } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { trustBadgesAPI, uploadAPI } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface TrustBadgeItem {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  display_order: number;
  is_active: boolean;
}

const emptyForm = { id: '', title: '', description: '', image_url: '', is_active: true };

const SortableRow: React.FC<{
  badge: TrustBadgeItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}> = ({ badge, onEdit, onDelete, onToggleActive }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: badge.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3">
      <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="h-12 w-12 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
        {badge.image_url ? (
          <img src={badge.image_url} alt={badge.title} className="h-full w-full object-cover" />
        ) : (
          <ShieldCheck className="h-5 w-5 text-gray-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{badge.title}</p>
        {badge.description && <p className="text-xs text-gray-500 truncate">{badge.description}</p>}
      </div>
      <button type="button" onClick={onToggleActive}>
        <Badge
          variant={badge.is_active ? 'default' : 'secondary'}
          className={`cursor-pointer ${badge.is_active ? 'bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25' : ''}`}
        >
          {badge.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </button>
      <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={onEdit} title="Edit">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={onDelete} title="Delete">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

const TrustBadges: React.FC = () => {
  const navigate = useNavigate();
  const [badges, setBadges] = useState<TrustBadgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = async () => {
    setLoading(true);
    try {
      const list = await trustBadgesAPI.getAll();
      setBadges((Array.isArray(list) ? list : []).sort((a: TrustBadgeItem, b: TrustBadgeItem) => a.display_order - b.display_order));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load trust badges');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(emptyForm); setShowForm(true); };
  const openEdit = (b: TrustBadgeItem) => {
    setForm({ id: b.id, title: b.title, description: b.description || '', image_url: b.image_url || '', is_active: b.is_active });
    setShowForm(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadAPI.uploadSingle(file, 'trust-badges');
      const url = res?.url || res?.data?.url || res?.data?.data?.url;
      if (url) setForm(f => ({ ...f, image_url: url }));
    } catch {
      setError('Image upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (form.id) {
        const updated = await trustBadgesAPI.update(form.id, {
          title: form.title.trim(), description: form.description.trim(), image_url: form.image_url, is_active: form.is_active,
        });
        setBadges(prev => prev.map(b => b.id === form.id ? { ...b, ...updated } : b));
      } else {
        const created = await trustBadgesAPI.create({
          title: form.title.trim(), description: form.description.trim(), image_url: form.image_url,
          is_active: form.is_active, display_order: badges.length,
        });
        setBadges(prev => [...prev, created]);
      }
      setShowForm(false);
      setForm(emptyForm);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save badge');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trust badge?')) return;
    try {
      await trustBadgesAPI.delete(id);
      setBadges(prev => prev.filter(b => b.id !== id));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete badge');
    }
  };

  const handleToggleActive = async (b: TrustBadgeItem) => {
    const next = !b.is_active;
    setBadges(prev => prev.map(x => x.id === b.id ? { ...x, is_active: next } : x));
    try {
      await trustBadgesAPI.update(b.id, { is_active: next });
    } catch {
      setBadges(prev => prev.map(x => x.id === b.id ? { ...x, is_active: b.is_active } : x)); // revert
      setError('Failed to update status');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = badges.findIndex(b => b.id === active.id);
    const newIndex = badges.findIndex(b => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(badges, oldIndex, newIndex).map((b, i) => ({ ...b, display_order: i }));
    setBadges(reordered);
    try {
      await Promise.all(reordered.map((b, i) => trustBadgesAPI.update(b.id, { display_order: i })));
    } catch {
      setError('Failed to save the new order');
      load();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/appearance/pages')} className="text-muted-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Appearance
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Trust Badges</h1>
            <p className="text-sm text-muted-foreground mt-1">Small trust icons shown on the storefront (e.g. Free Shipping, Secure Payment).</p>
          </div>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Badge</Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">{form.id ? 'Edit Badge' : 'New Badge'}</h3>
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Free Shipping" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="On orders above ₹499" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Icon</Label>
            <div className="flex items-center gap-3">
              {form.image_url && <img src={form.image_url} alt="" className="h-10 w-10 rounded object-cover border" />}
              <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="text-xs" />
              {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="badge-active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            <Label htmlFor="badge-active" className="text-xs font-normal cursor-pointer">Active</Label>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {form.id ? 'Save' : 'Create'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm); }}>Cancel</Button>
          </div>
        </div>
      )}

      {badges.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400">
          No trust badges yet.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={badges.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {badges.map(b => (
                <SortableRow
                  key={b.id} badge={b}
                  onEdit={() => openEdit(b)}
                  onDelete={() => handleDelete(b.id)}
                  onToggleActive={() => handleToggleActive(b)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

export default TrustBadges;
