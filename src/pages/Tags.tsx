/**
 * Tags: free labels staff put on products, for grouping and filtering. A shopper meets a tag on the
 * product page (its chip opens the shop's product list filtered by that tag).
 *
 * Opens with what to act on (tags on no product, switched-off tags), then the list. Every tag is
 * loaded once (pages of 200, the server's cap) and searched and filtered here, so the chips and the
 * counts always agree.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Tag as TagIcon, Pencil, Trash2, Download } from 'lucide-react';
import { api, tagsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Page, PageHeader, EmptyState, FilterChips, BlockSkeleton, downloadCsv, type ChipGroup,
} from '@/components/erp';

interface Tag {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  /** Products carrying the tag; null when the server does not count them. */
  productCount: number | null;
}

/** One page of the tag list (the server answers at most 200 a page). */
const PAGE = 200;
/** A guard against a runaway loop: 50 pages is 10,000 tags. */
const MAX_PAGES = 50;

const rowsOf = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

/** The row as the screen reads it: either spelling (v2 snake_case, the legacy camelCase aliases). */
const normalizeTag = (t: any): Tag => {
  const n = t?.product_count ?? t?.productCount;
  return {
    id: String(t?.id ?? t?._id ?? ''),
    name: String(t?.name ?? ''),
    slug: String(t?.slug ?? ''),
    description: String(t?.description ?? ''),
    isActive: (t?.is_active ?? t?.isActive) !== false,
    productCount: n === undefined || n === null || !Number.isFinite(Number(n)) ? null : Number(n),
  };
};

const errorText = (err: any, fallback: string): string =>
  err?.response?.data?.message || err?.message || fallback;

const Tags: React.FC = () => {
  const { hasPerm } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  // The server requires products.manage for create, change and the active switch, and
  // products.delete for removal.
  const canManageTags = hasPerm('products.manage');
  const canDeleteTags = hasPerm('products.delete');

  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [usage, setUsage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const byId = new Map<string, Tag>();
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const res = await api.get('/tags', { params: { limit: PAGE, offset: page * PAGE } });
        const rows = rowsOf(res?.data).map(normalizeTag).filter((t) => t.id);
        const before = byId.size;
        rows.forEach((t) => byId.set(t.id, t));
        // A short page is the last; a page with nothing new means the server ignored the offset.
        if (rows.length < PAGE || byId.size === before) break;
      }
      setTags(Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err: any) {
      setError(errorText(err, 'Could not load the tags.'));
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const counted = tags.some((t) => t.productCount !== null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tags.filter((t) => {
      if (q && !`${t.name} ${t.slug} ${t.description}`.toLowerCase().includes(q)) return false;
      if (status === 'active' && !t.isActive) return false;
      if (status === 'inactive' && t.isActive) return false;
      if (usage === 'unused' && t.productCount !== 0) return false;
      if (usage === 'used' && !((t.productCount ?? 0) > 0)) return false;
      return true;
    });
  }, [tags, query, status, usage]);

  const clearChips = () => { setStatus(''); setUsage(''); };

  /** What needs a look first. */
  const attentionItems = [
    {
      n: tags.filter((t) => t.isActive && t.productCount === 0).length,
      label: 'on no product',
      apply: () => { clearChips(); setStatus('active'); setUsage('unused'); },
    },
    {
      n: tags.filter((t) => !t.isActive).length,
      label: 'switched off',
      apply: () => { clearChips(); setStatus('inactive'); },
    },
  ].filter((a) => a.n > 0);

  const chipGroups: ChipGroup[] = [
    {
      key: 'status', label: 'Status', value: status, onChange: setStatus,
      help: 'A switched-off tag stays on its products but is not shown in the shop.',
      options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Switched off' }],
    },
    {
      key: 'usage', label: 'Products', value: usage, onChange: setUsage,
      options: counted ? [{ value: 'used', label: 'On products' }, { value: 'unused', label: 'On no product' }] : [],
    },
  ];

  const toggleActive = async (tag: Tag, next: boolean) => {
    const before = tags;
    setBusyId(tag.id);
    setTags((ts) => ts.map((t) => (t.id === tag.id ? { ...t, isActive: next } : t)));
    try {
      await tagsAPI.update(tag.id, { isActive: next });
    } catch (err: any) {
      setTags(before);
      toast({ title: `Could not change ${tag.name}`, description: errorText(err, 'Please try again.'), variant: 'destructive' as any });
    } finally {
      setBusyId(null);
    }
  };

  const removeTag = async (tag: Tag) => {
    const on = tag.productCount ? ` It is on ${tag.productCount} product${tag.productCount === 1 ? '' : 's'}; they keep everything else.` : '';
    if (!window.confirm(`Delete the tag "${tag.name}"?${on}`)) return;
    setBusyId(tag.id);
    try {
      await tagsAPI.delete(tag.id);
      setTags((ts) => ts.filter((t) => t.id !== tag.id));
      toast({ title: `Deleted ${tag.name}` });
    } catch (err: any) {
      toast({ title: `Could not delete ${tag.name}`, description: errorText(err, 'Please try again.'), variant: 'destructive' as any });
    } finally {
      setBusyId(null);
    }
  };

  const exportTags = () => downloadCsv(
    `tags-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      { key: 'name', label: 'Name' },
      { key: 'slug', label: 'Slug' },
      { key: 'description', label: 'Description' },
      { key: 'isActive', label: 'Active', format: (t: Tag) => (t.isActive ? 'Yes' : 'No') },
      { key: 'productCount', label: 'Products', format: (t: Tag) => (t.productCount ?? '') },
    ],
    filtered,
  );

  return (
    <Page width="full">
      <PageHeader
        icon={TagIcon}
        title="Tags"
        description="Free labels on products. A shopper can open every product with a tag from its chip on the product page."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportTags} disabled={!filtered.length}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            {canManageTags && (
              <Button size="sm" onClick={() => navigate('/products/tags/new')} className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> New tag
              </Button>
            )}
          </>
        }
      />

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={fetchTags}>Try again</Button>
        </div>
      )}

      <Card className="shadow-sm">
        <CardHeader className="space-y-3 border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardDescription className="m-0">
              {loading
                ? 'Loading tags'
                : filtered.length === tags.length
                  ? `${tags.length} tags`
                  : `${filtered.length} of ${tags.length} tags`}
            </CardDescription>
            <FilterChips groups={chipGroups} onClearAll={clearChips} />
          </div>
          {!loading && attentionItems.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Tags to look at">
              {attentionItems.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.apply}
                  className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 hover:bg-amber-100"
                >
                  {a.n} {a.label}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, slug or description"
              aria-label="Search tags"
              className="max-w-md pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <BlockSkeleton lines={8} className="p-4" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={TagIcon}
              title={tags.length === 0 ? 'No tags yet' : 'Nothing matches'}
              description={tags.length === 0
                ? 'A tag groups products across categories and brands, such as "Summer care" or "Bestseller".'
                : 'No tag matches this search and these filters.'}
              action={tags.length === 0
                ? (canManageTags ? <Button size="sm" onClick={() => navigate('/products/tags/new')}>New tag</Button> : undefined)
                : <Button variant="outline" size="sm" onClick={() => { setQuery(''); clearChips(); }}>Clear search and filters</Button>}
            />
          ) : (
            <div className="max-h-[640px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Tag</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="w-24 text-right">Products</TableHead>
                    <TableHead className="w-20 text-center">Active</TableHead>
                    <TableHead className="w-24 text-right"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tag) => (
                    <TableRow key={tag.id} className="group">
                      <TableCell className="py-2">
                        <button
                          type="button"
                          disabled={!canManageTags}
                          onClick={() => navigate(`/products/tags/${tag.id}/edit`)}
                          className="block w-full min-w-0 text-left disabled:cursor-default"
                        >
                          <span className="block truncate font-medium group-hover:underline">{tag.name}</span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">{tag.slug}</span>
                        </button>
                      </TableCell>
                      <TableCell className="hidden max-w-xs py-2 md:table-cell">
                        <span className="block truncate text-sm text-muted-foreground">{tag.description || '-'}</span>
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">
                        {tag.productCount === null ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          <span className={tag.productCount === 0 && tag.isActive ? 'text-amber-600' : ''}>{tag.productCount}</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <Switch
                          checked={tag.isActive}
                          onCheckedChange={(v) => toggleActive(tag, v)}
                          disabled={!canManageTags || busyId === tag.id}
                          aria-label={`${tag.name} active`}
                        />
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          {canManageTags && (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(`/products/tags/${tag.id}/edit`)} aria-label={`Edit ${tag.name}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDeleteTags && (
                            <Button
                              variant="ghost" size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => removeTag(tag)}
                              disabled={busyId === tag.id}
                              aria-label={`Delete ${tag.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
};

export default Tags;
