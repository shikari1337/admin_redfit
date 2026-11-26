import { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { errorText } from '../../services/api';
import { fmtRupees } from '../../lib/money';
import { formatDateTime } from '../../utils/date';
import { googleMerchantShippingV2 } from '../../lib/v2/areas/marketing';
import { useInView } from '../panelAnalytics/useInView';

/**
 * Google Merchant Center shipping (growcord-rs SHIP-MC-1, owner 25 Nov 2026: "make sure our SERP and ads show like free
 * shipping above 499 or other condition based on location"): what Google will show for each region, what Google has
 * now, and "Update Google". Asked for only once the card scrolls into view, since the preview reads Google.
 */

/** A charge band: `fee` rupees ('none': no delivery; null: not a flat rate) for an order below `upTo` rupees (null: no limit). */
interface Band { upTo: number | null; fee: number | 'none' | null }
interface RegionRow { name: string; places: string[]; bands: Band[] }

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const snakeKey = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
/** A field by its camelCase name or its snake_case twin (Google answers camelCase, v2 views snake_case). */
const g = (o: unknown, k: string): any => (isObj(o) ? o[k] ?? o[snakeKey(k)] : undefined);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Rupees from a plain number, a Google Price (`amountMicros`, -1 meaning no limit) or `{value}`; null for no limit. */
function rupeesOf(p: unknown): number | null {
  if (!isObj(p)) return num(p);
  const micros = g(p, 'amountMicros');
  if (micros !== undefined) {
    const m = num(micros);
    return m === null || m < 0 ? null : m / 1e6;
  }
  return num(p.value);
}

const rs = (n: number) => fmtRupees(n).replace(/\.00$/, '');

/** "₹50 under ₹499, free from ₹499" */
function bandsText(bands: Band[]): string {
  if (!bands.length) return 'No charge given';
  // Neighbouring bands with the same charge read as one (a rate table shares its price rows across every region).
  const merged = bands.reduce<Band[]>((out, b) => {
    const last = out[out.length - 1];
    if (last && last.fee === b.fee) last.upTo = b.upTo;
    else out.push({ ...b });
    return out;
  }, []);
  let from = 0;
  const parts = merged.map(({ upTo, fee }) => {
    const charge = fee === 'none' ? 'no delivery' : fee === null ? 'another rate' : fee === 0 ? 'free' : rs(fee);
    const text = from > 0 ? `${charge} from ${rs(from)}`
      : upTo !== null ? `${charge} under ${rs(upTo)}`
      : typeof fee === 'number' && fee > 0 ? `${charge} on every order` : charge;
    if (upTo !== null) from = upTo;
    return text;
  });
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function countryName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { return code; }
}

function regionName(r: Obj): string {
  const name = typeof r.name === 'string' ? r.name : '';
  return g(r, 'displayName') || (name && !name.startsWith('accounts/') ? name : '') || g(r, 'regionId') || name.split('/').pop() || 'Region';
}

/** The states a region covers (ISO codes shown without the country part), or its pincode ranges counted. */
function placesOf(r: Obj): string[] {
  const codes = g(r, 'regionCodes') ?? g(r, 'states');
  if (Array.isArray(codes)) return codes.map((c) => String(c).replace(/^[A-Z]{2}-/, ''));
  const pins = arr(g(g(r, 'postalCodeArea'), 'postalCodes'));
  return pins.length ? [`${pins.length} pincode range${pins.length === 1 ? '' : 's'}`] : [];
}

function bandsOf(raw: unknown): Band[] {
  return arr(raw).flatMap((b): Band[] => {
    const fee = rupeesOf(g(b, 'fee'));
    if (!isObj(b) || fee === null) return [];
    const upTo = g(b, 'upTo');
    return [{ upTo: upTo === null || upTo === undefined ? null : rupeesOf(upTo), fee }];
  }).sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
}

function cellFee(v: unknown): Band['fee'] {
  if (g(v, 'noShipping') === true) return 'none';
  const flat = g(v, 'flatRate');
  return flat === undefined ? null : rupeesOf(flat) ?? null;
}

/** Each column of a Merchant Center rate table by name: postal code groups or location sets, named from `regions`. */
function columnNames(headers: unknown, regions: Obj[], fallback: string): string[] {
  const named = (id: unknown) => {
    const key = String(id);
    if (key === 'all other locations') return 'Everywhere else';
    const r = regions.find((x) => [g(x, 'regionId'), x.name, String(x.name ?? '').split('/').pop()].includes(key));
    return r ? regionName(r) : key;
  };
  const groups = arr(g(headers, 'postalCodeGroupNames'));
  if (groups.length) return groups.map(named);
  const sets = arr(g(headers, 'locations'));
  if (sets.length) return sets.map((s) => arr(g(s, 'locationIds')).map(named).join(', '));
  return [fallback];
}

/** A Merchant Center service's rates as rows: one per column of each rate group's table (price bands down the rows). */
function serviceRows(service: unknown, regions: Obj[]): RegionRow[] {
  return arr(Array.isArray(service) ? service : [service]).filter(isObj).flatMap((svc) => {
    const where = arr(g(svc, 'deliveryCountries')).map(String).map(countryName).join(', ') || 'Everywhere';
    return arr(g(svc, 'rateGroups')).filter(isObj).flatMap((rg): RegionRow[] => {
      const single = g(rg, 'singleValue');
      if (isObj(single)) return [{ name: where, places: [], bands: [{ upTo: null, fee: cellFee(single) }] }];
      const table = g(rg, 'mainTable');
      if (!isObj(table)) return [];
      const prices = arr(g(g(table, 'rowHeaders'), 'prices'));
      const rows = arr(g(table, 'rows'));
      return columnNames(g(table, 'columnHeaders'), regions, where).map((name, j) => ({
        name,
        places: [],
        // Google's price headers are inclusive upper bounds (Rs 498.99); the band reads from the next paisa (under Rs 499).
        bands: prices.map((p, i) => {
          const bound = rupeesOf(p);
          return { upTo: bound === null ? null : Math.round((bound + 0.01) * 100) / 100, fee: cellFee(arr(g(rows[i], 'cells'))[j]) };
        }),
      }));
    });
  });
}

/**
 * What Google will show per zone: the preview's zones with their bands (growcord-rs SHIP-MC-1 `zones`), else regions
 * that carry bands, else read off the service's rate table.
 */
function previewRows(preview: Obj | null): RegionRow[] {
  const zones = arr(g(preview, 'zones')).filter((z) => isObj(z) && Array.isArray(g(z, 'bands')));
  if (zones.length) return zones.map((z) => ({ name: regionName(z), places: placesOf(z), bands: bandsOf(g(z, 'bands')) }));
  const regions = arr(g(preview, 'regions')).filter(isObj);
  if (regions.some((r) => Array.isArray(g(r, 'bands')))) {
    return regions.map((r) => ({ name: regionName(r), places: placesOf(r), bands: bandsOf(g(r, 'bands')) }));
  }
  const fromTable = serviceRows(g(preview, 'service'), regions);
  return fromTable.length ? fromTable : regions.map((r) => ({ name: regionName(r), places: placesOf(r), bands: [] }));
}

function placesText(places: string[]): string {
  const shown = places.slice(0, 6).join(', ');
  return places.length > 6 ? `${shown}, and ${places.length - 6} more` : shown;
}

export default function GoogleShippingCard({ canManage }: { canManage: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [preview, setPreview] = useState<Obj | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await googleMerchantShippingV2.preview();
      setPreview(isObj(r) ? r : null);
    } catch (e) {
      setLoadError(errorText(e, 'Could not read the Google shipping settings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (inView) void load(); }, [inView, load]);

  const update = async () => {
    setSyncing(true);
    setSyncError(null);
    setSynced(null);
    try {
      const r = await googleMerchantShippingV2.sync();
      const at = g(r, 'updatedAt') ?? g(r, 'syncedAt') ?? new Date().toISOString();
      setSynced(`Google updated ${formatDateTime(at)}.`);
      await load();
    } catch (e) {
      setSyncError(errorText(e, 'Google did not accept the update.'));
    } finally {
      setSyncing(false);
    }
  };

  const rows = previewRows(preview);
  // What the preview says to check before updating (a PIN prefix two states share, a state not found, a default used).
  const warnings = arr(g(preview, 'warnings')).filter((w): w is string => typeof w === 'string' && !!w.trim());
  const regions = arr(g(preview, 'regions')).filter(isObj);
  const current = g(preview, 'current');
  const services = arr(g(current, 'services')).filter(isObj);

  return (
    <Card ref={ref}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <Globe className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <CardTitle>Google Merchant Center shipping</CardTitle>
            <CardDescription>The delivery charge Google shows shoppers in Search and Shopping ads, by state. Built from the zones above.</CardDescription>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || syncing} aria-label="Check again">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{loadError}</div>
        )}

        {loading && !preview ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : preview && (
          <>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">What Google will show</h4>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No zone has a charge for Google yet. Add rates to the zones above.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Region</TableHead><TableHead>Delivery charge</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={`${r.name}-${i}`}>
                        <TableCell className="align-top">
                          <div className="font-medium">{r.name}</div>
                          {r.places.length > 0 && <div className="text-xs text-muted-foreground">{placesText(r.places)}</div>}
                        </TableCell>
                        <TableCell className="align-top">{bandsText(r.bands)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {warnings.length > 0 && (
              <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-medium">Check before updating</p>
                <ul className="list-disc space-y-0.5 pl-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}

            <div className="space-y-1.5">
              <h4 className="text-sm font-medium">What Google has now</h4>
              {services.length === 0 ? (
                <p className="text-sm text-muted-foreground">Google has no shipping settings for this store yet.</p>
              ) : services.map((svc, i) => {
                const time = g(svc, 'deliveryTime');
                const min = num(g(time, 'minTransitDays'));
                const max = num(g(time, 'maxTransitDays'));
                const days = min !== null && max !== null ? `, delivery in ${min} to ${max} days` : '';
                return (
                  <div key={i} className="text-sm">
                    <div>
                      <span className="font-medium">{g(svc, 'serviceName') || 'Shipping service'}</span>
                      <span className="text-muted-foreground">{g(svc, 'active') === false ? ' (off)' : ''}{days}</span>
                    </div>
                    <ul className="text-muted-foreground">
                      {serviceRows(svc, regions).map((r, j) => <li key={j}>{r.name}: {bandsText(r.bands)}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          {canManage ? (
            <Button size="sm" onClick={() => void update()} disabled={syncing || loading || !rows.length}>
              {syncing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Update Google
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Only staff who manage sales channels can update Google.</span>
          )}
          {synced && <span className="text-sm text-green-700">{synced}</span>}
          {syncError && <span className="text-sm text-destructive">{syncError}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
