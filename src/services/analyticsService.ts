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

export const analyticsAPI = {
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
