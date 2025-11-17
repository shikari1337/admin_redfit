/**
 * Shipments Management Page
 * Manage shipments with pickup scheduling and AWB generation
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { shipmentsAPI, warehousesAPI } from '../services/api';
import { FaPlus, FaSync, FaSpinner } from 'react-icons/fa';
import { ShipmentTabs, ShipmentFilters, ShipmentTable, PickupModal, BulkActionsBar } from '../components/shipments';

type TabType = 'all' | 'ready_to_pickup' | 'pickup_scheduled' | 'in_transit' | 'delivered';

const Shipments: React.FC = () => {
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<any | null>(null);
  const [selectedShipments, setSelectedShipments] = useState<string[]>([]); // For bulk operations
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [showBulkPickupModal, setShowBulkPickupModal] = useState(false);
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTimeSlot, setPickupTimeSlot] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [schedulingPickup, setSchedulingPickup] = useState(false);
  const [schedulingBulkPickup, setSchedulingBulkPickup] = useState(false);
  const [fetchingStatus, setFetchingStatus] = useState(false);
  const [statusCounts, setStatusCounts] = useState({
    all: 0,
    pending: 0,
    pickup_scheduled: 0,
    in_transit: 0,
    delivered: 0,
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    // Map tab to status filter
    let status = '';
    switch (activeTab) {
      case 'ready_to_pickup':
        status = 'pending';
        break;
      case 'pickup_scheduled':
        status = 'pickup_scheduled';
        break;
      case 'in_transit':
        status = 'picked_up,in_transit,out_for_delivery'; // Multiple statuses for in_transit tab
        break;
      case 'delivered':
        status = 'delivered';
        break;
      default:
        status = ''; // All statuses for 'all' tab
    }
    setStatusFilter(status);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page on tab change
  }, [activeTab]);

  useEffect(() => {
    fetchShipments();
  }, [statusFilter, warehouseFilter, providerFilter, startDate, endDate, pagination.page]);

  const fetchWarehouses = async () => {
    try {
      const response = await warehousesAPI.getAll();
      // Handle both array response and object with data property
      const warehousesData = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      setWarehouses(warehousesData);
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
      setWarehouses([]); // Set empty array on error to prevent map errors
    }
  };

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (statusFilter) params.status = statusFilter;
      if (warehouseFilter) params.warehouseId = warehouseFilter;
      if (providerFilter) params.shippingProvider = providerFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await shipmentsAPI.getAll(params);
      const shipmentsData = response.data?.shipments || [];
      
      // Backend now handles multiple statuses, so no need to filter here
      setShipments(Array.isArray(shipmentsData) ? shipmentsData : []);
      if (response.data?.pagination) {
        setPagination(prev => ({ ...prev, ...response.data.pagination }));
      }
      if (response.data?.statusCounts) {
        setStatusCounts(response.data.statusCounts);
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
      alert('Pickup scheduled successfully! AWB has been generated automatically.');
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

    // Check if all selected shipments are from same provider and warehouse
    const keys = Object.keys(grouped);
    if (keys.length > 1) {
      alert('Bulk pickup can only be scheduled for shipments from the same shipping provider and warehouse. Please select shipments from the same provider and warehouse.');
      return;
    }

    setSchedulingBulkPickup(true);
    try {
      // Schedule pickup for all selected shipments
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
        alert(`Successfully scheduled pickup for ${successful} shipment(s)! AWB has been generated automatically.`);
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


  if (loading && shipments.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div>
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
            {fetchingStatus ? 'Fetching...' : 'Fetch Status Updates'}
          </button>
          <Link
            to="/shipments/new"
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            <FaPlus size={16} />
            Create Shipment
          </Link>
        </div>
      </div>

      <ShipmentTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        statusCounts={statusCounts}
      />

      <BulkActionsBar
        selectedCount={selectedShipments.length}
        onBulkPickup={() => setShowBulkPickupModal(true)}
      />

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
        onDownloadPickupReceipt={async (shipmentId) => {
          try {
            await shipmentsAPI.downloadPickupReceipt(shipmentId);
          } catch (error: any) {
            console.error('Failed to download pickup receipt:', error);
            alert(error.response?.data?.message || 'Failed to download pickup receipt');
          }
        }}
      />

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

