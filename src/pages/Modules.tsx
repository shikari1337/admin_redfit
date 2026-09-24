import { useState, useEffect } from 'react';
import { modulesAPI } from '../services/api';

interface Module {
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  default?: boolean;
  category?: string;
}

interface RegistryModule {
  name: string;
  description?: string;
  default: boolean;
  category?: string;
}

interface StoreType {
  key: string;
  label: string;
  description: string;
  icon: string;
  vertical: string;
  highlights: string[];
  modules: Record<string, boolean>;
}

const CATEGORY_LABELS: Record<string, string> = {
  core:        'Core',
  commerce:    'Commerce',
  engagement:  'Engagement',
  marketing:   'Marketing',
  insights:    'Insights & Analytics',
  ai:          'AI & Automation',
  advanced:    'Advanced',
  operations:  'Operations',
  catalog:     'Catalog',
};

export default function Modules() {
  const [modules, setModules] = useState<Module[]>([]);
  const [registry, setRegistry] = useState<Record<string, RegistryModule>>({});
  const [storeTypes, setStoreTypes] = useState<StoreType[]>([]);
  const [applyingType, setApplyingType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [modulesRes, registryRes, typesRes] = await Promise.all([
        modulesAPI.list(),
        modulesAPI.getRegistry(),
        modulesAPI.storeTypes().catch(() => null),
      ]);
      const modulesList = Array.isArray(modulesRes) ? modulesRes : modulesRes?.modules ?? [];
      const registryData = registryRes?.registry ?? registryRes ?? {};
      const typesList = Array.isArray(typesRes) ? typesRes : typesRes?.data ?? [];
      setModules(modulesList);
      setRegistry(registryData);
      setStoreTypes(typesList);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyStoreType = async (t: StoreType) => {
    const enabledCount = Object.values(t.modules).filter(Boolean).length;
    if (!window.confirm(
      `Apply the "${t.label}" store type?\n\nThis replaces your current module setup with this type's recommended features (${enabledCount} modules on) and sets the product compliance vertical. You can fine-tune individual modules afterwards.`
    )) return;
    try {
      setApplyingType(t.key);
      setError(null);
      await modulesAPI.applyStoreType(t.key);
      setSuccess(`Applied "${t.label}" store type. Reload any open product form to see the fields update.`);
      setTimeout(() => setSuccess(null), 5000);
      await loadData();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.response?.data?.error?.message || err?.message || 'Failed to apply store type');
    } finally {
      setApplyingType(null);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    try {
      setSaving(key);
      setError(null);
      await modulesAPI.toggle(key, !currentEnabled);
      setModules(prev =>
        prev.map(m => (m.key === key ? { ...m, enabled: !currentEnabled } : m))
      );
      setSuccess(`Module ${!currentEnabled ? 'enabled' : 'disabled'} successfully.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to update module');
    } finally {
      setSaving(null);
    }
  };

  const handleInitialize = async () => {
    try {
      setInitLoading(true);
      setError(null);
      await modulesAPI.initialize();
      setSuccess('Modules initialized with defaults.');
      setTimeout(() => setSuccess(null), 3000);
      loadData();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to initialize modules');
    } finally {
      setInitLoading(false);
    }
  };

  // Group modules by category
  const grouped = modules.reduce<Record<string, Module[]>>((acc, mod) => {
    const cat = mod.category ?? registry[mod.key]?.category ?? 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mod);
    return acc;
  }, {});

  const enabledCount = modules.filter(m => m.enabled).length;

  return (
    <div className="modules-page">
      <div className="page-header">
        <div>
          <h1>Store Modules</h1>
          <p className="page-subtitle">
            Enable or disable features for your store. Changes take effect immediately.
          </p>
        </div>
        <div className="header-actions">
          <span className="module-count">{enabledCount}/{modules.length} active</span>
          <button
            className="btn btn-secondary"
            onClick={handleInitialize}
            disabled={initLoading}
          >
            {initLoading ? 'Initializing…' : 'Reset to Defaults'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <span>{success}</span>
        </div>
      )}

      {/* ── Store-type templates ── */}
      {!loading && storeTypes.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Start from a store type</h2>
            <p className="page-subtitle" style={{ margin: '2px 0 0' }}>
              Pick the kind of store you run to enable a sensible bundle of features and product
              fields (e.g. Fashion turns on size charts &amp; wash-care; SaaS turns off shipping).
              Every module stays toggleable below.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {storeTypes.map(t => {
              const onCount = Object.values(t.modules).filter(Boolean).length;
              return (
                <div key={t.key} style={{
                  border: '1px solid var(--n-200)', borderRadius: 10, padding: 14, background: 'var(--surface)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{t.label}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--n-500)', margin: 0, minHeight: 32 }}>{t.description}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {t.highlights.slice(0, 4).map(h => (
                      <span key={h} style={{
                        fontSize: 10.5, color: 'var(--n-700)', background: 'var(--n-100)',
                        borderRadius: 999, padding: '2px 8px',
                      }}>{h}</span>
                    ))}
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ marginTop: 'auto', fontSize: 12.5 }}
                    onClick={() => handleApplyStoreType(t)}
                    disabled={applyingType !== null}
                  >
                    {applyingType === t.key ? 'Applying…' : `Apply (${onCount} features)`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading modules…</p>
        </div>
      ) : modules.length === 0 ? (
        <div className="empty-state">
          <p>No modules found.</p>
          <button className="btn btn-primary" onClick={handleInitialize} disabled={initLoading}>
            {initLoading ? 'Initializing…' : 'Initialize Modules'}
          </button>
        </div>
      ) : (
        <div className="modules-grid">
          {Object.entries(grouped).map(([category, mods]) => (
            <div key={category} className="module-category">
              <h2 className="category-title">
                {CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)}
              </h2>
              <div className="module-cards">
                {mods.map(mod => {
                  const reg = registry[mod.key];
                  return (
                    <div key={mod.key} className={`module-card ${mod.enabled ? 'enabled' : 'disabled'}`}>
                      <div className="module-info">
                        <div className="module-name-row">
                          <span className="module-name">{reg?.name ?? mod.name ?? mod.key}</span>
                          {reg?.default && (
                            <span className="badge badge-default">Default</span>
                          )}
                        </div>
                        {(reg?.description ?? mod.description) && (
                          <p className="module-description">{reg?.description ?? mod.description}</p>
                        )}
                        <code className="module-key">{mod.key}</code>
                      </div>
                      <div className="module-toggle">
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={mod.enabled}
                            disabled={saving === mod.key}
                            onChange={() => handleToggle(mod.key, mod.enabled)}
                          />
                          <span className="toggle-slider" />
                        </label>
                        <span className="toggle-label">
                          {saving === mod.key ? 'Saving…' : mod.enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .modules-page { padding: 24px; max-width: 1100px; margin: 0 auto; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
        .page-header h1 { margin: 0 0 4px; font-size: 1.6rem; }
        .page-subtitle { margin: 0; color: var(--n-500); font-size: 0.9rem; }
        .header-actions { display: flex; align-items: center; gap: 12px; }
        .module-count { font-size: 0.85rem; color: var(--n-400); background: var(--n-100); padding: 4px 12px; border-radius: 999px; }
        .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.875rem; transition: background 0.15s; }
        .btn-primary { background: var(--accent); color: var(--surface); }
        .btn-primary:hover { background: var(--b-700); }
        .btn-secondary { background: var(--n-100); color: var(--n-700); border: 1px solid var(--n-300); }
        .btn-secondary:hover { background: var(--n-200); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .alert { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.875rem; }
        .alert-error { background: var(--d-50); border: 1px solid var(--d-300); color: var(--d-600); }
        .alert-success { background: var(--g-50); border: 1px solid var(--g-300); color: var(--g-600); }
        .alert button { background: none; border: none; cursor: pointer; font-size: 1rem; color: inherit; padding: 0 4px; }
        .loading-state, .empty-state { text-align: center; padding: 60px 20px; color: var(--n-500); }
        .spinner { width: 32px; height: 32px; border: 3px solid var(--n-200); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 12px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .modules-grid { display: flex; flex-direction: column; gap: 32px; }
        .module-category {}
        .category-title { font-size: 1rem; font-weight: 600; color: var(--n-700); margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--n-200); }
        .module-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
        .module-card { background: var(--surface); border: 1px solid var(--n-200); border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; transition: border-color 0.15s, box-shadow 0.15s; }
        .module-card.enabled { border-color: var(--b-300); box-shadow: var(--shadow-1); }
        .module-card.disabled { opacity: 0.7; }
        .module-info { flex: 1; min-width: 0; }
        .module-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .module-name { font-weight: 600; font-size: 0.9rem; color: var(--n-900); }
        .badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 999px; }
        .badge-default { background: var(--i-100); color: var(--i-700); }
        .module-description { font-size: 0.8rem; color: var(--n-500); margin: 4px 0 8px; line-height: 1.4; }
        .module-key { font-size: 0.7rem; background: var(--n-100); padding: 2px 6px; border-radius: 4px; color: var(--n-500); }
        .module-toggle { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
        .toggle-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; inset: 0; background: var(--n-300); border-radius: 24px; transition: 0.2s; }
        .toggle-slider::before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: var(--surface); border-radius: 50%; transition: 0.2s; }
        .toggle-switch input:checked + .toggle-slider { background: var(--accent); }
        .toggle-switch input:checked + .toggle-slider::before { transform: translateX(20px); }
        .toggle-switch input:disabled + .toggle-slider { opacity: 0.5; cursor: not-allowed; }
        .toggle-label { font-size: 0.7rem; color: var(--n-500); }
      `}</style>
    </div>
  );
}
