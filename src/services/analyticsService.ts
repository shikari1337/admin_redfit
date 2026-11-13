import { api } from './api';

export type AnalyticsRange = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'custom';

export interface AnalyticsFilter {
    range?: AnalyticsRange;
    startDate?: Date;
    endDate?: Date;
    storeId?: string;
    limit?: number;
}

const buildParams = (range?: AnalyticsRange, startDate?: Date, endDate?: Date): URLSearchParams => {
    const params = new URLSearchParams();
    if (range && range !== 'custom') {
        params.append('range', range);
    } else {
        if (startDate) params.append('startDate', startDate.toISOString());
        if (endDate) params.append('endDate', endDate.toISOString());
    }
    return params;
};

/** `GET /api/v2/insights/realtime/summary`: the last half hour as totals (no row cap). */
export interface LiveCount { name: string | null; value: number }
export interface LiveStage { key: string; label: string; sessions: number }
export interface LiveSummary {
    minutes: number;
    sessions: number;
    signed_in: number;
    events: number;
    stages: LiveStage[];
    devices: LiveCount[];
    pages: LiveCount[];
    places: LiveCount[];
}

/** One saved report of the team (`/api/v2/insights/reports`, tenant 510). */
export interface SavedReportConfig { dimension: string; preset?: string; from?: string; to?: string }
export interface SavedReport { id: string; name: string; kind: string; config: SavedReportConfig; saved_by?: string | null; saved_at?: string | null }
/** `ready` is false on a store whose database has no saved reports yet: keep the browser's list. */
export interface SavedReports { kind: string; ready: boolean; reports: SavedReport[] }

const asSavedReports = (res: any): SavedReports => {
    const d = res?.data?.data !== undefined ? res.data.data : res?.data;
    return { kind: d?.kind ?? 'custom', ready: !!d?.ready, reports: Array.isArray(d?.reports) ? d.reports : [] };
};

export const analyticsAPI = {
    /** The shop right now: active sessions, how far they got, devices, pages and places. */
    getRealtimeSummary: async (): Promise<LiveSummary> => {
        const response = await api.get('/analytics/realtime/summary');
        const d: any = response?.data?.data !== undefined ? response.data.data : response?.data;
        const list = (v: unknown) => (Array.isArray(v) ? v : []);
        return {
            minutes: Number(d?.minutes ?? 30),
            sessions: Number(d?.sessions ?? 0),
            signed_in: Number(d?.signed_in ?? 0),
            events: Number(d?.events ?? 0),
            stages: list(d?.stages),
            devices: list(d?.devices),
            pages: list(d?.pages),
            places: list(d?.places),
        };
    },

    /** The team's saved reports of a kind (custom by default). */
    listSavedReports: async (kind = 'custom'): Promise<SavedReports> =>
        asSavedReports(await api.get('/analytics/reports', { params: { kind } })),

    /** Save a report under a name; the same name replaces it. Answers the list. */
    saveReport: async (name: string, config: SavedReportConfig, kind = 'custom'): Promise<SavedReports> =>
        asSavedReports(await api.post('/analytics/reports', { kind, name, config })),

    /** Delete a saved report. Answers the list. */
    deleteSavedReport: async (id: string, kind = 'custom'): Promise<SavedReports> =>
        asSavedReports(await api.delete(`/analytics/reports/${encodeURIComponent(id)}`, { params: { kind } })),

    /** Marketing attribution: paid vs organic, by channel/campaign/device. */
    getMarketing: async (opts: { from?: string; to?: string; model?: 'first' | 'last' } = {}) => {
        const p = new URLSearchParams();
        if (opts.from) p.set('from', opts.from);
        if (opts.to) p.set('to', opts.to);
        if (opts.model) p.set('model', opts.model);
        const response = await api.get(`/attribution/analytics?${p.toString()}`);
        return response;
    },

    getDashboardStats: async (range?: AnalyticsRange, startDate?: Date, endDate?: Date) => {
        const params = buildParams(range, startDate, endDate);
        const response = await api.get(`/analytics/dashboard?${params.toString()}`);
        return response;
    },

    getLiveMap: async () => {
        const response = await api.get('/analytics/live/map');
        return response;
    },

    getDeviceStats: async (range?: AnalyticsRange, startDate?: Date, endDate?: Date) => {
        const params = buildParams(range, startDate, endDate);
        const response = await api.get(`/analytics/devices?${params.toString()}`);
        return response;
    },

    getRevenueStats: async (range?: AnalyticsRange, startDate?: Date, endDate?: Date) => {
        const params = buildParams(range, startDate, endDate);
        const response = await api.get(`/analytics/revenue?${params.toString()}`);
        return response;
    },

    getStoreKPIs: async (range?: AnalyticsRange, startDate?: Date, endDate?: Date) => {
        const params = buildParams(range, startDate, endDate);
        const response = await api.get(`/analytics/store-kpis?${params.toString()}`);
        return response;
    },

    getUserJourney: async (sessionId: string) => {
        const response = await api.get(`/analytics/user/journey/${sessionId}`);
        return response;
    },

    getRealtimeVisitors: async () => {
        const response = await api.get('/analytics/realtime/visitors');
        return response;
    },

    getFunnelStats: async (range?: AnalyticsRange, startDate?: Date, endDate?: Date) => {
        const params = buildParams(range, startDate, endDate);
        const response = await api.get(`/analytics/funnel?${params.toString()}`);
        return response;
    },

    getOrderStats: async (range?: AnalyticsRange, startDate?: Date, endDate?: Date) => {
        const params = buildParams(range, startDate, endDate);
        const response = await api.get(`/analytics/orders/stats?${params.toString()}`);
        return response;
    },

    getShipmentStats: async (range?: AnalyticsRange, startDate?: Date, endDate?: Date) => {
        const params = buildParams(range, startDate, endDate);
        const response = await api.get(`/analytics/shipments/stats?${params.toString()}`);
        return response;
    },

    getTopProducts: async (range?: AnalyticsRange, limit?: number) => {
        const params = new URLSearchParams();
        if (range) params.append('range', range);
        if (limit) params.append('limit', String(limit));
        const response = await api.get(`/analytics/top-products?${params.toString()}`);
        return response;
    },

    getTopCategories: async (range?: AnalyticsRange) => {
        const params = new URLSearchParams();
        if (range) params.append('range', range);
        const response = await api.get(`/analytics/top-categories?${params.toString()}`);
        return response;
    },

    getCustomerStats: async (range?: AnalyticsRange, startDate?: Date, endDate?: Date) => {
        const params = buildParams(range, startDate, endDate);
        const response = await api.get(`/analytics/customers?${params.toString()}`);
        return response;
    },
};
