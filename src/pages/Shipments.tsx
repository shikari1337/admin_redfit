/**
 * Shipments Management Page
 * Manage shipments with pickup scheduling and AWB generation
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, shipmentsAPI, warehousesAPI, shippingAPI, errorText } from '../services/api';
import { FaSync, FaSpinner, FaLink, FaFileUpload } from 'react-icons/fa';
import { ShipmentTabs, ShipmentFilters, ShipmentTable, PendingOrdersTable, PickupModal, BulkActionsBar, ReconcileModal, ShipmentDetailDrawer, ActNow, NdrActionDialog } from '../components/shipments';
import type { TabType, StatusCounts, ReconcileResultData, NdrTarget } from '../components/shipments';
import { TAB_STATUS, TAB_TYPES } from '../components/shipments/ShipmentTabs';
import ShipmentCreationModal, { type ShipProviderId } from '../components/order/ShipmentCreationModal';
import PrintLabelsDialog from '../components/shipments/PrintLabelsDialog';
import { getStatusLabel } from '../components/order/StatusBadge';
import { isTerminal, providerLabel, providerOf, shipmentAwb, shipmentMatches } from '../components/shipments/shipmentFacts';
import { fmtRupees } from '@/lib/money';
import { NOT_TAKEN_TEXT, notTakenBookings, notTakenMatcher, type GsConsignment } from '@/lib/v2/growship';

interface ShipmentsProps {
  /**
   * One carrier's board (the Growcord Ship menu, owner 26 Nov 2026): the list, the charge totals, the tab counts and
   * the tiles are that carrier's only (owner 27 Nov 2026: "show accurate number for growship only not the overall";
   * every board read, the counts read on Pending Orders included, sends the carrier), and the carrier filter is fixed
   * to it. Pending Orders (To book) counts orders with nothing booked, which have no carrier yet, and says so. The
   * page is otherwise the same board.
   */
  fixedProvider?: 'growcord_ship';
  /** The page heading, when not "Shipments". */
  title?: string;
  /** One line under the heading. */
  intro?: React.ReactNode;
}

const Shipments: React.FC<ShipmentsProps> = ({ fixedProvider, title, intro }) => {
  const { hasPerm } = useAuth();
  const [shipments, setShipments] = useState<any[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // `?tab=` opens a tab (the Growcord Ship menu links straight to Failed Delivery); the tab in use is kept there.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: TabType = tabParam && (TAB_TYPES as string[]).includes(tabParam) ? (tabParam as TabType) : 'pending_orders';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  // The first read already asks for the tab's statuses, so a ?tab= link never shows another list first.
  const [statusFilter, setStatusFilter] = useState(TAB_STATUS[initialTab] ?? '');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>(fixedProvider ?? '');
  // Each read is numbered; an answer to an older read is dropped, so a slow reply never replaces a newer list.
  const fetchSeq = useRef(0);
  // Growcord Ship's board: bookings no courier took (refunded at once) read as such, never as live parcels.
  const [notTaken, setNotTaken] = useState<GsConsignment[]>([]);
  const notTakenAt = useRef(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<any | null>(null);
  const [selectedShipments, setSelectedShipments] = useState<string[]>([]);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [showBulkPickupModal, setShowBulkPickupModal] = useState(false);
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTimeSlot, setPickupTimeSlot] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [schedulingPickup, setSchedulingPickup] = useState(false);
  const [schedulingBulkPickup, setSchedulingBulkPickup] = useState(false);
  const [fetchingStatus, setFetchingStatus] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResultData | null>(null);
  const [detailShipmentId, setDetailShipmentId] = useState<string | null>(null);
  const [showCreateShipmentModal, setShowCreateShipmentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [creatingShipment, setCreatingShipment] = useState(false);
  // ShipmentCreationModal state
  const [selectedShippingProvider, setSelectedShippingProvider] = useState<ShipProviderId>('manual');
  // The carriers this store can actually book through (GET /shipping/providers): Growcord Ship when it is on, and
  // any own account. The modal used to get a fixed Delhivery + Shiprocket list whatever the store had connected.
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([]);
  const [providersKnown, setProvidersKnown] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [manualTrackingId, setManualTrackingId] = useState('');
  const [manualCarrierName, setManualCarrierName] = useState('');
  const [manualTrackingUrl, setManualTrackingUrl] = useState('');
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({
    pending_orders: 0,
    ready_to_pick: 0,
    pickup_scheduled: 0,
    in_transit: 0,
    ndr_failed_delivery: 0,
    delivered: 0,
    rto_in_transit: 0,
    rto_delivered: 0,
    rto_failed: 0,
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  // The shipping charges of every shipment the tab and filters match (the board's own sum, not this page's).
  const [chargeTotals, setChargeTotals] = useState<{ total: number | null; counted: number; unknown: number } | null>(null);
  const [openingOrder, setOpeningOrder] = useState<string | null>(null);
  // A failed delivery's answer picked on a row (the dialog asks what it needs and says whether the courier was told).
  const [ndrTarget, setNdrTarget] = useState<NdrTarget | null>(null);
  // The search box: what is typed, and what was applied after a short pause (sent to the board as `q`).
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  // True when the server refused `q` (a backend without board search): the loaded page is searched instead.
  const [searchLocal, setSearchLocal] = useState(false);

  useEffect(() => {
    fetchWarehouses();
    fetchProviders();
  }, []);

  useEffect(() => {
    const next = searchText.trim();
    if (next === query) return;
    const t = setTimeout(() => {
      setQuery(next);
      setSelectedShipments([]);
      setPagination((p) => ({ ...p, page: 1 }));
    }, 400);
    return () => clearTimeout(t);
  }, [searchText, query]);

  const fetchProviders = async () => {
    try {
      const res: any = await shippingAPI.getProviders();
      const rows: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      const list = rows
        .filter((p) => p && p.id && p.enabled !== false)
        .map((p) => ({ id: String(p.id), name: String(p.name || p.id) }));
      setProviders(list);
      setProvidersKnown(true);
      // Growcord Ship first (the one aggregator), else the first own account, else a manual entry.
      const first = list.find((p) => p.id === 'growcord_ship') ?? list.find((p) => p.id === 'shiprocket' || p.id === 'delhivery');
      setSelectedShippingProvider((first?.id as ShipProviderId) ?? 'manual');
    } catch {
      setProviders([]);
    }
  };
  const hasShiprocket = providers.some((p) => p.id === 'shiprocket');
  // Carrier names come from the store's own provider list; parcels entered by hand are "manual".
  const providerNames = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p.name])), [providers]);
  // A carrier's board names it where its To book number, which no carrier owns yet, is explained.
  const carrierName = fixedProvider ? providerLabel(fixedProvider, providerNames) : null;
  const filterProviders = useMemo(() => {
    const list = providers.map((p) => ({ id: p.id, name: p.name }));
    if (!list.some((p) => p.id === 'manual')) list.push({ id: 'manual', name: providerLabel('manual') });
    if (fixedProvider && !list.some((p) => p.id === fixedProvider)) list.unshift({ id: fixedProvider, name: providerLabel(fixedProvider) });
    return list;
  }, [providers, fixedProvider]);

  useEffect(() => {
    // Map tab to status filter (Pending Orders uses its own list).
    setStatusFilter(TAB_STATUS[activeTab] ?? '');
    setSelectedShipments([]);
    setPagination(prev => ({ ...prev, page: 1 }));
  }, [activeTab]);

  // A link that names a tab opens it, also when this board is already on screen; a link with no tab (the menu's
  // All shipments) goes back to the first tab.
  useEffect(() => {
    if (tabParam && (TAB_TYPES as string[]).includes(tabParam)) {
      if (tabParam !== activeTab) setActiveTab(tabParam as TabType);
    } else if (!tabParam && activeTab !== 'pending_orders') {
      setActiveTab('pending_orders');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);
  // The tab in use goes into the address (replacing it, no new history entry) once a tab other than the first is
  // opened, so a reload or a shared link lands on the same tab.
  useEffect(() => {
    if (activeTab === tabParam || (!tabParam && activeTab === 'pending_orders')) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', activeTab);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    fetchShipments();
  }, [statusFilter, warehouseFilter, providerFilter, startDate, endDate, pagination.page, query]);

  const fetchWarehouses = async () => {
    try {
      const response = await warehousesAPI.getAll();
      let warehousesData: any[] = [];
      if (Array.isArray(response)) {
        warehousesData = response;
      } else if (Array.isArray(response?.data)) {
        warehousesData = response.data;
      } else if (Array.isArray(response?.data?.data)) {
        warehousesData = response.data.data;
      }
      setWarehouses(warehousesData);
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
      setWarehouses([]);
    }
  };

  const fetchShipments = async () => {
    const seq = ++fetchSeq.current;
    const stale = () => seq !== fetchSeq.current;
    try {
      setLoading(true);
      setLoadError(null);

      if (activeTab === 'pending_orders') {
        const response = await shipmentsAPI.getPendingOrders({
          page: pagination.page,
          limit: pagination.limit,
        });
        if (stale()) return;
        console.log('[Shipments] getPendingOrders response:', response);
        let ordersData: any[] = [];
        if (Array.isArray(response)) {
          ordersData = response;
        } else if (Array.isArray(response?.orders)) {
          ordersData = response.orders;
        } else if (Array.isArray(response?.data?.orders)) {
          ordersData = response.data.orders;
        }
        setPendingOrders(Array.isArray(ordersData) ? ordersData : []);
        setChargeTotals(null);
        const pag = response?.pagination || response?.data?.pagination;
        if (pag) {
          setPagination(prev => ({ ...prev, ...pag }));
        }
        // Also fetch status counts from shipments endpoint (a carrier's board counts that carrier's parcels only).
        try {
          const countsResp = await shipmentsAPI.getAll(fixedProvider ? { page: 1, limit: 1, shippingProvider: fixedProvider } : { page: 1, limit: 1 });
          const counts = countsResp?.statusCounts || countsResp?.data?.statusCounts;
          if (counts && !stale()) {
            setStatusCounts(prev => ({ ...prev, ...counts }));
          }
        } catch {}
      } else {
        const params: any = {
          page: pagination.page,
          limit: pagination.limit,
        };
        if (activeTab === 'ready_to_pick') {
          params.tab = 'ready_to_pick';
        } else if (statusFilter) {
          params.status = statusFilter;
        }
        if (warehouseFilter) params.warehouseId = warehouseFilter;
        if (providerFilter) params.shippingProvider = providerFilter;
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (query) params.q = query;

        // The board searches when the server takes `q`; a server without board search refuses the unknown field
        // (400), so the board is read again without it and the page it returns is searched here instead.
        let local = false;
        let response: any;
        try {
          response = await shipmentsAPI.getAll(params);
        } catch (error: any) {
          if (!params.q || error?.response?.status !== 400) throw error;
          delete params.q;
          response = await shipmentsAPI.getAll(params);
          local = true;
        }
        if (stale()) return;
        setSearchLocal(local);
        let shipmentsData: any[] = [];
        if (Array.isArray(response)) {
          shipmentsData = response;
        } else if (Array.isArray(response?.shipments)) {
          shipmentsData = response.shipments;
        } else if (Array.isArray(response?.data)) {
          shipmentsData = response.data;
        } else if (Array.isArray(response?.data?.shipments)) {
          shipmentsData = response.data.shipments;
        }

        const rows = Array.isArray(shipmentsData) ? shipmentsData : [];
        setShipments(local ? rows.filter((s) => shipmentMatches(s, query)) : rows);
        const pag = response?.pagination || response?.data?.pagination;
        if (pag) {
          setPagination(prev => ({ ...prev, ...pag }));
        }
        const counts = response?.statusCounts || response?.data?.statusCounts;
        if (counts) {
          setStatusCounts(prev => ({ ...prev, ...counts }));
        }
        const ct = response?.chargeTotals;
        setChargeTotals(ct && typeof ct === 'object'
          ? { total: ct.total === null || ct.total === undefined ? null : Number(ct.total), counted: Number(ct.counted) || 0, unknown: Number(ct.unknown) || 0 }
          : null);
      }
    } catch (error) {
      if (stale()) return;
      console.error('Failed to fetch shipments:', error);
      setLoadError(errorText(error, 'The shipments could not be loaded.'));
    } finally {
      if (!stale()) setLoading(false);
    }
  };

  /**
   * Pulls the carrier's own order list and links back any shipment booked
   * straight in its dashboard instead of through this app — the actual fix
   * for "orders are being shipped from the Shiprocket panel" going invisible
   * to the board.
   */
  const handleReconcile = async (provider: 'shiprocket' | 'delhivery' = 'shiprocket') => {
    setShowReconcileModal(true);
    setReconciling(true);
    setReconcileResult(null);
    try {
      const response = await shipmentsAPI.reconcile(provider, 14);
      const data = response?.scanned !== undefined ? response : response?.data;
      setReconcileResult(data || { scanned: 0, linked: 0, alreadyLinked: 0, unmatched: [] });
      fetchShipments();
    } catch (error: any) {
      console.error('Failed to reconcile shipments:', error);
      alert(error.response?.data?.message || 'Failed to reconcile shipments');
      setShowReconcileModal(false);
    } finally {
      setReconciling(false);
    }
  };

  const handleAttachAwb = async (orderId: string, awb: string, provider: 'shiprocket' | 'delhivery' = 'shiprocket') => {
    try {
      await shipmentsAPI.attachAwb(orderId, awb, provider);
      fetchShipments();
    } catch (error: any) {
      console.error('Failed to attach AWB:', error);
      alert(error.response?.data?.message || `Failed to attach AWB ${awb} to order ${orderId}`);
      throw error;
    }
  };

  const handleSchedulePickup = async (shipment: any) => {
    setSelectedShipment(shipment);
    setShowPickupModal(true);
  };

  const handleSubmitPickup = async () => {
    if (!selectedShipment || !pickupDate) {
      alert('Please select a pickup date');
      return;
    }

    setSchedulingPickup(true);
    try {
      const res: any = await shipmentsAPI.schedulePickup(selectedShipment._id, {
        scheduledDate: pickupDate,
        pickupTimeSlot: pickupTimeSlot || undefined,
        notes: pickupNotes || undefined,
      });
      // The api client unwraps {success,data} → data; `message`/`meta` may be
      // siblings (dropped) or present — read the shipment's own pickup record.
      const pk = res?.pickup ?? res?.data?.pickup ?? {};
      const when = pk.scheduledFor || pk.scheduledDate || pickupDate;
      const tokenBits = [pk.pickupId, pk.pickupToken].filter(Boolean).join(', ');
      alert(pk.source === 'carrier' || res?.meta?.alreadyScheduled
        ? `A pickup was already booked with the courier for ${when}${tokenBits ? ` (${tokenBits})` : ''}. Recorded on the shipment.`
        : `Pickup scheduled for ${when}${tokenBits ? ` (${tokenBits})` : ''}.`);
      setShowPickupModal(false);
      setPickupDate('');
      setPickupTimeSlot('');
      setPickupNotes('');
      setSelectedShipment(null);
      setSelectedShipments([]);
      fetchShipments();
    } catch (error: any) {
      console.error('Failed to schedule pickup:', error);
      alert(error.response?.data?.message || 'Failed to schedule pickup');
    } finally {
      setSchedulingPickup(false);
    }
  };

  const handleBulkSubmitPickup = async () => {
    if (selectedShipments.length === 0 || !pickupDate) {
      alert('Please select at least one shipment and a pickup date');
      return;
    }

    // ONE request for the whole selection. The backend groups by provider +
    // warehouse and books ONE carrier pickup per group — that is what a bulk
    // pickup is at the carrier (Shiprocket: an array of shipment ids → one
    // pickup token). The old code fired N separate single-shipment calls and
    // refused any mixed provider/warehouse selection up front; the grouping
    // now happens server-side, so a mixed selection just becomes several
    // pickups.
    setSchedulingBulkPickup(true);
    try {
      const res = await shipmentsAPI.schedulePickupBulk(selectedShipments, {
        scheduledDate: pickupDate,
        pickupTimeSlot: pickupTimeSlot || undefined,
        notes: pickupNotes || undefined,
      });
      // The api client unwraps {success,data} → fields may be top-level.
      const data = res?.scheduled !== undefined ? res : (res?.data ?? {});
      const scheduled: any[] = Array.isArray(data?.scheduled) ? data.scheduled : [];
      const failed: any[] = Array.isArray(data?.failed) ? data.failed : [];

      const tokens = [...new Set(scheduled.map((s: any) => s.pickupId).filter(Boolean))];
      const already = scheduled.filter((s: any) => s.alreadyScheduled).length;
      const lines: string[] = [];
      if (scheduled.length) {
        lines.push(`Pickup confirmed for ${scheduled.length} shipment(s) on ${scheduled[0]?.scheduledFor || data?.scheduledDate || pickupDate}${already ? ` (${already} already booked with the courier, recorded)` : ''}${tokens.length ? `\nPickup id${tokens.length > 1 ? 's' : ''}: ${tokens.join(', ')}` : ''}`);
      }
      if (data?.hint) lines.push(String(data.hint));
      if (failed.length) {
        lines.push(`${failed.length} not scheduled:\n` + failed
          .map((f: any) => `${f.shipmentNumber || f.shipmentId}: ${f.message}`)
          .join('\n'));
      }
      alert(lines.join('\n\n') || 'No shipments were scheduled.');

      setShowBulkPickupModal(false);
      setPickupDate('');
      setPickupTimeSlot('');
      setPickupNotes('');
      setSelectedShipments([]);
      fetchShipments();
    } catch (error: any) {
      console.error('Failed to schedule bulk pickup:', error);
      alert(error.response?.data?.message || 'Failed to schedule bulk pickup');
    } finally {
      setSchedulingBulkPickup(false);
    }
  };

  // ONE file per natural group (all Shiprocket labels in one PDF; one manifest
  // per courier), not one download per shipment — the carrier renders them
  // that way and a manifest is a handover sheet for a courier's whole pickup.
  const handleBulkDocuments = useCallback(async (kind: 'labels' | 'manifests') => {
    if (selectedShipments.length === 0) return;
    try {
      const r = await shipmentsAPI.downloadDocumentsBulk(kind, selectedShipments);
      const lines: string[] = [];
      if (r.documents.length) {
        lines.push(`${r.documents.length} ${kind === 'labels' ? 'label' : 'manifest'} file(s) for ${selectedShipments.length - r.failed.length} shipment(s):\n` +
          r.documents.map((d) => `${d.filename}${d.courier ? `, ${d.courier}` : ''} (${d.shipmentNumbers.length})`).join('\n'));
      }
      if (r.failed.length) {
        lines.push(`${r.failed.length} not included:\n` + r.failed.map((f) => `${f.shipmentNumber || f.shipmentId}: ${f.message}`).join('\n'));
      }
      alert(lines.join('\n\n') || 'No documents were produced.');
    } catch (error: any) {
      alert(error.response?.data?.message || `Failed to download ${kind}`);
    }
  }, [selectedShipments]);
  // Labels open the Print labels window: Growcord's own label in any size, or the courier's PDF as before
  // (handleBulkDocuments('labels') is that window's courier path, shipmentsAPI.downloadDocumentsBulk).
  const [labelIds, setLabelIds] = useState<string[] | null>(null);
  const handleBulkDownloadLabel = useCallback(() => setLabelIds([...selectedShipments]), [selectedShipments]);
  const shipmentNames = useMemo(
    () => Object.fromEntries(shipments.map((s) => [s._id, String(s.shipmentNumber ?? s._id)])),
    [shipments],
  );
  const handleBulkDownloadManifest = useCallback(() => handleBulkDocuments('manifests'), [handleBulkDocuments]);

  const handleUpdateStatus = async (shipmentId: string, status: string) => {
    const label = getStatusLabel('shipment', status);
    const notes = prompt(`Move this shipment to "${label}". A note for its history (optional):`);
    if (notes === null) return; // User cancelled

    try {
      await shipmentsAPI.updateStatus(shipmentId, status, notes || undefined);
      alert(`Shipment moved to "${label}". Its order is updated to match.`);
      fetchShipments();
    } catch (error: any) {
      console.error('Failed to update status:', error);
      alert(error.response?.data?.message || 'Failed to update status');
    }
  };

  const handleCreateShipment = async (modalData?: any) => {
    if (!selectedOrder || !selectedWarehouseId) {
      alert('Please select a warehouse');
      return;
    }

    setCreatingShipment(true);
    try {
      // The warehouse's own id, as the order page sends it (the server resolves an id or a code, never a name).
      const shipmentData: any = {
        orderIds: [selectedOrder.orderId || selectedOrder._id],
        warehouseId: selectedWarehouseId,
        shippingProvider: selectedShippingProvider,
      };

      // Add provider-specific data
      if (selectedShippingProvider === 'manual') {
        shipmentData.manualTrackingId = manualTrackingId;
        shipmentData.manualCarrierName = manualCarrierName;
        shipmentData.manualTrackingUrl = manualTrackingUrl || undefined;
        // What was paid to the carrier: the modal refuses to submit a manual parcel without it (0 typed as 0).
        shipmentData.manualShippingCharge = modalData?.manualShippingCharge;
      }
      if ((selectedShippingProvider === 'shiprocket' || (selectedShippingProvider as string) === 'growcord_ship') && modalData?.selectedCourierId) {
        shipmentData.courierCompanyId = modalData.selectedCourierId;
      }
      if (selectedShippingProvider === 'delhivery' && modalData?.selectedDelhiveryType) {
        shipmentData.delhiveryServiceType = modalData.selectedDelhiveryType;
      }

      // Add dimensions
      shipmentData.weight = modalData?.weight || 0.5;
      shipmentData.length = modalData?.length || 20;
      shipmentData.breadth = modalData?.breadth || 15;
      shipmentData.height = modalData?.height || 10;
      if (modalData?.packageBoxId) shipmentData.packageBoxId = modalData.packageBoxId;

      // Map item indices to SKUs
      if (modalData?.selectedItemIndices && modalData.selectedItemIndices.length > 0 && selectedOrder.items) {
        const skus = modalData.selectedItemIndices
          .map((idx: number) => selectedOrder.items[idx]?.sku)
          .filter(Boolean);
        // `item_skus` is the booking's field (the old `orderItemIndices` name was dropped by the v2 body shaper).
        if (skus.length > 0) shipmentData.itemSkus = skus;
      }
      // PART-QUANTITY selections win over the plain SKU list when present.
      if (modalData?.itemSelections?.length) shipmentData.itemSelections = modalData.itemSelections;

      console.log('[Shipments] Creating shipment with data:', shipmentData);
      const response = await shipmentsAPI.create(shipmentData);
      console.log('[Shipments] Create shipment response:', response);

      // The booking answers {created[0]: {awb, courier, provider}} (lib/v2/areas/shipping.ts bookingReply);
      // a manual parcel's AWB is the tracking id typed for it.
      const shipmentObj = response?.data || response;
      const awb = shipmentObj?.awbCode
        || shipmentObj?.waybill
        || (selectedShippingProvider === 'manual' ? manualTrackingId : '')
        || '';
      const provider = providerOf(shipmentObj) || selectedShippingProvider;
      const courier = shipmentObj?.courierName || (selectedShippingProvider === 'manual' ? manualCarrierName : '');

      alert(['Shipment created.', awb ? `AWB: ${awb}` : '', `Carrier: ${providerLabel(provider, providerNames)}${courier ? `, ${courier}` : ''}`]
        .filter(Boolean).join('\n'));
      setShowCreateShipmentModal(false);
      setSelectedOrder(null);
      setManualTrackingId('');
      setManualCarrierName('');
      setManualTrackingUrl('');

      // Open the tab the new parcel is in: a booked parcel waits for its pickup, a manual one is already on its way.
      setActiveTab(selectedShippingProvider === 'manual' ? 'in_transit' : 'ready_to_pick');
      // fetchShipments will be triggered by activeTab change, but force it for same-tab case
      fetchShipments();
    } catch (error: any) {
      console.error('Failed to create shipment:', error);
      alert(`Error: ${errorText(error, 'Failed to create shipment')}`);
    } finally {
      setCreatingShipment(false);
    }
  };

  /**
   * The pending list carries an order's line COUNT, not its lines, so the create dialog (which picks the
   * lines to ship) opened from here had nothing to pick and refused every booking. The order is read whole
   * first, with what is still unshipped per line, exactly as the order page hands it over.
   */
  const openCreateFor = async (orderId: string) => {
    const row = pendingOrders.find(o => o._id === orderId);
    if (!row) return;
    setOpeningOrder(orderId);
    try {
      const res: any = await api.get(`/orders/${orderId}`);
      const full = res?.data?.data ?? res?.data ?? null;
      setSelectedOrder(full && Array.isArray(full.items) ? { ...row, ...full } : row);
      setShowCreateShipmentModal(true);
    } catch (error) {
      alert(errorText(error, 'The order could not be opened for booking.'));
    } finally {
      setOpeningOrder(null);
    }
  };

  const remainingByKey = useMemo(() => (
    Array.isArray(selectedOrder?.fulfillment?.lines)
      ? Object.fromEntries(selectedOrder.fulfillment.lines.map((l: any) => [String(l.sku || l.name || '').trim(), Number(l.remaining) || 0]))
      : undefined
  ), [selectedOrder]);

  // Bulk labels and manifests: every booked parcel (not manual) that is not finished, on the Ready to Pick,
  // Pickup Scheduled and In Transit tabs, as before 23 Nov 2026 (a parcel the courier has already picked up
  // still needs its manifest). Bulk pickup stays on Ready to Pick only.
  // One read of Growcord Ship's bookings no courier took, when the board shows a parcel of it with no AWB (at most
  // once a minute).
  useEffect(() => {
    if (fixedProvider !== 'growcord_ship') return;
    if (!shipments.some((s) => providerOf(s) === 'growcord_ship' && !shipmentAwb(s)) || Date.now() - notTakenAt.current < 60_000) return;
    notTakenAt.current = Date.now();
    notTakenBookings(100).then(setNotTaken).catch(() => setNotTaken([]));
  }, [fixedProvider, shipments]);
  const notBooked = useMemo(() => {
    if (!notTaken.length) return undefined;
    const match = notTakenMatcher(notTaken);
    const out: Record<string, string> = {};
    for (const s of shipments) if (match(s)) out[s._id] = NOT_TAKEN_TEXT;
    return Object.keys(out).length ? out : undefined;
  }, [notTaken, shipments]);

  const selectableIds = useMemo(() => (
    ['ready_to_pick', 'pickup_scheduled', 'in_transit'].includes(activeTab)
      ? shipments.filter((s) => providerOf(s) !== 'manual' && !isTerminal(s.status) && !notBooked?.[s._id]).map((s) => s._id)
      : []
  ), [activeTab, shipments, notBooked]);

  // The pending list's route takes only a page, so the search box looks through the orders on this page.
  const visiblePendingOrders = useMemo(() => {
    const needle = query.toLowerCase();
    if (!needle) return pendingOrders;
    const digits = needle.replace(/\D/g, '');
    return pendingOrders.filter((o) => {
      const a = o?.shippingAddress ?? {};
      return [o?.orderId, o?.customerName ?? o?.customer_name, a.fullName, a.mobileNumber, a.pincode]
        .map((v) => (v === null || v === undefined ? '' : String(v)))
        .some((h) => h.toLowerCase().includes(needle) || (digits.length >= 4 && h.replace(/\D/g, '').includes(digits)));
    });
  }, [pendingOrders, query]);

  if (loading && shipments.length === 0 && pendingOrders.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{title || 'Shipments'}</h1>
          {intro && <p className="mt-1 text-sm text-gray-500">{intro}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* AUTOSHIP-FILE-1: processed orders from a CSV, cheapest allowed courier. */}
          {hasPerm('shipments.manage') && (
            <Link to="/shipments/from-file" className="flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-brand-200 hover:bg-brand-50">
              <FaFileUpload size={14} /> Ship from a file
            </Link>
          )}
          <button
            onClick={async () => {
              setFetchingStatus(true);
              try {
                const response = await shipmentsAPI.fetchStatusUpdates();
                // The api client unwraps {success,data} → stats may be top-level.
                const stats = (response?.updated !== undefined ? response : response?.data) || {};
                alert(`Status updates fetched!\nUpdated: ${stats.updated || 0}\nUnchanged: ${stats.skipped || 0}\nFailed: ${stats.failed || 0}`);
                fetchShipments();
              } catch (error: any) {
                console.error('Failed to fetch status updates:', error);
                alert(error.response?.data?.message || 'Failed to fetch status updates');
              } finally {
                setFetchingStatus(false);
              }
            }}
            disabled={fetchingStatus}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            title="Fetch latest status from shipping providers"
          >
            {fetchingStatus ? <FaSpinner className="animate-spin" size={14} /> : <FaSync size={14} />}
            {fetchingStatus ? 'Fetching...' : 'Sync Status'}
          </button>
          {hasShiprocket && (!fixedProvider || (fixedProvider as string) === 'shiprocket') && (
          <button
            onClick={() => handleReconcile('shiprocket')}
            disabled={reconciling}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            title="Pull in shipments booked straight in the Shiprocket dashboard"
          >
            {reconciling ? <FaSpinner className="animate-spin" size={14} /> : <FaLink size={14} />}
            {reconciling ? 'Reconciling...' : 'Reconcile with Shiprocket'}
          </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          <span>{loadError}</span>
          <button onClick={() => fetchShipments()} className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium hover:bg-red-100">
            Try again
          </button>
        </div>
      )}

      <ActNow
        counts={statusCounts}
        onOpen={setActiveTab}
        hasCarrier={!providersKnown || providers.length > 0}
        toBookHint={carrierName ? 'Every order with nothing booked yet, for any carrier' : undefined}
      />

      {/* Filters - ABOVE the tabs */}
      <ShipmentFilters
        statusFilter={statusFilter}
        onStatusChange={(status) => {
          setStatusFilter(status);
          setSelectedShipments([]);
          setPagination(prev => ({ ...prev, page: 1 }));
        }}
        warehouseFilter={warehouseFilter}
        providerFilter={providerFilter}
        startDate={startDate}
        endDate={endDate}
        warehouses={warehouses}
        providers={filterProviders}
        onWarehouseChange={(warehouseId) => {
          setWarehouseFilter(warehouseId);
          setPagination(prev => ({ ...prev, page: 1 }));
        }}
        onProviderChange={(provider) => {
          if (fixedProvider) return;
          setProviderFilter(provider);
          setPagination(prev => ({ ...prev, page: 1 }));
        }}
        providerLocked={!!fixedProvider}
        onStartDateChange={(date) => {
          setStartDate(date);
          setPagination(prev => ({ ...prev, page: 1 }));
        }}
        onEndDateChange={(date) => {
          setEndDate(date);
          setPagination(prev => ({ ...prev, page: 1 }));
        }}
        search={searchText}
        onSearchChange={setSearchText}
        searchNote={activeTab !== 'pending_orders' && query && searchLocal
          ? 'The server does not search the whole board yet, so only the parcels on this page are searched.'
          : null}
        notApplied={activeTab === 'pending_orders'}
      />

      {/* Delivery Status Tabs - BELOW the filters */}
      <ShipmentTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        statusCounts={statusCounts}
        hints={carrierName ? {
          pending_orders: `Orders with nothing booked yet. An order has no carrier until it is booked, so this number counts every order waiting, not only ${carrierName} ones. Create a shipment for each.`,
        } : undefined}
      />

      {/* Tab Content */}
      {activeTab === 'pending_orders' ? (
        <>
          {openingOrder && <p className="mb-2 text-sm text-muted-foreground">Opening the order for booking...</p>}
          <PendingOrdersTable
            orders={visiblePendingOrders}
            onCreateShipment={(orderId) => { if (!openingOrder) openCreateFor(orderId); }}
          />
        </>
      ) : (
        <>
          {/* What the parcels in this view cost to ship: the board's sum over every shipment the tab and filters match. */}
          {chargeTotals && chargeTotals.counted > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-white px-4 py-2.5 text-sm">
              <span>
                Shipping charges for the {chargeTotals.counted.toLocaleString('en-IN')} shipment{chargeTotals.counted === 1 ? '' : 's'} in this view:{' '}
                <strong className="tabular-nums">{chargeTotals.total === null ? 'none recorded' : fmtRupees(chargeTotals.total)}</strong>
              </span>
              {chargeTotals.unknown > 0 && (
                <span className="text-amber-700">
                  {chargeTotals.unknown.toLocaleString('en-IN')} with no charge recorded (manual parcels entered before the charge was asked, or booked outside this admin). Open one to enter it.
                </span>
              )}
              <Link to="/panel/orders/cod-recon" className="ml-auto text-blue-700 hover:underline">COD payouts</Link>
            </div>
          )}

          {/* Bulk actions: booked parcels waiting for their pickup (pickup itself only while none is booked). */}
          <BulkActionsBar
            selectedCount={selectedShipments.length}
            onBulkPickup={activeTab === 'ready_to_pick' ? () => setShowBulkPickupModal(true) : undefined}
            onBulkDownloadLabel={handleBulkDownloadLabel}
            onBulkDownloadManifest={handleBulkDownloadManifest}
          />

          <ShipmentTable
            shipments={shipments}
            selectableIds={selectableIds}
            providerNames={providerNames}
            selectedShipments={selectedShipments}
            onSelectShipment={(id, checked) => {
              if (checked) {
                setSelectedShipments((prev) => (prev.includes(id) ? prev : [...prev, id]));
              } else {
                setSelectedShipments((prev) => prev.filter(sId => sId !== id));
              }
            }}
            onSelectAll={(checked) => setSelectedShipments(checked ? selectableIds : [])}
            onSchedulePickup={handleSchedulePickup}
            onUpdateStatus={handleUpdateStatus}
            onPrintLabels={(shipmentId) => setLabelIds([shipmentId])}
            onDownloadLabel={async (shipmentId, size) => {
              try {
                await shipmentsAPI.downloadLabel(shipmentId, size || '4R');
              } catch (error: any) {
                console.error('Failed to download label:', error);
                alert(error.response?.data?.message || 'Failed to download label');
              }
            }}
            onDownloadManifest={async (shipmentId) => {
              try {
                await shipmentsAPI.downloadManifest(shipmentId);
              } catch (error: any) {
                console.error('Failed to download manifest:', error);
                alert(error.response?.data?.message || 'Failed to download manifest');
              }
            }}
            onDownloadPickupReceipt={async (shipmentId) => {
              try {
                await shipmentsAPI.downloadPickupReceipt(shipmentId);
              } catch (error: any) {
                console.error('Failed to download pickup receipt:', error);
                alert(error.response?.data?.message || 'Failed to download pickup receipt');
              }
            }}
            onNdrAction={(shipment, action) => setNdrTarget({ shipment, action })}
            onViewDetails={setDetailShipmentId}
            notBooked={notBooked}
          />
        </>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="bg-white rounded-lg shadow mt-6">
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-700">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.pages}
                className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Pickup Modal */}
      <PickupModal
        isOpen={showBulkPickupModal}
        isBulk={true}
        shipmentCount={selectedShipments.length}
        onClose={() => {
          setShowBulkPickupModal(false);
          setPickupDate('');
          setPickupTimeSlot('');
          setPickupNotes('');
        }}
        onSubmit={handleBulkSubmitPickup}
        pickupDate={pickupDate}
        pickupTimeSlot={pickupTimeSlot}
        pickupNotes={pickupNotes}
        onDateChange={setPickupDate}
        onTimeSlotChange={setPickupTimeSlot}
        onNotesChange={setPickupNotes}
        isSubmitting={schedulingBulkPickup}
      />

      {/* Create Shipment Modal (full-featured from OrderDetail) */}
      <ShipmentCreationModal
        isOpen={showCreateShipmentModal}
        onClose={() => {
          setShowCreateShipmentModal(false);
          setSelectedOrder(null);
          setManualTrackingId('');
          setManualCarrierName('');
          setManualTrackingUrl('');
        }}
        onSubmit={handleCreateShipment}
        loading={creatingShipment}
        selectedShippingProvider={selectedShippingProvider}
        onShippingProviderChange={setSelectedShippingProvider}
        selectedWarehouseId={selectedWarehouseId}
        onWarehouseChange={setSelectedWarehouseId}
        warehouses={warehouses}
        shippingProviders={providers}
        manualTrackingId={manualTrackingId}
        manualCarrierName={manualCarrierName}
        manualTrackingUrl={manualTrackingUrl}
        onManualTrackingIdChange={setManualTrackingId}
        onManualCarrierNameChange={setManualCarrierName}
        onManualTrackingUrlChange={setManualTrackingUrl}
        orderId={selectedOrder?._id || ''}
        orderItems={selectedOrder?.items || []}
        remainingByKey={remainingByKey}
      />

      {/* Single Pickup Modal */}
      <PickupModal
        isOpen={showPickupModal}
        isBulk={false}
        onClose={() => {
          setShowPickupModal(false);
          setPickupDate('');
          setPickupTimeSlot('');
          setPickupNotes('');
          setSelectedShipment(null);
        }}
        onSubmit={handleSubmitPickup}
        pickupDate={pickupDate}
        pickupTimeSlot={pickupTimeSlot}
        pickupNotes={pickupNotes}
        onDateChange={setPickupDate}
        onTimeSlotChange={setPickupTimeSlot}
        onNotesChange={setPickupNotes}
        isSubmitting={schedulingPickup}
      />

      <ReconcileModal
        isOpen={showReconcileModal}
        onClose={() => setShowReconcileModal(false)}
        loading={reconciling}
        result={reconcileResult}
        provider="shiprocket"
        onAttach={(orderId, awb) => handleAttachAwb(orderId, awb, 'shiprocket')}
      />

      <PrintLabelsDialog
        open={!!labelIds}
        shipmentIds={labelIds ?? []}
        names={shipmentNames}
        growcordShipCount={(labelIds ?? []).filter((id) => providerOf(shipments.find((s) => s._id === id)) === 'growcord_ship').length}
        onClose={() => setLabelIds(null)}
      />

      <ShipmentDetailDrawer
        shipmentId={detailShipmentId}
        onClose={() => setDetailShipmentId(null)}
        onChanged={() => fetchShipments()}
        providerNames={providerNames}
      />

      <NdrActionDialog
        target={ndrTarget}
        onClose={() => setNdrTarget(null)}
        onDone={() => fetchShipments()}
      />
    </div>
  );
};

export default Shipments;
