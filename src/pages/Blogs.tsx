import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FaPlus, FaEdit, FaTrash, FaToggleOn, FaToggleOff } from 'react-icons/fa';
import StatusBadge from '../components/order/StatusBadge';

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

const Blogs: React.FC = () => {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page]);

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
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete post');
    }
  };

  const handleToggleStatus = async (post: BlogPost) => {
    const newStatus = post.status === 'published' ? 'draft' : 'published';
    try {
      await api.put(`/blog-posts/${post.id}`, { status: newStatus });
      fetchPosts();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to update status');
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Blog Posts</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage your store's blog content.</p>
        </div>
        <Button onClick={() => navigate('/blogs/new')} className="flex items-center gap-2">
          <FaPlus className="h-4 w-4" />
          New Post
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <Input
            placeholder="Search by title..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Button type="submit" variant="outline">Search</Button>
        </form>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                <TableHead className="font-semibold px-4 py-3">Author</TableHead>
                <TableHead className="font-semibold px-4 py-3">Published</TableHead>
                <TableHead className="font-semibold px-4 py-3 text-right">Views</TableHead>
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
                    {error ? 'Could not load posts.' : 'No blog posts found. Create your first post.'}
                  </TableCell>
                </TableRow>
              ) : (
                posts.map(post => (
                  <TableRow key={post.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="px-4 py-3">
                      <div className="font-medium text-foreground">{post.title}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{post.slug}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusBadge status={post.status} type="blog" />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {post.author_name || '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {post.published_at ? format(new Date(post.published_at), 'MMM dd, yyyy') : '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right text-sm text-muted-foreground">
                      {post.view_count?.toLocaleString() ?? '0'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          title={post.status === 'published' ? 'Unpublish' : 'Publish'}
                          className="h-8 w-8 p-0"
                          onClick={() => handleToggleStatus(post)}
                        >
                          {post.status === 'published'
                            ? <FaToggleOn className="h-4 w-4 text-green-600" />
                            : <FaToggleOff className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3"
                          onClick={() => navigate(`/blogs/${post.id}/edit`)}
                        >
                          <FaEdit className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleDelete(post)}
                        >
                          <FaTrash className="h-3.5 w-3.5" />
                        </Button>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing page {page} of {totalPages} ({total} posts)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Blogs;
