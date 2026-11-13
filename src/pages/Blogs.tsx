import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FaPlus, FaEdit, FaTrash, FaToggleOn, FaToggleOff, FaExternalLinkAlt } from 'react-icons/fa';
import StatusBadge from '../components/order/StatusBadge';
import { Pagination } from '@/components/erp';
import { formatDate } from '../utils/date';
import { toast } from '@/hooks/use-toast';
import { blogPostUrl, useStoreSiteUrl } from '../lib/storefront';

/** A message that used to be a blocking alert() — now a toast (the shell mounts the Toaster). */
const notify = (message: string) =>
  toast({ title: message, variant: /fail|could not|error/i.test(message) ? 'destructive' : 'default' });


interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  author_name?: string;
  status: 'draft' | 'published' | 'scheduled' | 'archived';
  published_at?: string;
  view_count?: number;
  read_time_min?: number;
  tags?: string[];
}

const PAGE_SIZE = 20;

/**
 * The status filter. On v2 `published` lists the posts shoppers can read now and `scheduled` the
 * ones waiting for their publish date (commerce db/catalog_mgmt/blog/queries.rs `live_sql`).
 */
const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Live' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'draft', label: 'Drafts' },
  { key: 'archived', label: 'Archived' },
];

/** A post that is published or scheduled but whose date is still ahead: it waits. */
const waiting = (p: BlogPost) =>
  (p.status === 'published' || p.status === 'scheduled') && !!p.published_at && new Date(p.published_at).getTime() > Date.now();

/** Live on the shop now (the same rule the server applies). */
const isLive = (p: BlogPost) =>
  (p.status === 'published' && !waiting(p)) || (p.status === 'scheduled' && !!p.published_at && !waiting(p));

const Blogs: React.FC = () => {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  // Backend requires content.manage for create/update (incl. publish toggle),
  // content.delete for removal (routes/blogPosts.ts) — this page had ZERO client-side
  // gating before.
  const canManageBlogs = hasPerm('content.manage');
  const canDeleteBlogs = hasPerm('content.delete');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const site = useStoreSiteUrl();

  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page]);

  useEffect(() => { fetchCounts(); }, []);

  /** One number per filter (each list's total, one row asked for). */
  const fetchCounts = async () => {
    try {
      const pairs = await Promise.all(FILTERS.map(async (f) => {
        const params: Record<string, any> = { limit: 1 };
        if (f.key !== 'all') params.status = f.key;
        const res = await api.get('/blog-posts', { params });
        const d = res.data;
        return [f.key, Number(d?.total ?? (Array.isArray(d?.data) ? d.data.length : 0)) || 0] as const;
      }));
      setCounts(Object.fromEntries(pairs));
    } catch {
      setCounts(null);
    }
  };

  const fetchPosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { page, limit: PAGE_SIZE };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const res = await api.get('/blog-posts', { params });
      const data = res.data;
      if (Array.isArray(data)) {
        setPosts(data);
        setTotal(data.length);
      } else if (Array.isArray(data?.data)) {
        setPosts(data.data);
        setTotal(data.total ?? data.data.length);
      } else {
        setPosts([]);
        setTotal(0);
      }
    } catch (err: any) {
      console.error('Failed to fetch blog posts', err);
      if (err?.response?.status === 404) {
        setError(null);
        setPosts([]);
      } else {
        setError(err?.response?.data?.message || 'Failed to load blog posts. The endpoint may not be available yet.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchPosts();
  };

  const handleDelete = async (post: BlogPost) => {
    if (!confirm(`Delete blog post "${post.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/blog-posts/${post.id}`);
      fetchPosts();
      fetchCounts();
    } catch (err: any) {
      notify(err?.response?.data?.message || 'Failed to delete post');
    }
  };

  const handleToggleStatus = async (post: BlogPost) => {
    const newStatus = post.status === 'published' ? 'draft' : 'published';
    try {
      await api.put(`/blog-posts/${post.id}`, { status: newStatus });
      fetchPosts();
      fetchCounts();
    } catch (err: any) {
      notify(err?.response?.data?.message || 'Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Blog Posts</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage your store's blog content.</p>
        </div>
        {canManageBlogs && (
          <Button onClick={() => navigate('/blogs/new')} className="flex items-center gap-2">
            <FaPlus className="h-4 w-4" />
            New Post
          </Button>
        )}
      </div>

      {/* What needs attention first: drafts and scheduled posts, then the rest. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => { setStatusFilter(f.key); setPage(1); }}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
              statusFilter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'
            }`}>
            {f.label}
            {counts && <span className={statusFilter === f.key ? 'opacity-80' : 'text-muted-foreground'}>{counts[f.key] ?? 0}</span>}
          </button>
        ))}
      </div>
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Search title and excerpt"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Button type="submit" variant="outline">Search</Button>
      </form>

      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 text-sm text-destructive rounded-md">
          {error}
        </div>
      )}

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-semibold px-4 py-3">Title</TableHead>
                <TableHead className="font-semibold px-4 py-3">Status</TableHead>
                <TableHead className="hidden font-semibold px-4 py-3 md:table-cell">Author</TableHead>
                <TableHead className="hidden font-semibold px-4 py-3 sm:table-cell">Published</TableHead>
                <TableHead className="hidden font-semibold px-4 py-3 text-right md:table-cell">Views</TableHead>
                <TableHead className="font-semibold px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : posts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                    {error
                      ? 'Could not load posts.'
                      : statusFilter !== 'all' || search.trim()
                        ? 'No posts match this filter.'
                        : 'No blog posts yet. Write the first one.'}
                  </TableCell>
                </TableRow>
              ) : (
                posts.map(post => (
                  <TableRow key={post.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="px-4 py-3">
                      <div className="font-medium text-foreground">{post.title}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5 break-all">{post.slug}</div>
                      {post.published_at && (
                        <div className="text-xs text-muted-foreground mt-0.5 sm:hidden">{formatDate(post.published_at, 'MMM dd, yyyy')}</div>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusBadge status={waiting(post) ? 'scheduled' : post.status} type="blog" />
                      {waiting(post) && post.published_at && (
                        <div className="text-[11px] text-muted-foreground mt-1 whitespace-nowrap">Goes live {formatDate(post.published_at, 'MMM dd, HH:mm')}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-sm text-muted-foreground md:table-cell">
                      {post.author_name || '-'}
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-sm text-muted-foreground whitespace-nowrap sm:table-cell">
                      {post.published_at ? formatDate(post.published_at, 'MMM dd, yyyy') : '-'}
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-right text-sm text-muted-foreground md:table-cell">
                      {post.view_count?.toLocaleString() ?? '0'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {isLive(post) && blogPostUrl(site, post.slug) && (
                          <a href={blogPostUrl(site, post.slug)!} target="_blank" rel="noopener noreferrer" title="View on shop"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                            <FaExternalLinkAlt className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {canManageBlogs && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title={post.status === 'published' ? 'Unpublish (back to draft)' : 'Publish'}
                            className="h-8 w-8 p-0"
                            onClick={() => handleToggleStatus(post)}
                          >
                            {post.status === 'published'
                              ? <FaToggleOn className="h-4 w-4 text-green-600" />
                              : <FaToggleOff className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        )}
                        {canManageBlogs && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3"
                            onClick={() => navigate(`/blogs/${post.id}/edit`)}
                          >
                            <FaEdit className="h-3.5 w-3.5 mr-1.5" />
                            Edit
                          </Button>
                        )}
                        {canDeleteBlogs && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Delete"
                            onClick={() => handleDelete(post)}
                          >
                            <FaTrash className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
    </div>
  );
};

export default Blogs;
