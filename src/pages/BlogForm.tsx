import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ImageInputWithActions from '../components/common/ImageInputWithActions';
import { AiTextButton } from '../components/common/AiTextButton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FaArrowLeft, FaSave, FaExternalLinkAlt } from 'react-icons/fa';
import RichTextEditor from '../components/common/RichTextEditor';
import { formatDateTime, fromStoreDateTimeInput, storeDateTimeInput } from '../utils/date';
import { blogPostUrl, useStoreSiteUrl } from '../lib/storefront';

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

/** What each status means on the shop (the v2 live rule: commerce db/catalog_mgmt/blog/queries.rs `live_sql`). */
const STATUS_HINT: Record<BlogFormState['status'], string> = {
  draft: 'Only staff can see it.',
  published: 'On the shop now, or from the publish date when that is later.',
  scheduled: 'Goes on the shop at the publish date.',
  archived: 'Taken off the shop; kept here.',
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
  const [htmlMode, setHtmlMode] = useState(false);
  // The slug and state the shop knows (the saved post, not the form): the "view on the shop" link.
  const [savedLive, setSavedLive] = useState<{ slug: string; live: boolean } | null>(null);
  const site = useStoreSiteUrl();

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
        // The store's wall clock, not the browser's and not UTC.
        published_at: storeDateTimeInput(d.published_at),
        tags: Array.isArray(d.tags) ? d.tags.join(', ') : (d.tags ?? ''),
        read_time_min: d.read_time_min != null ? String(d.read_time_min) : '',
        seo_title: d.seo?.title ?? '',
        seo_description: d.seo?.description ?? '',
      });
      setSlugManuallyEdited(true); // don't auto-generate when editing
      const due = d.published_at ? new Date(d.published_at).getTime() <= Date.now() : d.status === 'published';
      setSavedLive({ slug: d.slug ?? '', live: (d.status === 'published' || d.status === 'scheduled') && due });
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

  /** The publish date as the API takes it (RFC 3339 with the store's offset), '' when none, null when unreadable. */
  const publishAt = (): string | null => (form.published_at ? fromStoreDateTimeInput(form.published_at) : '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    const plain = form.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!plain && !/<(img|iframe|video)\b/i.test(form.content)) {
      setError('Write the post before saving it.');
      return;
    }
    const when = publishAt();
    if (when === null) {
      setError('The publish date is not a valid date and time.');
      return;
    }
    if (form.status === 'scheduled' && !when) {
      setError('A scheduled post needs the date and time it goes on the shop.');
      return;
    }
    setSaving(true);
    setError(null);

    const tagsArray = form.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    // A field emptied while editing is sent empty, so the saved value is cleared (the update keeps
    // whatever is left out). A new post leaves empty fields out.
    const text = (v: string) => (v.trim() ? v.trim() : isEdit ? '' : undefined);
    const payload: Record<string, any> = {
      title: form.title.trim(),
      slug: form.slug.trim() || toKebab(form.title),
      excerpt: text(form.excerpt),
      content: form.content.trim(),
      cover_image: text(form.cover_image),
      author_name: text(form.author_name),
      status: form.status,
      published_at: when || undefined,
      tags: tagsArray.length > 0 ? tagsArray : isEdit ? [] : undefined,
      read_time_min: form.read_time_min ? Number(form.read_time_min) : undefined,
      seo: (form.seo_title || form.seo_description || isEdit)
        ? { title: form.seo_title.trim(), description: form.seo_description.trim() }
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

  const whenIso = form.published_at ? fromStoreDateTimeInput(form.published_at) : null;
  const futureDate = whenIso ? new Date(whenIso).getTime() > Date.now() : false;
  const liveUrl = savedLive?.live ? blogPostUrl(site, savedLive.slug) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/blogs')} className="h-9">
          <FaArrowLeft className="mr-2 h-4 w-4" />
          Back to Blog Posts
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? 'Edit Blog Post' : 'New Blog Post'}
        </h1>
        {liveUrl && (
          <a href={liveUrl} target="_blank" rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            View on shop <FaExternalLinkAlt className="h-3 w-3" />
          </a>
        )}
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
              <div className="flex items-center justify-between gap-2"><Label htmlFor="excerpt">Excerpt</Label><AiTextButton entity="blog" draft={() => ({ title: form.title, excerpt: form.excerpt, content: form.content })} field="blog.excerpt" label="Excerpt" value={form.excerpt} onResult={(v) => handleChange('excerpt', String(v))} /></div>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="content">Post <span className="text-destructive">*</span></Label>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-md border border-input p-0.5 text-xs">
                    <button type="button" onClick={() => setHtmlMode(false)}
                      className={`rounded px-2 py-1 ${!htmlMode ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}>Visual</button>
                    <button type="button" onClick={() => setHtmlMode(true)}
                      className={`rounded px-2 py-1 ${htmlMode ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}>HTML</button>
                  </div>
                  <AiTextButton entity="blog" draft={() => ({ title: form.title, excerpt: form.excerpt, content: form.content })} field="blog.body" label="Post body" format="html" value={form.content} onResult={(v) => handleChange('content', String(v))} />
                </div>
              </div>
              {htmlMode ? (
                <Textarea
                  id="content"
                  rows={16}
                  value={form.content}
                  onChange={e => handleChange('content', e.target.value)}
                  placeholder="<p>Write the post here.</p>"
                  className="resize-y font-mono text-sm"
                />
              ) : (
                <RichTextEditor
                  value={form.content}
                  onChange={(html) => handleChange('content', html)}
                  placeholder="Write the post here."
                  minHeight={320}
                />
              )}
              <p className="text-xs text-muted-foreground">Scripts, forms and inline event code are removed when the post is saved.</p>
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
                <p className="text-xs text-muted-foreground">{STATUS_HINT[form.status]}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="published_at">Publish Date &amp; Time</Label>
                <Input
                  id="published_at"
                  type="datetime-local"
                  value={form.published_at}
                  onChange={e => handleChange('published_at', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {(form.status === 'published' || form.status === 'scheduled') && futureDate && whenIso
                    ? `Waits until ${formatDateTime(whenIso)} (store time).`
                    : form.published_at
                      ? 'Store time.'
                      : form.status === 'published' ? 'Left empty, the post is dated when it is first published.' : 'Store time.'}
                </p>
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

            <ImageInputWithActions
              label="Cover image"
              spec="blog.cover"
              entity="blog"
              folder="blog"
              draft={() => ({ title: form.title, excerpt: form.excerpt, content: form.content })}
              value={form.cover_image}
              onChange={(url) => handleChange('cover_image', url)}
              placeholder="https://..."
            />

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
              <div className="flex items-center justify-between gap-2"><Label htmlFor="seo_title">Meta Title</Label><AiTextButton entity="blog" draft={() => ({ title: form.title, excerpt: form.excerpt, content: form.content })} field="blog.title" label="Meta title" value={form.seo_title} onResult={(v) => handleChange('seo_title', String(v))} /></div>
              <Input
                id="seo_title"
                value={form.seo_title}
                onChange={e => handleChange('seo_title', e.target.value)}
                placeholder="SEO page title (defaults to post title)"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2"><Label htmlFor="seo_description">Meta Description</Label><AiTextButton entity="blog" draft={() => ({ title: form.title, excerpt: form.excerpt, content: form.content })} field="blog.excerpt" label="Meta description" value={form.seo_description} onResult={(v) => handleChange('seo_description', String(v))} /></div>
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
