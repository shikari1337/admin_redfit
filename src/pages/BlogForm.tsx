import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FaArrowLeft, FaSave } from 'react-icons/fa';

interface BlogFormState {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image: string;
  author_name: string;
  status: 'draft' | 'published' | 'scheduled' | 'archived';
  published_at: string;
  tags: string; // comma-separated input
  read_time_min: string;
  seo_title: string;
  seo_description: string;
}

const EMPTY_FORM: BlogFormState = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  cover_image: '',
  author_name: '',
  status: 'draft',
  published_at: '',
  tags: '',
  read_time_min: '',
  seo_title: '',
  seo_description: '',
};

const toKebab = (str: string) =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const BlogForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<BlogFormState>({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    if (isEdit && id) {
      fetchPost(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchPost = async (postId: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/blog-posts/${postId}`);
      const d = res.data?.data ?? res.data;
      setForm({
        title: d.title ?? '',
        slug: d.slug ?? '',
        excerpt: d.excerpt ?? '',
        content: d.content ?? '',
        cover_image: d.cover_image ?? '',
        author_name: d.author_name ?? '',
        status: d.status ?? 'draft',
        published_at: d.published_at ? d.published_at.slice(0, 16) : '',
        tags: Array.isArray(d.tags) ? d.tags.join(', ') : (d.tags ?? ''),
        read_time_min: d.read_time_min != null ? String(d.read_time_min) : '',
        seo_title: d.seo?.title ?? '',
        seo_description: d.seo?.description ?? '',
      });
      setSlugManuallyEdited(true); // don't auto-generate when editing
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load post');
    } finally {
      setLoading(false);
    }
  };

  const handleTitleChange = (title: string) => {
    setForm(prev => ({
      ...prev,
      title,
      slug: slugManuallyEdited ? prev.slug : toKebab(title),
    }));
  };

  const handleSlugChange = (slug: string) => {
    setSlugManuallyEdited(true);
    setForm(prev => ({ ...prev, slug }));
  };

  const handleChange = <K extends keyof BlogFormState>(key: K, value: BlogFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError(null);

    const tagsArray = form.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const payload: Record<string, any> = {
      title: form.title.trim(),
      slug: form.slug.trim() || toKebab(form.title),
      excerpt: form.excerpt.trim() || undefined,
      content: form.content.trim() || undefined,
      cover_image: form.cover_image.trim() || undefined,
      author_name: form.author_name.trim() || undefined,
      status: form.status,
      published_at: form.published_at || undefined,
      tags: tagsArray.length > 0 ? tagsArray : undefined,
      read_time_min: form.read_time_min ? Number(form.read_time_min) : undefined,
      seo: (form.seo_title || form.seo_description)
        ? { title: form.seo_title || undefined, description: form.seo_description || undefined }
        : undefined,
    };

    try {
      if (isEdit && id) {
        await api.put(`/blog-posts/${id}`, payload);
      } else {
        await api.post('/blog-posts', payload);
      }
      navigate('/blogs');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save post');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/blogs')} className="h-9">
          <FaArrowLeft className="mr-2 h-4 w-4" />
          Back to Blog Posts
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? 'Edit Blog Post' : 'New Blog Post'}
        </h1>
      </div>

      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main Content */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle>Content</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="title"
                value={form.title}
                onChange={e => handleTitleChange(e.target.value)}
                placeholder="Blog post title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={e => handleSlugChange(e.target.value)}
                placeholder="url-friendly-slug"
              />
              <p className="text-xs text-muted-foreground">Auto-generated from title. Edit to customise.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea
                id="excerpt"
                rows={3}
                value={form.excerpt}
                onChange={e => handleChange('excerpt', e.target.value)}
                placeholder="Short summary of the post..."
                className="resize-y"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content (HTML)</Label>
              <Textarea
                id="content"
                rows={16}
                value={form.content}
                onChange={e => handleChange('content', e.target.value)}
                placeholder="Write your blog post content here. Rich-text editor will be added in a future update."
                className="resize-y font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Post Settings */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle>Post Settings</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="author_name">Author Name</Label>
                <Input
                  id="author_name"
                  value={form.author_name}
                  onChange={e => handleChange('author_name', e.target.value)}
                  placeholder="Author full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={form.status} onValueChange={v => handleChange('status', v as BlogFormState['status'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="published_at">Publish Date &amp; Time</Label>
                <Input
                  id="published_at"
                  type="datetime-local"
                  value={form.published_at}
                  onChange={e => handleChange('published_at', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="read_time_min">Read Time (minutes)</Label>
                <Input
                  id="read_time_min"
                  type="number"
                  min={1}
                  value={form.read_time_min}
                  onChange={e => handleChange('read_time_min', e.target.value)}
                  placeholder="5"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cover_image">Cover Image URL</Label>
              <Input
                id="cover_image"
                value={form.cover_image}
                onChange={e => handleChange('cover_image', e.target.value)}
                placeholder="https://..."
              />
              {form.cover_image && (
                <img
                  src={form.cover_image}
                  alt="Cover preview"
                  className="mt-2 h-32 w-full object-cover rounded-md border"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={form.tags}
                onChange={e => handleChange('tags', e.target.value)}
                placeholder="homeopathy, health, remedies"
              />
            </div>
          </CardContent>
        </Card>

        {/* SEO */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle>SEO</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="seo_title">Meta Title</Label>
              <Input
                id="seo_title"
                value={form.seo_title}
                onChange={e => handleChange('seo_title', e.target.value)}
                placeholder="SEO page title (defaults to post title)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seo_description">Meta Description</Label>
              <Textarea
                id="seo_description"
                rows={3}
                value={form.seo_description}
                onChange={e => handleChange('seo_description', e.target.value)}
                placeholder="SEO description (150-160 chars recommended)"
                className="resize-y"
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3 pb-8">
          <Button type="submit" disabled={saving} className="min-w-32">
            <FaSave className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : isEdit ? 'Update Post' : 'Create Post'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/blogs')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

export default BlogForm;
