import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, Smartphone, Undo2 } from 'lucide-react';
import { Btn, Page, PageHeader, TabBar } from '@/components/erp';
import { useTabParam } from '@/components/messaging/common';
import { ErrorNote, Loading, Notice, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { getAppConfig, getAppSettings, pruneBlank, putAppSettings, type AppDoc } from '@/lib/v2/appSettings';
import {
  BannersSection, BrandSection, LegalSection, SupportSection, SwitchesSection, VersionsSection, setIn, type Path,
} from '@/components/app/appDocForms';
import HiddenCategories from '@/components/app/HiddenCategories';
import SlipSettings from '@/components/app/SlipSettings';

/**
 * APP SETTINGS (HMAPP design 60, AD08): the store's mobile app. One document per organisation, held
 * by the operating store (`GET/PUT /api/v2/commerce/app/settings`), checked whole by the server; the
 * hidden categories and slip settings are their own store settings with their own save.
 *
 * Read `settings.read`; save `settings.manage` and a person signed in (the server refuses a key or an
 * agent). Not on the live server until the app routes are switched on: the page says so.
 */
const TABS = [
  { key: 'general', label: 'Versions and links' },
  { key: 'switches', label: 'Switches' },
  { key: 'banners', label: 'Banners' },
  { key: 'support', label: 'Support and sign in' },
  { key: 'brand', label: 'Look and prices' },
  { key: 'legal', label: 'Legal and privacy' },
  { key: 'categories', label: 'Hidden categories' },
  { key: 'slips', label: 'Doctor\'s slips' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const DOC_TABS: TabKey[] = ['general', 'switches', 'banners', 'support', 'brand', 'legal'];

const AppSettings: React.FC = () => {
  const { hasPerm } = useAuth();
  const canSave = hasPerm('settings.manage');
  const [tab, setTab] = useTabParam<TabKey>(TABS.map((t) => t.key), 'general');
  const stored = useLoad(getAppSettings, []);
  const config = useLoad(getAppConfig, []);
  const [doc, setDoc] = useState<AppDoc>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (stored.data) { setDoc(stored.data.settings ?? {}); setDirty(false); }
  }, [stored.data]);

  const set = (path: Path, value: unknown) => { setDoc((d) => setIn(d, path, value)); setDirty(true); setSaved(false); };

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const res = await putAppSettings(pruneBlank(doc));
      setDoc(res?.settings ?? doc); setDirty(false); setSaved(true);
      void config.reload();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const off = whyDisabled(canSave, [!dirty && 'Nothing has changed.']);
  const storeSections = Object.keys(doc.stores ?? {});
  const props = { doc, set, disabled: !canSave, config: config.data };

  return (
    <Page>
      <PageHeader
        icon={Smartphone}
        title="Mobile app"
        description="Versions, switches, banners, support, sign in, look, legal pages and privacy for the store's app."
        actions={<Link to="/settings/app/audience" className="text-sm text-blue-700 underline">Who are you and interests</Link>}
      />
      {stored.loading && !stored.data ? <Loading label="Reading the app settings" /> : stored.error ? (
        <ErrorNote error={stored.error} what="The mobile app settings" onRetry={() => void stored.reload()} />
      ) : (
        <>
          {stored.data?.problem && (
            <Notice tone="bad" title="The saved settings are not in force">
              <p>{stored.data.problem}</p>
              <p>Fix the field named and save again; until then the app reads as not set up.</p>
            </Notice>
          )}
          {!stored.data?.settings && <Notice tone="info" title="No app set up yet">Fill in what you know and save. Every field is optional.</Notice>}
          {config.error ? <Notice tone="warn">The app config could not be read, so the switch names and the theme preview are missing.</Notice> : null}
          {storeSections.length > 0 && (
            <Notice tone="info">
              Sections of these stores are kept as they are: {storeSections.join(', ')}. Edit them where the country store is set up.
            </Notice>
          )}

          <TabBar tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />

          {tab === 'general' && <VersionsSection {...props} />}
          {tab === 'switches' && <SwitchesSection {...props} />}
          {tab === 'banners' && <BannersSection {...props} />}
          {tab === 'support' && <SupportSection {...props} />}
          {tab === 'brand' && <BrandSection {...props} />}
          {tab === 'legal' && <LegalSection {...props} />}
          {tab === 'categories' && <HiddenCategories canSave={canSave} />}
          {tab === 'slips' && <SlipSettings canSave={canSave} />}

          {DOC_TABS.includes(tab) && (
            <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-white/95 px-1 py-3 backdrop-blur">
              <Btn onClick={() => void save()} disabled={!!off || busy} title={off ?? undefined}><Save className="h-4 w-4" />{busy ? 'Saving' : 'Save app settings'}</Btn>
              <Btn variant="ghost" disabled={!dirty || busy} onClick={() => { setDoc(stored.data?.settings ?? {}); setDirty(false); setError(null); }}>
                <Undo2 className="h-4 w-4" />Undo changes
              </Btn>
              {dirty && <span className="text-xs text-amber-700">Unsaved changes on these tabs.</span>}
              {saved && <span className="text-sm text-emerald-700" role="status">Saved. The app reads it on its next start.</span>}
              {!canSave && <span className="text-xs text-gray-500">{off}</span>}
            </div>
          )}
          {error ? <ErrorNote error={error} /> : null}
        </>
      )}
    </Page>
  );
};

export default AppSettings;
