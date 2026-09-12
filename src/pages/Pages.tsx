import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaEye, FaEyeSlash, FaMagic } from 'react-icons/fa';
import api, { pagesAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Page {
  _id: string;
  title: string;
  slug: string;
  pageType: string;
  template: string;
  description?: string;
  isActive: boolean;
  isVisible: boolean;
  contentBlocks: any[];
  createdAt: string;
  updatedAt: string;
}

function getPageId(page: Page): string {
  const raw = page._id;
  if (typeof raw === 'string' && raw && raw !== '[object Object]') return raw;
  if (raw && typeof (raw as any).toString === 'function') {
    const s = (raw as any).toString();
    if (s && s !== '[object Object]') return s;
  }
  return '';
}

const Pages: React.FC = () => {
  const { hasPerm } = useAuth();
  // Backend requires content.manage for create/update (incl. seed, active/visible
  // toggles), content.delete for removal (routes/pages.ts) — this page had ZERO
  // client-side gating before.
  const canManagePages = hasPerm('content.manage');
  const canDeletePages = hasPerm('content.delete');
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPages();
  }, []);

  /**
   * Create any of the standard pages this store is missing — Home, About,
   * Contact, FAQ and the four policy pages every storefront links to (Privacy,
   * Terms, Return & Refund, Shipping). The policy pages arrive as DRAFTS holding
   * a starter outline, so nothing unreviewed is ever published in the store's
   * name; open one, write the policy, then publish it.
   *
   * `force` was previously chosen for the user (it turned itself on as soon as
   * the store had any page) — so the only reachable action on a live store was
   * the OVERWRITING one. It is now an explicit, separately-confirmed choice, and
   * the backend refuses to overwrite a policy page at all.
   */
  const handleSeed = async (force = false) => {
    const msg = force
      ? 'Overwrite Home, About, Contact and FAQ with fresh default content? Anything you have written on those four pages is replaced. (Your policy pages are never touched.)'
      : 'Create the standard pages this store is missing — Home, About, Contact, FAQ and the Privacy, Terms, Return & Refund and Shipping policy pages?\n\nPages you already have are left exactly as they are, and the policy pages are created unpublished so you can write them before they go live.';
    if (!confirm(msg)) return;
    try {
      const response = await api.post(force ? '/pages/seed?force=true' : '/pages/seed');
      const data = response?.data?.data ?? response?.data;
      const made: string[] = Array.isArray(data?.createdSlugs) ? data.createdSlugs : [];
      if (data?.created > 0 || data?.updated > 0) {
        const lines = [`${data.created || 0} page(s) created${data.updated ? `, ${data.updated} updated` : ''}`];
        if (made.length) lines.push('', ...made, '', 'The policy pages are unpublished — open each one, write your policy, then publish it.');
        alert(lines.join('\n'));
      } else {
        alert('Nothing to add — this store already has all the standard pages.');
      }
      fetchPages();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add pages');
    }
  };

  const fetchPages = async () => {
    try {
      setLoading(true);
      const result = await pagesAPI.getAll();
      let list: any[] = [];
      if (Array.isArray(result)) {
        list = result;
      } else if (result && Array.isArray(result?.data)) {
        list = result.data;
      } else if (result?.data?.data && Array.isArray(result.data.data)) {
        list = result.data.data;
      } else if (result?.pages && Array.isArray(result.pages)) {
        list = result.pages;
      }
      setPages(list);
    } catch (error: any) {
      console.error('Failed to fetch pages:', error);
      alert(error.response?.data?.message || 'Failed to fetch pages');
      setPages([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    
    try {
      await api.delete(`/pages/${id}`);
      alert('Page deleted successfully');
      fetchPages();
    } catch (error: any) {
      console.error('Failed to delete page:', error);
      alert(error.response?.data?.message || 'Failed to delete page');
    }
  };

  const toggleActive = async (page: Page) => {
    const id = getPageId(page);
    if (!id) return;
    try {
      await api.put(`/pages/${id}`, {
        ...page,
        isActive: !page.isActive,
      });
      fetchPages();
    } catch (error: any) {
      console.error('Failed to update page:', error);
      alert(error.response?.data?.message || 'Failed to update page');
    }
  };

  const toggleVisible = async (page: Page) => {
    const id = getPageId(page);
    if (!id) return;
    try {
      await api.put(`/pages/${id}`, {
        ...page,
        isVisible: !page.isVisible,
      });
      fetchPages();
    } catch (error: any) {
      console.error('Failed to update page:', error);
      alert(error.response?.data?.message || 'Failed to update page');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pages</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your website pages</p>
        </div>
        {canManagePages && (
          <div className="flex flex-wrap gap-2">
            {/* Reachable whatever the store already has — the old seed button lived
                only in the empty state, so a store with pages could never add the
                standard ones it was missing (every storefront links to the four
                policy pages). Never overwrites. */}
            <Button onClick={() => handleSeed(false)} variant="outline">
              Add missing standard pages
            </Button>
            <Button asChild className="bg-red-600 hover:bg-red-700 text-white">
              <Link to="/pages/new">
                <FaPlus className="w-4 h-4 mr-2" />
                Create Page
              </Link>
            </Button>
          </div>
        )}
      </div>

      {pages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <p className="text-muted-foreground">No pages found. Add the standard pages or create your first page.</p>
            {canManagePages && (
              <div className="flex flex-wrap justify-center gap-3">
                <Button onClick={() => handleSeed(false)} variant="outline" className="border-green-600 text-green-600 hover:bg-green-50">
                  Add standard pages (Home, About, Contact, FAQ + policy pages)
                </Button>
                <Button asChild className="bg-red-600 hover:bg-red-700">
                  <Link to="/pages/new">
                    <FaPlus className="w-4 h-4 mr-2" />
                    Create Page
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Blocks</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((page, idx) => (
                    <TableRow key={getPageId(page) || `page-${idx}`}>
                      <TableCell>
                        <div className="font-medium">{page.title}</div>
                        {page.description && (
                          <div className="text-xs text-muted-foreground mt-1">{page.description}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-mono text-muted-foreground">/{page.slug}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border-none">
                          {page.pageType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{page.template || 'default'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {(Array.isArray(page.contentBlocks) ? page.contentBlocks : []).filter((b: any) => b?.enabled !== false).length} blocks
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {canManagePages ? (
                            <>
                              <Button
                                variant={page.isActive ? "default" : "secondary"}
                                size="sm"
                                onClick={() => toggleActive(page)}
                                className={page.isActive ? "h-6 text-[10px] px-2 bg-green-600 hover:bg-green-700" : "h-6 text-[10px] px-2"}
                                title={page.isActive ? 'Active' : 'Inactive'}
                              >
                                {page.isActive ? 'Active' : 'Inactive'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-primary"
                                onClick={() => toggleVisible(page)}
                                title={page.isVisible ? 'Visible' : 'Hidden'}
                              >
                                {page.isVisible ? <FaEye className="h-3 w-3" /> : <FaEyeSlash className="h-3 w-3" />}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Badge variant={page.isActive ? "default" : "secondary"} className={page.isActive ? "h-6 text-[10px] px-2 bg-green-600" : "h-6 text-[10px] px-2"}>
                                {page.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                              {page.isVisible ? <FaEye className="h-3 w-3 text-muted-foreground" /> : <FaEyeSlash className="h-3 w-3 text-muted-foreground" />}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {getPageId(page) && canManagePages && (
                            <>
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              title="Edit"
                            >
                              <Link to={`/pages/${getPageId(page)}/edit`}>
                                <FaEdit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-violet-600"
                              title="Visual Builder (drag & drop)"
                            >
                              <Link to={`/pages/${getPageId(page)}/builder`}>
                                <FaMagic className="h-4 w-4" />
                              </Link>
                            </Button>
                            </>
                          )}
                          {canDeletePages && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => getPageId(page) && handleDelete(getPageId(page), page.title)}
                              disabled={!getPageId(page)}
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete"
                            >
                              <FaTrash className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Pages;

