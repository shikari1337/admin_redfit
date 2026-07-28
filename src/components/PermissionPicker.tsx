/**
 * Grants EXTRA permissions on top of a role.
 *
 * Replaces a picker that listed bare module names (`products`, `orders`,
 * `settings`) while the API checks `<area>.<action>`. Those strings never
 * matched anything, so 14 of its 16 toggles granted NOTHING — an admin who
 * ticked "Store Settings" for a staff member believed access had been granted
 * and it had not. The catalogue is now served by `GET /staff/permissions`, so
 * this list can never drift from what the API enforces.
 *
 * Permissions the ROLE already grants are shown ticked and disabled ("via
 * role") — grants are additive, so unticking one here would change nothing and
 * offering it would be a lie. To take access away, change the role.
 */
import React, { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react';
import { staffAPI } from '../services/api';

export interface ActionDef { action: string; key: string; label: string; desc: string; sensitive?: boolean }
export interface AreaDef { area: string; label: string; group: string; desc: string; actions: ActionDef[] }
export interface LegacyDef { key: string; label: string; desc: string }
export interface RoleDef { role: string; baseline: string[]; granted: string[] }

export interface Catalog { catalog: AreaDef[]; legacy: LegacyDef[]; roles: RoleDef[] }

let cache: Catalog | null = null;

/** Loads (and memoises) the catalogue for the session. */
export function usePermissionCatalog() {
  const [data, setData] = useState<Catalog | null>(cache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    staffAPI.getPermissionCatalog()
      .then((c: Catalog) => { if (alive) { cache = c; setData(c); } })
      .catch(() => { if (alive) setError('Could not load the permission list.'); });
    return () => { alive = false; };
  }, []);
  return { catalog: data, error };
}

/** Permissions the role grants by itself (expanded, incl. implied reads). */
export function baselineFor(catalog: Catalog | null, role: string): string[] {
  const r = catalog?.roles.find((x) => x.role === role);
  return r?.baseline ?? [];
}

interface Props {
  /** Extra grants stored on the user (additive on top of the role). */
  value: string[];
  onChange: (next: string[]) => void;
  /** The role selected for this user — drives the disabled "via role" ticks. */
  role: string;
}

const GROUP_TONE: Record<string, string> = {
  Catalog: 'bg-blue-50 text-blue-700 border-blue-200',
  Commerce: 'bg-green-50 text-green-700 border-green-200',
  Customers: 'bg-orange-50 text-orange-700 border-orange-200',
  Marketing: 'bg-purple-50 text-purple-700 border-purple-200',
  Operations: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Finance: 'bg-amber-50 text-amber-700 border-amber-200',
  Insights: 'bg-slate-100 text-slate-700 border-slate-300',
  System: 'bg-red-50 text-red-700 border-red-200',
};

export const PermissionPicker: React.FC<Props> = ({ value, onChange, role }) => {
  const { catalog, error } = usePermissionCatalog();
  const [open, setOpen] = useState<Record<string, boolean>>({ Catalog: true, Commerce: true });

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!catalog) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading permissions…
      </div>
    );
  }

  const baseline = baselineFor(catalog, role);
  const isAdminRole = baseline.includes('*');
  const viaRole = (key: string) => isAdminRole || baseline.includes(key);

  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((p) => p !== key) : [...value, key]);

  const groups = [...new Set(catalog.catalog.map((a) => a.group))];

  if (isAdminRole) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        The <strong>Administrator</strong> role already holds every permission. Extra grants have
        no effect — pick a narrower role to limit what this account can do.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        The role sets the baseline (ticked and locked below). Anything you tick here is granted
        <strong> in addition</strong>. To reduce access, change the role.
      </p>

      <div className="space-y-2 overflow-hidden rounded-md border">
        {groups.map((group) => {
          const areas = catalog.catalog.filter((a) => a.group === group);
          const expanded = open[group] !== false;
          const extras = areas.flatMap((a) => a.actions)
            .filter((x) => value.includes(x.key) && !viaRole(x.key)).length;

          return (
            <div key={group} className="border-b last:border-0">
              <div
                className="flex cursor-pointer items-center justify-between bg-muted/40 px-4 py-2.5 transition-colors hover:bg-muted/60"
                onClick={() => setOpen((p) => ({ ...p, [group]: !expanded }))}
              >
                <div className="flex items-center gap-2.5">
                  <Badge variant="outline" className={`border text-[11px] font-semibold ${GROUP_TONE[group] ?? ''}`}>
                    {group}
                  </Badge>
                  {extras > 0 && (
                    <span className="text-xs text-muted-foreground">+{extras} extra</span>
                  )}
                </div>
                {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>

              {expanded && (
                <div className="divide-y">
                  {areas.map((area) => (
                    <div key={area.area} className="px-4 py-3">
                      <p className="text-sm font-medium">{area.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{area.desc}</p>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                        {area.actions.map((a) => {
                          const locked = viaRole(a.key);
                          const checked = locked || value.includes(a.key);
                          return (
                            <label
                              key={a.key}
                              title={locked ? `Granted by the ${role} role` : a.desc}
                              className={`flex items-center gap-2 text-xs ${locked ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                            >
                              <Checkbox
                                checked={checked}
                                disabled={locked}
                                onCheckedChange={() => !locked && toggle(a.key)}
                                className="h-3.5 w-3.5"
                              />
                              <span className={a.sensitive && !locked ? 'font-medium text-red-700' : ''}>
                                {a.label}
                                {a.sensitive && <AlertTriangle className="ml-1 inline h-3 w-3 text-red-600" />}
                              </span>
                              {locked && <span className="text-[10px] text-muted-foreground">(via role)</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {catalog.legacy.length > 0 && (
          <div className="border-t bg-muted/20 px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground">Legacy grants</p>
            {catalog.legacy.map((m) => (
              <label key={m.key} className="mt-2 flex cursor-pointer items-start gap-2 text-xs">
                <Checkbox
                  checked={value.includes(m.key)}
                  onCheckedChange={() => toggle(m.key)}
                  className="mt-0.5 h-3.5 w-3.5"
                />
                <span>
                  <span className="font-medium">{m.label}</span>
                  <span className="ml-1 text-muted-foreground">{m.desc}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PermissionPicker;
