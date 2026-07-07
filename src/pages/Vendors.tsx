import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { vendorsAPI } from '../services/api';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved:  'bg-green-50 text-green-700 border-green-200',
  suspended: 'bg-orange-50 text-orange-700 border-orange-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
};

const Vendors: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    setLoading(true);
    try {
      const res = await vendorsAPI.list();
      setVendors(Array.isArray(res) ? res : []);
    } catch {
      setVendors([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, status: 'pending' | 'approved' | 'suspended' | 'rejected') => {
    setUpdatingId(id);
    try {
      await vendorsAPI.updateStatus(id, status);
      setVendors((prev) => prev.map((v) => v.id === id || v._id === id ? { ...v, status } : v));
    } catch {
      alert('Failed to update vendor status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this vendor? This cannot be undone.')) return;
    try {
      await vendorsAPI.delete(id);
      setVendors((prev) => prev.filter((v) => (v.id || v._id) !== id));
    } catch {
      alert('Failed to delete vendor');
    }
  };

  const filtered = vendors.filter((v) => {
    const matchSearch = !search || v.business_name?.toLowerCase().includes(search.toLowerCase()) || v.slug?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || v.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" color="primary" text="Loading vendors…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
        {isAdmin && (
          <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Link to="/vendors/new"><FaPlus className="mr-2" /> Add Vendor</Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search vendors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring w-60"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} vendor{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="rounded-md border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>GST / PAN</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No vendors found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((vendor) => {
                const id = String(vendor.id || vendor._id || '');
                return (
                  <TableRow key={id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {vendor.logo_url ? (
                          <img src={vendor.logo_url} alt={vendor.business_name} className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">
                            {vendor.business_name?.charAt(0)?.toUpperCase() || 'V'}
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{vendor.business_name}</div>
                          <div className="text-xs text-muted-foreground">{vendor.slug}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{vendor.gst_number || '—'}</div>
                      <div className="text-xs text-muted-foreground">{vendor.pan_number || ''}</div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{vendor.commission_pct ?? 0}%</span>
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button disabled={updatingId === id} className="focus:outline-none">
                              {updatingId === id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Badge variant="outline" className={`cursor-pointer capitalize ${STATUS_COLORS[vendor.status] || ''}`}>
                                  {vendor.status || 'pending'}
                                </Badge>
                              )}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {(['pending', 'approved', 'suspended', 'rejected'] as const).map((s) => (
                              <DropdownMenuItem key={s} onClick={() => handleStatusChange(id, s)} disabled={vendor.status === s}>
                                <span className="capitalize">{s}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Badge variant="outline" className={`capitalize ${STATUS_COLORS[vendor.status] || ''}`}>
                          {vendor.status || 'pending'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={vendor.is_active ? 'default' : 'destructive'} className={vendor.is_active ? 'bg-green-500/15 text-green-700 border-green-200' : ''}>
                        {vendor.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && (
                          <>
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`/vendors/${id}/edit`}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Link>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <span className="sr-only">More</span>
                                  <span className="text-muted-foreground">⋮</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive cursor-pointer" onClick={() => handleDelete(id)}>
                                  <FaTrash className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Vendors;
