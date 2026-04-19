/**
 * Shipments Management Page
 * Manage shipments with pickup scheduling and AWB generation
 */

import React, { useEffect, useState, useCallback } from 'react';
import { shipmentsAPI, warehousesAPI } from '../services/api';
import { FaSync, FaSpinner } from 'react-icons/fa';
import { ShipmentTabs, ShipmentFilters, ShipmentTable, PendingOrdersTable, PickupModal, BulkActionsBar } from '../components/shipments';
import type { TabType, StatusCounts } from '../components/shipments';
import ShipmentCreationModal from '../components/order/ShipmentCreationModal';

const Shipments: React.FC = () => {
  const [shipments, setShipments] = useState<any[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('pending_orders');
  const [statusFilter, setStatusFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
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
  const [showCreateShipmentModal, setShowCreateShipmentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [creatingShipment, setCreatingShipment] = useState(false);
  // ShipmentCreationModal state
  const [selectedShippingProvider, setSelectedShippingProvider] = useState<'shiprocket' | 'delhivery' | 'manual'>('delhivery');
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

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    // Map tab to status filter
    let status = '';
    switch (activeTab) {
      case 'pending_orders':
        status = ''; // Uses separate endpoint
        break;
      case 'ready_to_pick':
        status = 'pending';
        break;
      case 'pickup_scheduled':
        status = 'pickup_scheduled';
        break;
      case 'in_transit':
        status = 'picked_up,in_transit,out_for_delivery';
        break;
      case 'ndr_failed_delivery':
        status = 'ndr_failed_delivery';
        break;
      case 'delivered':
        status = 'delivered';
        break;
      case 'rto_in_transit':
        status = 'rto_in_transit';
        break;
      case 'rto_delivered':
        status = 'rto_delivered';
        break;
      case 'rto_failed':
        status = 'rto_failed';
        break;
    }
    setStatusFilter(status);
    setSelectedShipments([]);
    setPagination(prev => ({ ...prev, page: 1 }));
  }, [activeTab]);

  useEffect(() => {
    fetchShipments();
  }, [statusFilter, warehouseFilter, providerFilter, startDate, endDate, pagination.page]);

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
    try {
      setLoading(true);

      if (activeTab === 'pending_orders') {
        const response = await shipmentsAPI.getPendingOrders({
          page: pagination.page,
          limit: pagination.limit,
        });
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
        const pag = response?.pagination || response?.data?.pagination;
        if (pag) {
          setPagination(prev => ({ ...prev, ...pag }));
        }
        // Also fetch status counts from shipments endpoint
        try {
          const countsResp = await shipmentsAPI.getAll({ page: 1, limit: 1 });
          const counts = countsResp?.statusCounts || countsResp?.data?.statusCounts;
          if (counts) {
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

        const response = await shipmentsAPI.getAll(params);
        console.log('[Shipments] getAll raw response:', response);
        console.log('[Shipments] response type:', typeof response, Array.isArray(response) ? 'is-array' : 'not-array');
        console.log('[Shipments] response keys:', response ? Object.keys(response) : 'null');
        if (response?.shipments) {
          console.log('[Shipments] shipments count:', response.shipments.length);
          if (response.shipments.length > 0) {
            console.log('[Shipments] First shipment:', JSON.stringify(response.shipments[0], null, 2));
            console.log('[Shipments] First shipment keys:', Object.keys(response.shipments[0]));
          }
        }
        let shipmentsData: any[] = [];
        if (Array.isArray(response)) {
          console.log('[Shipments] Branch: response is array');
          shipmentsData = response;
        } else if (Array.isArray(response?.shipments)) {
          console.log('[Shipments] Branch: response.shipments is array');
          shipmentsData = response.shipments;
        } else if (Array.isArray(response?.data)) {
          console.log('[Shipments] Branch: response.data is array');
          shipmentsData = response.data;
        } else if (Array.isArray(response?.data?.shipments)) {
          console.log('[Shipments] Branch: response.data.shipments is array');
          shipmentsData = response.data.shipments;
        } else {
          console.log('[Shipments] Branch: NO MATCH - response structure unexpected');
        }

        console.log('[Shipments] Final shipmentsData count:', shipmentsData.length);
        if (shipmentsData.length > 0) {
          console.log('[Shipments] Final first shipment:', JSON.stringify(shipmentsData[0], null, 2));
        }

        setShipments(Array.isArray(shipmentsData) ? shipmentsData : []);
        const pag = response?.pagination || response?.data?.pagination;
        if (pag) {
          setPagination(prev => ({ ...prev, ...pag }));
        }
        const counts = response?.statusCounts || response?.data?.statusCounts;
        if (counts) {
          setStatusCounts(prev => ({ ...prev, ...counts }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch shipments:', error);
    } finally {
      setLoading(false);
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
      await shipmentsAPI.schedulePickup(selectedShipment._id, {
        scheduledDate: pickupDate,
        pickupTimeSlot: pickupTimeSlot || undefined,
        notes: pickupNotes || undefined,
      });
      alert('Pickup scheduled successfully!');
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

    // Group selected shipments by provider and warehouse
    const grouped: Record<string, string[]> = {};
    selectedShipments.forEach(id => {
      const shipment = shipments.find(s => s._id === id);
      if (shipment && shipment.status === 'pending' && shipment.shippingProvider !== 'manual') {
        const key = `${shipment.shippingProvider}_${shipment.warehouseId?._id || shipment.warehouseId}`;
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(id);
      }
    });

    const keys = Object.keys(grouped);
    if (keys.length > 1) {
      alert('Bulk pickup can only be scheduled for shipments from the same shipping provider and warehouse. Please select shipments from the same provider and warehouse.');
      return;
    }

    setSchedulingBulkPickup(true);
    try {
      const results = await Promise.allSettled(
        selectedShipments.map(id =>
          shipmentsAPI.schedulePickup(id, {
            scheduledDate: pickupDate,
            pickupTimeSlot: pickupTimeSlot || undefined,
            notes: pickupNotes || undefined,
          })
        )
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed === 0) {
        alert(`Successfully scheduled pickup for ${successful} shipment(s)!`);
      } else {
        alert(`Scheduled pickup for ${successful} shipment(s), but ${failed} failed. Please check individual shipments.`);
      }

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

  const handleBulkDownloadLabel = useCallback(async () => {
    if (selectedShipments.length === 0) return;
    try {
      let successCount = 0;
      for (const id of selectedShipments) {
        try {
          await shipmentsAPI.downloadLabel(id);
          successCount++;
        } catch (err) {
          console.error(`Failed to download label for ${id}:`, err);
        }
      }
      alert(`Downloaded ${successCount} of ${selectedShipments.length} label(s).`);
    } catch (error: any) {
      alert('Failed to download labels');
    }
  }, [selectedShipments]);

  const handleBulkDownloadManifest = useCallback(async () => {
    if (selectedShipments.length === 0) return;
    try {
      let successCount = 0;
      for (const id of selectedShipments) {
        try {
          await shipmentsAPI.downloadManifest(id);
          successCount++;
        } catch (err) {
          console.error(`Failed to download manifest for ${id}:`, err);
        }
      }
      alert(`Downloaded ${successCount} of ${selectedShipments.length} manifest(s).`);
    } catch (error: any) {
      alert('Failed to download manifests');
    }
  }, [selectedShipments]);

  const handleUpdateStatus = async (shipmentId: string, status: string) => {
    const notes = prompt(`Enter notes for status change to ${status} (optional):`);
    if (notes === null) return; // User cancelled

    try {
      await shipmentsAPI.updateStatus(shipmentId, status, notes || undefined);
      alert('Status updated successfully!');
      fetchShipments();
    } catch (error: any) {
      console.error('Failed to update status:', error);
      alert(error.response?.data?.message || 'Failed to update status');
    }
  };

  const handleNdrReattempt = async (shipmentId: string) => {
    if (!confirm('Are you sure you want to re-attempt delivery for this shipment?')) return;
    try {
      await shipmentsAPI.ndrReattempt(shipmentId);
      alert('Re-attempt delivery requested successfully! Shipment moved back to In Transit.');
      fetchShipments();
    } catch (error: any) {
      console.error('Failed to request re-attempt:', error);
      alert(error.response?.data?.message || 'Failed to request re-attempt delivery');
    }
  };

  const handleNdrUpdatePhone = async (shipmentId: string, phone: string) => {
    try {
      await shipmentsAPI.ndrUpdatePhone(shipmentId, phone);
      alert('Delivery phone number updated successfully!');
      fetchShipments();
    } catch (error: any) {
      console.error('Failed to update phone:', error);
      alert(error.response?.data?.message || 'Failed to update delivery phone number');
    }
  };

  const handleCreateShipment = async (modalData?: any) => {
    if (!selectedOrder || !selectedWarehouseId) {
      alert('Please select a warehouse');
      return;
    }

    setCreatingShipment(true);
    try {
      // Use human-readable IDs for backend
      let readableWarehouseId = selectedWarehouseId;
      const selectedW = warehouses.find(w => w._id === selectedWarehouseId);
      if (selectedW) {
        readableWarehouseId = selectedW.code || selectedW.name || selectedWarehouseId;
      }

      const shipmentData: any = {
        orderIds: [selectedOrder.orderId || selectedOrder._id],
        warehouseId: readableWarehouseId,
        shippingProvider: selectedShippingProvider,
      };

      // Add provider-specific data
      if (selectedShippingProvider === 'manual') {
        shipmentData.manualTrackingId = manualTrackingId;
        shipmentData.manualCarrierName = manualCarrierName;
        shipmentData.manualTrackingUrl = manualTrackingUrl;
      }
      if (selectedShippingProvider === 'shiprocket' && modalData?.selectedCourierId) {
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
        if (skus.length > 0) shipmentData.orderItemIndices = skus;
      }

      console.log('[Shipments] Creating shipment with data:', shipmentData);
      const response = await shipmentsAPI.create(shipmentData);
      console.log('[Shipments] Create shipment response:', response);

      // After interceptor normalization, response is the shipment object directly
      // or it could be { data: shipment } depending on response structure
      const shipmentObj = response?.data || response;
      const shipmentNumber = shipmentObj?.shipmentNumber || '';
      const awb = shipmentObj?.providerData?.delhiveryWaybill
        || shipmentObj?.providerData?.shiprocketAWB
        || '';
      const provider = shipmentObj?.shippingProvider || selectedShippingProvider;

      alert(`✅ Shipment created successfully!${shipmentNumber ? `\n📦 Shipment: #${shipmentNumber}` : ''}${awb ? `\n🏷️ AWB: ${awb}` : ''}${provider ? `\n🚚 Provider: ${provider.toUpperCase()}` : ''}`);
      setShowCreateShipmentModal(false);
      setSelectedOrder(null);
      setManualTrackingId('');
      setManualCarrierName('');
      setManualTrackingUrl('');

      // Switch to "Ready to Pick" tab so user sees the new shipment with AWB
      if (awb) {
        setActiveTab('ready_to_pick');
      }
      // fetchShipments will be triggered by activeTab change, but force it for same-tab case
      fetchShipments();
    } catch (error: any) {
      console.error('Failed to create shipment:', error);
      const errMsg = error.response?.data?.message || error.message || 'Failed to create shipment';
      alert(`Error: ${errMsg}`);
    } finally {
      setCreatingShipment(false);
    }
  };

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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Shipments</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              setFetchingStatus(true);
              try {
                const response = await shipmentsAPI.fetchStatusUpdates();
                alert(`Status updates fetched!\nUpdated: ${response.data?.updated || 0}\nFailed: ${response.data?.failed || 0}\nSkipped: ${response.data?.skipped || 0}`);
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
        </div>
      </div>

      {/* Filters - ABOVE the tabs */}
      <ShipmentFilters
        statusFilter={statusFilter}
        warehouseFilter={warehouseFilter}
        providerFilter={providerFilter}
        startDate={startDate}
        endDate={endDate}
        warehouses={warehouses}
        onStatusChange={(status) => {
          setStatusFilter(status);
          setPagination(prev => ({ ...prev, page: 1 }));
        }}
        onWarehouseChange={(warehouseId) => {
          setWarehouseFilter(warehouseId);
          setPagination(prev => ({ ...prev, page: 1 }));
        }}
        onProviderChange={(provider) => {
          setProviderFilter(provider);
          setPagination(prev => ({ ...prev, page: 1 }));
        }}
        onStartDateChange={(date) => {
          setStartDate(date);
          setPagination(prev => ({ ...prev, page: 1 }));
        }}
        onEndDateChange={(date) => {
          setEndDate(date);
          setPagination(prev => ({ ...prev, page: 1 }));
        }}
      />

      {/* Delivery Status Tabs - BELOW the filters */}
      <ShipmentTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        statusCounts={statusCounts}
      />

      {/* Tab Content */}
      {activeTab === 'pending_orders' ? (
        <PendingOrdersTable
          orders={pendingOrders}
          onCreateShipment={(orderId) => {
            const order = pendingOrders.find(o => o._id === orderId);
            if (order) {
              setSelectedOrder(order);
              setShowCreateShipmentModal(true);
            }
          }}
        />
      ) : (
        <>
          {/* Bulk Actions Bar - shown when shipments are selected */}
          <BulkActionsBar
            selectedCount={selectedShipments.length}
            onBulkPickup={() => setShowBulkPickupModal(true)}
            onBulkDownloadLabel={handleBulkDownloadLabel}
            onBulkDownloadManifest={handleBulkDownloadManifest}
          />

          <ShipmentTable
            shipments={shipments}
            activeTab={activeTab}
            selectedShipments={selectedShipments}
            onSelectShipment={(id, checked) => {
              if (checked) {
                setSelectedShipments([...selectedShipments, id]);
              } else {
                setSelectedShipments(selectedShipments.filter(sId => sId !== id));
              }
            }}
            onSelectAll={(checked) => {
              const selectableShipments = shipments.filter(s => s.status === 'pending' && s.shippingProvider !== 'manual');
              if (checked) {
                setSelectedShipments(selectableShipments.map(s => s._id));
              } else {
                setSelectedShipments([]);
              }
            }}
            onSchedulePickup={handleSchedulePickup}
            onUpdateStatus={handleUpdateStatus}
            onDownloadLabel={async (shipmentId) => {
              try {
                await shipmentsAPI.downloadLabel(shipmentId);
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
            onNdrReattempt={handleNdrReattempt}
            onNdrUpdatePhone={handleNdrUpdatePhone}
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
        shippingProviders={[
          { id: 'delhivery', name: 'Delhivery' },
          { id: 'shiprocket', name: 'Shiprocket' },
        ]}
        manualTrackingId={manualTrackingId}
        manualCarrierName={manualCarrierName}
        manualTrackingUrl={manualTrackingUrl}
        onManualTrackingIdChange={setManualTrackingId}
        onManualCarrierNameChange={setManualCarrierName}
        onManualTrackingUrlChange={setManualTrackingUrl}
        orderId={selectedOrder?._id || ''}
        orderItems={selectedOrder?.items?.map((item: any) => ({
          productName: item.productName || item.name || 'Product',
          size: item.size || 'N/A',
          quantity: item.quantity || 1,
          price: item.price || 0,
        })) || []}
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
    </div>
  );
};

export default Shipments;
