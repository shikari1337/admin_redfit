import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, Plus, Trash2, RefreshCw, Copy, Check } from 'lucide-react';
import { seoAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Redirect { from: string; to: string; }

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline" size="sm"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
};

const Seo: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [robotsTxt, setRobotsTxt] = useState('');
  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');
  const [addingRedirect, setAddingRedirect] = useState(false);

  const [sitemapPreview, setSitemapPreview] = useState('');
  const [robotsPreview, setRobotsPreview] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([seoAPI.get(), seoAPI.getRedirects()]);
      setSettings(s || {});
      setRobotsTxt(s?.robotsTxt || '');
      setRedirects(Array.isArray(r) ? r : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load SEO settings');
    } finally {
      setLoading(false);
    }
  };

  const loadPreviews = async () => {
    setPreviewLoading(true);
    try {
      const [sitemap, robots] = await Promise.all([seoAPI.getSitemap(), seoAPI.getRobots()]);
      setSitemapPreview(sitemap);
      setRobotsPreview(robots);
    } catch {
      setSitemapPreview('Failed to load — try refreshing.');
      setRobotsPreview('Failed to load — try refreshing.');
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => { load(); loadPreviews(); }, []);

  const handleSaveRobots = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = { ...settings, robotsTxt };
      await seoAPI.update(next);
      setSettings(next);
      setSuccess('robots.txt override saved.');
      setTimeout(() => setSuccess(null), 3000);
      loadPreviews();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRedirect = async () => {
    const from = newFrom.trim();
    const to = newTo.trim();
    if (!from || !to) { setError('Both "From" and "To" are required.'); return; }
    setAddingRedirect(true);
    setError(null);
    try {
      await seoAPI.createRedirect({ from, to });
      setRedirects(prev => [...prev, { from, to }]);
      setNewFrom(''); setNewTo('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to add redirect');
    } finally {
      setAddingRedirect(false);
    }
  };

  const handleDeleteRedirect = async (from: string) => {
    if (!confirm(`Remove the redirect from "${from}"?`)) return;
    try {
      await seoAPI.deleteRedirect(from);
      setRedirects(prev => prev.filter(r => r.from !== from));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to remove redirect');
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="text-muted-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">SEO</h1>
        <p className="text-sm text-muted-foreground mt-1">
          URL redirects and the sitemap/robots.txt served to search engines.
        </p>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>
      )}

      {/* Redirects */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Redirects</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">From (old path)</Label>
              <Input value={newFrom} onChange={e => setNewFrom(e.target.value)} placeholder="/old-page" className="h-9" />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">To (new path or URL)</Label>
              <Input value={newTo} onChange={e => setNewTo(e.target.value)} placeholder="/new-page" className="h-9" />
            </div>
            <Button onClick={handleAddRedirect} disabled={addingRedirect} className="h-9">
              {addingRedirect ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Add
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow><TableHead>From</TableHead><TableHead>To</TableHead><TableHead className="w-10" /></TableRow>
            </TableHeader>
            <TableBody>
              {redirects.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="h-16 text-center text-muted-foreground">No redirects configured.</TableCell></TableRow>
              ) : redirects.map((r, i) => (
                <TableRow key={`${r.from}-${i}`}>
                  <TableCell className="font-mono text-sm">{r.from}</TableCell>
                  <TableCell className="font-mono text-sm">{r.to}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDeleteRedirect(r.from)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* robots.txt override */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">robots.txt override</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Leave empty to serve the default (allow everything + a link to the sitemap). Fill this in to replace it entirely.
          </p>
          <Textarea
            value={robotsTxt} onChange={e => setRobotsTxt(e.target.value)}
            placeholder={'User-agent: *\nAllow: /'}
            rows={5} className="font-mono text-sm"
          />
          <Button onClick={handleSaveRobots} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Live preview</CardTitle>
          <Button variant="outline" size="sm" onClick={loadPreviews} disabled={previewLoading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${previewLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">robots.txt</span>
              <CopyButton text={robotsPreview} />
            </div>
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">{robotsPreview || '—'}</pre>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">sitemap.xml</span>
              <CopyButton text={sitemapPreview} />
            </div>
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">{sitemapPreview || '—'}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Seo;
