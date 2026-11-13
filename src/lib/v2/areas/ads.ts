/**
 * The Ad accounts page's Google Ads calls (lane MENU-1 ads), straight on the v2 routes: conversion tracking
 * (marketing ROUTE_MAP 5.6, `GET /ads/google/measurement`, `POST /ads/google/reconcile`) and the live Google Ads
 * campaigns with a person's status and budget change (ROUTE_MAP 8.2, `/google/ads/*`). The boundary turns every
 * Money into a major-unit number; a Google block names its `currency`.
 */
import { v2call } from '../http';
import { toMoney } from '../money';

const MK = '/api/v2/marketing';
const seg = (v: string) => encodeURIComponent(v);

/** Where the store's Google Ads conversion tracking stands (`GoogleMeasurementView`, marketing views/ads.rs). */
export interface GoogleMeasurement {
  /** Google Ads is connected with a customer picked and a developer token. */
  connected: boolean;
  /** Why it is not usable, in the connection's own words. */
  note: string | null;
  /** The managed conversion actions are set up and their tag is on the website. */
  managed: boolean;
  /** `AW-...`, the tag the storefront loads. */
  conversion_id: string | null;
  /** Store events that report to Google Ads, and those that have no action yet. */
  events: string[];
  missing_events: string[];
  /** The connection names a server purchase action (confirmed orders are uploaded). */
  server_action: boolean;
  /** How many actions the last setup created on the account. */
  created: number;
}

/** One live Google Ads campaign over the window (google/ads.rs `campaigns`). */
export interface GoogleCampaign {
  id: string;
  name: string;
  status: string;
  channel_type: string | null;
  daily_budget: number;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
}

export interface GoogleCampaigns { currency: string; rows: GoogleCampaign[] }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const measurementOf = (d: any): GoogleMeasurement => ({
  connected: !!d?.connected,
  note: d?.note ?? null,
  managed: !!d?.managed,
  conversion_id: d?.conversion_id ?? null,
  events: strings(d?.events),
  missing_events: strings(d?.missing_events),
  server_action: !!d?.server_action,
  created: n(d?.created),
});

const campaignOf = (r: any): GoogleCampaign => ({
  id: String(r?.id ?? ''),
  name: String(r?.name ?? ''),
  status: String(r?.status ?? ''),
  channel_type: r?.channel_type ?? null,
  daily_budget: n(r?.daily_budget),
  impressions: n(r?.impressions),
  clicks: n(r?.clicks),
  spend: n(r?.spend),
  conversions: n(r?.conversions),
  revenue: n(r?.revenue),
});

export const adsGoogleApi = {
  /** Reads the `tracking` setting and the connection; asks nothing of Google. */
  measurement: async (): Promise<GoogleMeasurement> => measurementOf(await v2call('GET', `${MK}/ads/google/measurement`)),
  /** A person's click: creates the missing conversion actions on the account and puts their tag on the website. */
  setUpMeasurement: async (): Promise<GoogleMeasurement> =>
    measurementOf(await v2call('POST', `${MK}/ads/google/reconcile`, { data: {} })),
  /** The live campaigns over the last 7 or 30 days. */
  campaigns: async (days: 7 | 30): Promise<GoogleCampaigns> => {
    const d = await v2call<any>('GET', `${MK}/google/ads/campaigns`, { params: { days } });
    return { currency: String(d?.currency || 'INR'), rows: Array.isArray(d?.data) ? d.data.map(campaignOf) : [] };
  },
  /** Resume or pause, by a person. */
  setStatus: (id: string, status: 'ENABLED' | 'PAUSED') =>
    v2call('POST', `${MK}/google/ads/campaigns/${seg(id)}/status`, { data: { status } }),
  /** A person's daily budget, in major units of `currency`. */
  setBudget: (id: string, dailyMajor: number, currency: string) =>
    v2call('POST', `${MK}/google/ads/campaigns/${seg(id)}/budget`, { data: { daily_budget: toMoney(dailyMajor, currency) } }),
};
