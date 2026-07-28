import React, { useEffect, useMemo, useState } from 'react';
import { FaPlus, FaSave, FaUndo, FaTrash } from 'react-icons/fa';
import { categoriesAPI, attributesAPI } from '../services/api';
import ImageInputWithActions from '../components/common/ImageInputWithActions';
import IconPicker, { getIconComponent } from '../components/IconPicker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
  isPublic?: boolean;
  parent?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  imageUrl: '',
  icon: '',
  displayOrder: '',
  parent: 'none',
  isActive: true,
  isPublic: true,
  metaTitle: '',
  metaDesc: '',
  ogImageUrl: '',
  // Category → attribute FILTER: show only / hide variations whose attribute value matches.
  filterAttributeSlug: '',
  filterAttributeValue: '',
  filterAttributeMode: 'only', // 'only' (show only matching) | 'exclude' (hide matching)
};

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [attributes, setAttributes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    ...emptyForm,
  });
  const [error, setError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
    // Attributes (+ their values) power the "prioritise attribute" picker below.
    attributesAPI.list({ isActive: true })
      .then((a: any) => setAttributes(Array.isArray(a) ? a : []))
      .catch(() => setAttributes([]));
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response = await categoriesAPI.list();
      let categories: any[] = [];
      if (Array.isArray(response)) {
        categories = response;
      } else if (Array.isArray(response?.data)) {
        categories = response.data;
      } else if (Array.isArray(response?.data?.data)) {
        categories = response.data.data;
      }
      setCategories(categories);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch categories', err);
      setError(err?.message || 'Failed to fetch categories');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedId(null);
    setFormState({ ...emptyForm });
    setError(null);
    setImageError(null);
    setImageUploading(false);
  };

  const handleEdit = (category: Category) => {
    setSelectedId(category._id);
    setFormState({
      name: category.name || '',
      slug: category.slug || '',
      description: category.description || '',
      imageUrl: category.imageUrl || '',
      icon: category.icon || '',
      displayOrder:
        category.displayOrder !== undefined && category.displayOrder !== null
          ? String(category.displayOrder)
          : '',
      parent: category.parent ? String(category.parent) : 'none',
      isActive: category.isActive !== false,
      isPublic: category.isPublic !== false,
      metaTitle: (category as any).metaTitle ?? (category as any).meta_title ?? '',
      metaDesc: (category as any).metaDesc ?? (category as any).meta_desc ?? '',
      ogImageUrl: (category as any).ogImageUrl ?? (category as any).og_image_url ?? '',
      filterAttributeSlug: (category as any).filter_attribute_slug ?? (category as any).filterAttributeSlug ?? '',
      // A leading "!" in the stored value means EXCLUDE (hide matching); else INCLUDE.
      filterAttributeValue: String((category as any).filter_attribute_value ?? (category as any).filterAttributeValue ?? '').replace(/^!/, ''),
      filterAttributeMode: String((category as any).filter_attribute_value ?? (category as any).filterAttributeValue ?? '').startsWith('!') ? 'exclude' : 'only',
    });
    setError(null);
    setImageError(null);
    setImageUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formState.name.trim()) {
      setError('Category name is required');
      return;
    }

    if (imageUploading) {
      setError('Please wait for the image upload to finish before saving.');
      return;
    }

    if (imageError) {
      setError(imageError);
      return;
    }

    setSaving(true);
    setError(null);

    const payload: Record<string, any> = {
      name: formState.name.trim(),
      description: formState.description?.trim() || undefined,
      imageUrl: formState.imageUrl?.trim() || undefined,
      icon: formState.icon?.trim() || undefined,
      displayOrder: formState.displayOrder ? Number(formState.displayOrder) : undefined,
      isActive: formState.isActive,
      isPublic: formState.isPublic,
      parent: formState.parent && formState.parent !== 'none' ? formState.parent : null,
      metaTitle: formState.metaTitle?.trim() || undefined,
      metaDesc: formState.metaDesc?.trim() || undefined,
      ogImageUrl: formState.ogImageUrl?.trim() || undefined,
      // null (not undefined) so clearing the mapping actually unsets it on update.
      // Exclude mode is encoded as a leading "!" on the value (no schema change).
      filterAttributeSlug: formState.filterAttributeSlug?.trim() || null,
      filterAttributeValue: (() => {
        const slug = formState.filterAttributeSlug?.trim();
        const val = formState.filterAttributeValue?.trim();
        if (!slug || !val) return null;
        return formState.filterAttributeMode === 'exclude' ? `!${val}` : val;
      })(),
    };

    if (formState.slug?.trim()) {
      payload.slug = formState.slug.trim();
    }

    try {
      if (selectedId) {
        await categoriesAPI.update(selectedId, payload);
      } else {
        await categoriesAPI.create(payload);
      }
      await fetchCategories();
      resetForm();
    } catch (err: any) {
      console.error('Failed to save category', err);
      setError(err?.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category: Category) => {
    if (!confirm(`Delete category "${category.name}"?`)) return;
    setError(null);
    try {
      await categoriesAPI.delete(category._id);
      await fetchCategories();
      if (selectedId === category._id) {
        resetForm();
      }
    } catch (err: any) {
      console.error('Failed to delete category', err);
      setError(err?.message || 'Failed to delete category');
    }
  };

  const parentOptions = useMemo(() => {
    return categories.filter(cat => cat._id !== selectedId);
  }, [categories, selectedId]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground">Manage category hierarchy for the storefront.</p>
        </div>
        <Button onClick={resetForm} variant="outline" className="flex items-center gap-2">
          <FaPlus className="h-4 w-4" />
          New Category
        </Button>
      </div>

      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: Category List (Span 3) */}
        <Card className="lg:col-span-3 shadow-sm h-fit">
          <CardHeader className="pb-4 border-b flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Category List</CardTitle>
              <CardDescription>{categories.length} total categories</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[700px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center p-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : categories.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground transition-all">
                  No categories found. Create one.
                </div>
              ) : (
                categories.map(category => (
                  <div
                    key={category._id}
                    className={`flex items-start justify-between p-4 transition-colors hover:bg-muted/50 ${
                      selectedId === category._id ? 'bg-muted/80' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-foreground truncate">{category.name}</span>
                        {!category.isActive && (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                        {category.isPublic === false && (
                          <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Hidden</Badge>
                        )}
                        {category.parent && (
                          <Badge variant="outline" className="text-xs">
                            Parent: {categories.find(cat => cat._id === category.parent)?.name || 'Unknown'}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-3 gap-y-1">
                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{category.slug}</span>
                        {category.displayOrder !== undefined && (
                          <span>Order: {category.displayOrder}</span>
                        )}
                      </div>
                      {category.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                          {category.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 isolate">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEdit(category)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(category)}
                      >
                        <FaTrash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Create/Edit Form (Span 2) */}
        <Card className="lg:col-span-2 shadow-sm h-fit sticky top-6">
          <CardHeader className="pb-4 border-b">
            <div className="flex items-center justify-between">
              <CardTitle>{selectedId ? 'Edit Category' : 'Create Category'}</CardTitle>
              {selectedId && (
                <Button variant="ghost" size="sm" onClick={resetForm} className="h-8 px-2 text-muted-foreground">
                  <FaUndo className="mr-2 h-3.5 w-3.5" /> Reset
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  value={formState.name}
                  onChange={e => setFormState({ ...formState, name: e.target.value })}
                  placeholder="Category name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={formState.slug}
                  onChange={e => setFormState({ ...formState, slug: e.target.value })}
                  placeholder="Optional custom slug"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={formState.description}
                  onChange={e => setFormState({ ...formState, description: e.target.value })}
                  placeholder="Optional description"
                  className="resize-y"
                />
              </div>

              <div className="space-y-3 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SEO (search engines &amp; social)</p>
                <div className="space-y-2">
                  <Label htmlFor="metaTitle">Meta Title</Label>
                  <Input
                    id="metaTitle"
                    value={formState.metaTitle}
                    onChange={e => setFormState({ ...formState, metaTitle: e.target.value })}
                    placeholder="Defaults to the category name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metaDesc">Meta Description</Label>
                  <Textarea
                    id="metaDesc"
                    rows={2}
                    value={formState.metaDesc}
                    onChange={e => setFormState({ ...formState, metaDesc: e.target.value })}
                    placeholder="Shown in search results (~160 characters)"
                    className="resize-y"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Social Share Image (Open Graph)</Label>
                  <ImageInputWithActions
                    value={formState.ogImageUrl || ''}
                    onChange={(url: string) => setFormState({ ...formState, ogImageUrl: url })}
                    label=""
                    placeholder="OG image URL (https://...)"
                  />
                </div>
              </div>

              {/* Category → attribute filter */}
              <div className="space-y-3 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter by a product attribute</p>
                <p className="-mt-1 text-[11px] text-gray-400">
                  Show <strong>only</strong> — or <strong>hide</strong> — variations whose attribute value matches. E.g. a
                  &ldquo;Dilutions&rdquo; category with <em>Potency · Hide · Q</em> hides mother tinctures (potency&nbsp;Q);
                  &ldquo;Mother Tinctures&rdquo; with <em>Potency · Only show · Q</em> shows only them. Leave blank = show everything.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Attribute</Label>
                    <Select
                      value={formState.filterAttributeSlug || 'none'}
                      onValueChange={v => setFormState({ ...formState, filterAttributeSlug: v === 'none' ? '' : v, filterAttributeValue: '' })}
                    >
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {attributes.map((a: any) => (
                          <SelectItem key={a.slug ?? a._id} value={a.slug}>{a.name ?? a.slug}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Mode</Label>
                    <Select
                      value={formState.filterAttributeMode}
                      onValueChange={v => setFormState({ ...formState, filterAttributeMode: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="only">Only show</SelectItem>
                        <SelectItem value="exclude">Hide</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Value</Label>
                    {(() => {
                      const attr = attributes.find((a: any) => a.slug === formState.filterAttributeSlug);
                      const values: any[] = Array.isArray(attr?.values) ? attr.values : [];
                      if (!formState.filterAttributeSlug) {
                        return <Input disabled placeholder="Pick an attribute first" />;
                      }
                      if (values.length) {
                        return (
                          <Select
                            value={formState.filterAttributeValue || 'none'}
                            onValueChange={v => setFormState({ ...formState, filterAttributeValue: v === 'none' ? '' : v })}
                          >
                            <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Any</SelectItem>
                              {values.map((val: any, i: number) => {
                                const slug = val.slug ?? val.value ?? String(val);
                                return <SelectItem key={`${slug}-${i}`} value={slug}>{val.name ?? val.label ?? slug}</SelectItem>;
                              })}
                            </SelectContent>
                          </Select>
                        );
                      }
                      return (
                        <Input
                          value={formState.filterAttributeValue}
                          onChange={e => setFormState({ ...formState, filterAttributeValue: e.target.value })}
                          placeholder="Attribute value slug (e.g. dilution)"
                        />
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Category Image</Label>
                <ImageInputWithActions
                  value={formState.imageUrl || ''}
                  onChange={(url: string) => setFormState({ ...formState, imageUrl: url })}
                  label=""
                  placeholder="Image URL (https://...)"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Icon (optional)</Label>
                <div className="flex items-center gap-2">
                  {formState.icon && (
                    <>
                      {(() => { const IC = getIconComponent(formState.icon); return IC ? <IC size={18} className="text-gray-600 flex-shrink-0" /> : null; })()}
                      <code className="text-xs text-muted-foreground truncate max-w-[140px]">{formState.icon}</code>
                    </>
                  )}
                  <IconPicker
                    value={formState.icon || ''}
                    onChange={(id: string) => setFormState({ ...formState, icon: id })}
                  />
                  {formState.icon && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => setFormState({ ...formState, icon: '' })}>Remove</Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="displayOrder">Display Order</Label>
                  <Input
                    id="displayOrder"
                    type="number"
                    value={formState.displayOrder}
                    onChange={e => setFormState({ ...formState, displayOrder: e.target.value })}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="parent">Parent Category</Label>
                  <Select 
                    value={formState.parent} 
                    onValueChange={(val) => setFormState({ ...formState, parent: val })}
                  >
                    <SelectTrigger id="parent">
                      <SelectValue placeholder="No Parent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No parent (top-level)</SelectItem>
                      {parentOptions.map(parent => (
                        <SelectItem key={parent._id} value={parent._id}>
                          {parent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  id="isActive"
                  checked={formState.isActive}
                  onCheckedChange={(checked) => setFormState({ ...formState, isActive: checked })}
                />
                <Label htmlFor="isActive" className="cursor-pointer">Category is active</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isPublic"
                  checked={formState.isPublic}
                  onCheckedChange={(checked) => setFormState({ ...formState, isPublic: checked })}
                />
                <div>
                  <Label htmlFor="isPublic" className="cursor-pointer">Show in storefront</Label>
                  <p className="text-xs text-muted-foreground">Visible in navigation menus and category listings</p>
                </div>
              </div>

              <div className="pt-4 border-t flex gap-3">
                <Button
                  type="submit"
                  disabled={saving}
                  className="flex-1"
                >
                  <FaSave className="mr-2" />
                  {saving ? 'Saving...' : selectedId ? 'Update Category' : 'Create Category'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  className="flex-none"
                >
                  <FaUndo className="mr-2" />
                  Clear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Categories;
