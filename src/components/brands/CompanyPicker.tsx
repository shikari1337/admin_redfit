import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Building2, Plus, X, Search, BadgeCheck } from 'lucide-react';
import { companiesAPI } from '../../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

/**
 * Pick the company behind a brand — or create it right here. (migration 165)
 *
 * Creating inline matters: the honest answer for most brands today is "we have
 * not recorded the owner", and a merchant who has to leave the brand form,
 * find a Companies page and come back will simply leave it blank forever. The
 * backend dedups on CIN → PAN → GSTIN → exact name, so typing a company that
 * already exists LINKS to it rather than making a second one, and says so.
 */

export interface CompanyLite {
  id: string;
  display_name: string;
  legal_name?: string | null;
  cin?: string | null;
  entity_type?: string | null;
  is_verified?: boolean;
  gstin?: string | null;
  roles?: string[];
}

export const ENTITY_TYPE_LABEL: Record<string, string> = {
  private_limited: 'Private Limited', public_limited: 'Public Limited', llp: 'LLP',
  partnership: 'Partnership', proprietorship: 'Proprietorship', opc: 'One Person Company',
  trust: 'Trust', society: 'Society', huf: 'HUF', government: 'Government',
  foreign: 'Foreign', other: 'Other',
};

export function CompanySummary({ company }: { company: CompanyLite }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium">{company.display_name}</span>
        {company.is_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
      </div>
      <div className="truncate text-[11px] text-muted-foreground">
        {[company.legal_name && company.legal_name !== company.display_name ? company.legal_name : null,
          company.entity_type ? ENTITY_TYPE_LABEL[company.entity_type] ?? company.entity_type : null,
          company.cin]
          .filter(Boolean).join(' · ') || 'No registration details recorded'}
      </div>
    </div>
  );
}

interface Props {
  label: string;
  hint?: string;
  value: string | null;
  /** Shown while the picker has not re-fetched — avoids a flash of "not set". */
  valueName?: string | null;
  onChange: (id: string | null, company?: CompanyLite) => void;
  /** Role stamped on a company created from here (brand_owner / manufacturer). */
  createRole?: string;
  disabled?: boolean;
}

export default function CompanyPicker({ label, hint, value, valueName, onChange, createRole, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompanyLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CompanyLite | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // Resolve the current value to a name once, so the field reads as a company
  // and not as a UUID when the form is first opened.
  useEffect(() => {
    let cancelled = false;
    if (!value) { setSelected(null); return; }
    if (selected?.id === value) return;
    if (valueName) { setSelected({ id: value, display_name: valueName }); }
    companiesAPI.get(value)
      .then((c) => { if (!cancelled && c?.id) setSelected(c); })
      .catch(() => { /* a deleted company leaves the id showing, not a crash */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, valueName]);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const rows = await companiesAPI.list({ search: q || undefined, limit: 20 });
      setResults(Array.isArray(rows) ? rows : []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => search(query), 220);
    return () => clearTimeout(t);
  }, [open, query, search]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (c: CompanyLite) => {
    setSelected(c); onChange(c.id, c); setOpen(false); setQuery(''); setNotice('');
  };

  const createFromQuery = async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true); setNotice('');
    try {
      const res = await companiesAPI.create({
        display_name: name,
        roles: createRole ? [createRole] : undefined,
      });
      const company = res?.data;
      if (company?.id) {
        pick(company);
        // Say which happened. Silently reusing a row the user thinks they just
        // made is how "duplicates" get blamed on the wrong thing.
        if (res.created === false) setNotice(`Linked to the existing "${company.display_name}"`);
      }
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'Could not create that company');
    } finally { setCreating(false); }
  };

  return (
    <div className="space-y-1.5" ref={boxRef}>
      <Label className="text-xs">{label}</Label>

      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CompanySummary company={selected} />
          </div>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0"
              onClick={() => { setSelected(null); onChange(null); }} title="Clear">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Search or type a company name…"
            value={query}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          />
        </div>
      )}

      {open && !selected && (
        <div className="relative">
          <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-background shadow-lg">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Searching…
              </div>
            ) : (
              <>
                {results.map((c) => (
                  <button key={c.id} type="button" onClick={() => pick(c)}
                    className="flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/60">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <CompanySummary company={c} />
                  </button>
                ))}
                {!results.length && (
                  <div className="px-3 py-3 text-sm text-muted-foreground">
                    {query.trim() ? 'No company matches that.' : 'No companies recorded yet.'}
                  </div>
                )}
                {query.trim() && (
                  <button type="button" onClick={createFromQuery} disabled={creating}
                    className="flex w-full items-center gap-2 border-t bg-muted/30 px-3 py-2 text-left text-sm hover:bg-muted/60">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add “{query.trim()}” as a company
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {notice && <p className="text-[11px] text-amber-600">{notice}</p>}
      {hint && !notice && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {!selected && !open && (
        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">Not recorded</Badge>
      )}
    </div>
  );
}
