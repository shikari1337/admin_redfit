import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usersAPI } from '../services/api';
import { format } from 'date-fns';
import {
  User,
  Mail,
  Phone,
  ShoppingCart,
  MapPin,
  Key,
  Eye,
  EyeOff,
  ArrowLeft,
  Package,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [browsedProducts, setBrowsedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchUserDetails();
    }
  }, [id]);

  useEffect(() => {
    if (id && activeTab === 'orders') {
      fetchOrders();
    } else if (id && activeTab === 'addresses') {
      fetchAddresses();
    } else if (id && activeTab === 'browsed') {
      fetchBrowsedProducts();
    }
  }, [id, activeTab]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      const response = await usersAPI.getById(id!);
      const userData = response?.data || response;
      setUser(userData);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await usersAPI.getOrders(id!, { limit: 50 });
      let ordersData: any[] = [];
      if (Array.isArray(response)) {
        ordersData = response;
      } else if (Array.isArray(response?.data)) {
        ordersData = response.data;
      } else if (Array.isArray(response?.data?.data)) {
        ordersData = response.data.data;
      }
      setOrders(ordersData);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      setOrders([]);
    }
  };

  const fetchAddresses = async () => {
    try {
      const response = await usersAPI.getAddresses(id!);
      let addressesData: any[] = [];
      if (Array.isArray(response)) {
        addressesData = response;
      } else if (Array.isArray(response?.data)) {
        addressesData = response.data;
      } else if (Array.isArray(response?.data?.data)) {
        addressesData = response.data.data;
      }
      setAddresses(addressesData);
    } catch (error) {
      console.error('Failed to fetch addresses:', error);
      setAddresses([]);
    }
  };

  const fetchBrowsedProducts = async () => {
    try {
      const response = await usersAPI.getBrowsedProducts(id!);
      let productsData: any[] = [];
      if (Array.isArray(response)) {
        productsData = response;
      } else if (Array.isArray(response?.data)) {
        productsData = response.data;
      } else if (Array.isArray(response?.data?.data)) {
        productsData = response.data.data;
      }
      setBrowsedProducts(productsData);
    } catch (error) {
      console.error('Failed to fetch browsed products:', error);
      setBrowsedProducts([]);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    if (!confirm("Are you sure you want to reset this user's password?")) {
      return;
    }

    try {
      setResetting(true);
      await usersAPI.resetPassword(id!, newPassword);
      alert('Password reset successfully!');
      setNewPassword('');
    } catch (error: any) {
      console.error('Failed to reset password:', error);
      alert(error.response?.data?.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'confirmed': return 'default';
      case 'processing': return 'secondary';
      case 'shipped': return 'default';
      case 'delivered': return 'success';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground mb-4">User not found</p>
        <Button variant="outline" asChild>
          <Link to="/users">Back to Users</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <Button variant="ghost" className="w-fit -ml-4" asChild>
          <Link to="/users" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Users
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">User Details</h1>
      </div>

      {/* User Info Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold">{user.displayName || user.name || 'No name'}</h2>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {user.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {user.email}
                    </div>
                  )}
                  {user.phoneNumber && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      {user.phoneNumber}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col md:items-end gap-2 text-sm">
              <Badge variant={user.role === 'admin' ? 'destructive' : 'default'} className="w-fit">
                {user.role}
              </Badge>
              <Badge variant={(user.isActive ? 'success' : 'destructive') as any} className="w-fit">
                {user.isActive ? 'Active' : 'Inactive'}
              </Badge>
              <div className="text-muted-foreground mt-2 md:text-right">
                <div>Created: {user.createdAt ? format(new Date(user.createdAt), 'MMM dd, yyyy HH:mm') : 'N/A'}</div>
                {user.lastLogin && <div>Last Login: {format(new Date(user.lastLogin), 'MMM dd, yyyy HH:mm')}</div>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="orders" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Orders ({orders.length})
          </TabsTrigger>
          <TabsTrigger value="addresses" className="gap-2">
            <MapPin className="h-4 w-4" />
            Saved Addresses ({addresses.length})
          </TabsTrigger>
          <TabsTrigger value="browsed" className="gap-2">
            <Package className="h-4 w-4" />
            Browsed Products ({browsedProducts.length})
          </TabsTrigger>
          <TabsTrigger value="password" className="gap-2">
            <Key className="h-4 w-4" />
            Password Reset
          </TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="p-6">
            <TabsContent value="orders" className="m-0 border-0 p-0">
              {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ShoppingCart className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No orders found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order._id}>
                        <TableCell className="font-medium">{order.orderId}</TableCell>
                        <TableCell>₹{order.total?.toLocaleString('en-IN')}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(order.orderStatus) as any} className="capitalize">
                            {order.orderStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {order.createdAt ? format(new Date(order.createdAt), 'MMM dd, yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/orders/${order._id}`} className="text-primary hover:text-primary/80">
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="addresses" className="m-0 border-0 p-0">
              {addresses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MapPin className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No saved addresses found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {addresses.map((address) => (
                    <Card key={address._id} className={address.isDefault ? 'border-primary bg-primary/5' : ''}>
                      <CardContent className="p-4">
                        {address.isDefault && (
                          <Badge className="mb-2">Default</Badge>
                        )}
                        <div className="font-semibold mb-2">{address.fullName}</div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>{address.address}</p>
                          {address.addressLine2 && <p>{address.addressLine2}</p>}
                          <p>
                            {address.district && `${address.district}, `}
                            {address.state} - {address.pincode}
                          </p>
                          <p className="pt-2">
                            <span className="font-medium text-foreground">Phone:</span> {address.mobileNumber}
                          </p>
                          {address.email && (
                            <p>
                              <span className="font-medium text-foreground">Email:</span> {address.email}
                            </p>
                          )}
                          {address.label && (
                            <Badge variant="secondary" className="mt-2">
                              {address.label === 'other' && address.customLabel ? address.customLabel : address.label}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="browsed" className="m-0 border-0 p-0">
              {browsedProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Package className="mx-auto text-muted-foreground h-10 w-10 mb-4" />
                  <p className="text-muted-foreground font-medium">Browsed products tracking is not currently implemented.</p>
                  <p className="text-sm text-muted-foreground mt-1">Product views are tracked via analytics services but not stored in the database.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {browsedProducts.map((product) => (
                    <Card key={product._id}>
                      <CardContent className="p-4">
                        {/* Empty placeholder for product display */}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="password" className="m-0 border-0 p-0">
              <div className="max-w-md space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    New Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 characters)"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">Password must be at least 6 characters long</p>
                </div>
                <Button
                  onClick={handleResetPassword}
                  disabled={!newPassword || newPassword.length < 6 || resetting}
                >
                  {resetting ? 'Resetting...' : 'Reset Password'}
                </Button>
              </div>
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
};

export default UserDetail;


