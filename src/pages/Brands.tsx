import React, { useEffect, useState } from 'react';
import { FaPlus, FaSave, FaUndo, FaTrash } from 'react-icons/fa';
import { brandsAPI } from '../services/api';
import ImageInputWithActions from '../components/common/ImageInputWithActions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface Brand {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  displayOrder?: number;
  isActive?: boolean;
  isFeatured?: boolean;
}

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  imageUrl: '',
  displayOrder: '',
  isActive: true,
  isFeatured: false,
};

const Brands: React.FC = () => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState({ ...emptyForm });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBrands();
  }, []);

  const fetchBrands = async () => {
    setLoading(true);
    try {
      const response = await brandsAPI.list();
      let data: any[] = [];
      if (Array.isArray(response)) {
        data = response;
      } else if (Array.isArray(response?.data)) {
        data = response.data;
      }
      setBrands(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch brands', err);
      setError(err?.message || 'Failed to fetch brands');
      setBrands([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedId(null);
    setFormState({ ...emptyForm });
    setError(null);
  };

  const handleEdit = (brand: Brand) => {
    setSelectedId(brand._id);
    setFormState({
      name: brand.name || '',
      slug: brand.slug || '',
      description: brand.description || '',
      imageUrl: brand.imageUrl || '',
      displayOrder: brand.displayOrder !== undefined && brand.displayOrder !== null ? String(brand.displayOrder) : '',
      isActive: brand.isActive !== false,
      isFeatured: brand.isFeatured === true,
    });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formState.name.trim()) {
      setError('Brand name is required');
      return;
    }

    setSaving(true);
    setError(null);

    const payload: Record<string, any> = {
      name: formState.name.trim(),
      description: formState.description?.trim() || undefined,
      imageUrl: formState.imageUrl?.trim() || undefined,
      displayOrder: formState.displayOrder ? Number(formState.displayOrder) : undefined,
      isActive: formState.isActive,
      isFeatured: formState.isFeatured,
    };

    if (formState.slug?.trim()) {
      payload.slug = formState.slug.trim();
    }

    try {
      if (selectedId) {
        await brandsAPI.update(selectedId, payload);
      } else {
        await brandsAPI.create(payload);
      }
      await fetchBrands();
      resetForm();
    } catch (err: any) {
      console.error('Failed to save brand', err);
      setError(err?.message || 'Failed to save brand');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (brand: Brand) => {
    if (!confirm(`Delete brand "${brand.name}"?`)) return;
    setError(null);
    try {
      await brandsAPI.delete(brand._id);
      await fetchBrands();
      if (selectedId === brand._id) {
        resetForm();
      }
    } catch (err: any) {
      console.error('Failed to delete brand', err);
      setError(err?.message || 'Failed to delete brand');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Brands</h1>
          <p className="text-muted-foreground">Manage brands for products.</p>
        </div>
        <Button onClick={resetForm} variant="outline" className="flex items-center gap-2">
          <FaPlus className="h-4 w-4" />
          New Brand
        </Button>
      </div>

      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 shadow-sm h-fit">
          <CardHeader className="pb-4 border-b flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Brand List</CardTitle>
              <CardDescription>{brands.length} total brands</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[700px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center p-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : brands.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground transition-all">
                  No brands found. Create one.
                </div>
              ) : (
                brands.map(brand => (
                  <div
                    key={brand._id}
                    className={`flex items-start justify-between p-4 transition-colors hover:bg-muted/50 ${
                      selectedId === brand._id ? 'bg-muted/80' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-4 flex gap-4">
                      {brand.imageUrl && (
                        <div className="h-12 w-12 flex-shrink-0 bg-white rounded border overflow-hidden">
                          <img src={brand.imageUrl} alt={brand.name} className="h-full w-full object-contain" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground truncate">{brand.name}</span>
                          {!brand.isActive && (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                          {brand.isFeatured && (
                            <Badge variant="default" className="text-xs bg-yellow-500 hover:bg-yellow-600">Featured</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-3 gap-y-1">
                          <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{brand.slug}</span>
                          {brand.displayOrder !== undefined && (
                            <span>Order: {brand.displayOrder}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 isolate">
                      <Button variant="secondary" size="sm" onClick={() => handleEdit(brand)}>
                        Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(brand)}>
                        <FaTrash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-sm h-fit sticky top-6">
          <CardHeader className="pb-4 border-b">
            <div className="flex items-center justify-between">
              <CardTitle>{selectedId ? 'Edit Brand' : 'Create Brand'}</CardTitle>
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
                  placeholder="Brand name"
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

              <div className="space-y-2">
                <Label>Brand Logo</Label>
                <ImageInputWithActions
                  value={formState.imageUrl || ''}
                  onChange={(url: string) => setFormState({ ...formState, imageUrl: url })}
                  label=""
                  placeholder="Image URL (https://...)"
                />
              </div>

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

              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  id="isActive"
                  checked={formState.isActive}
                  onCheckedChange={(checked) => setFormState({ ...formState, isActive: checked })}
                />
                <Label htmlFor="isActive" className="cursor-pointer">Brand is active</Label>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  id="isFeatured"
                  checked={formState.isFeatured}
                  onCheckedChange={(checked) => setFormState({ ...formState, isFeatured: checked })}
                />
                <Label htmlFor="isFeatured" className="cursor-pointer">Featured brand</Label>
              </div>

              <div className="pt-4 border-t flex gap-3">
                <Button type="submit" disabled={saving} className="flex-1">
                  <FaSave className="mr-2" />
                  {saving ? 'Saving...' : selectedId ? 'Update Brand' : 'Create Brand'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} className="flex-none">
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

export default Brands;
