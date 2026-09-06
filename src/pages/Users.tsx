import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usersAPI } from '../services/api';
import { User, Mail, Phone, Eye, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/erp';
import { formatDate } from '../utils/date';

const PAGE_SIZE = 20;

const Users: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchUsers();
  }, [page, searchTerm, roleFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params: any = {
        page,
        limit: PAGE_SIZE,
      };
      if (searchTerm) {
        params.search = searchTerm;
      }
      if (roleFilter && roleFilter !== 'all') {
        params.role = roleFilter;
      }
      const response = await usersAPI.getAll(params);
      // Backend returns: { success: true, data: users[], pagination: {...} }
      // API interceptor normalizes to: { data: users[], pagination: {...} } or users[]
      let usersData: any[] = [];
      if (Array.isArray(response)) {
        usersData = response;
      } else if (Array.isArray(response?.data)) {
        usersData = response.data;
      } else if (Array.isArray(response?.data?.data)) {
        usersData = response.data.data;
      }
      // Ensure all _id fields are strings
      const sanitizedUsers = usersData.map((user: any) => ({
        ...user,
        _id: typeof user._id === 'string' ? user._id : String(user._id || ''),
      }));
      setUsers(sanitizedUsers);
      setTotal(response?.pagination?.total || response?.total || 0);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const getRoleVariant = (role: string) => {
    return role === 'admin' ? 'destructive' : 'default';
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by name, email, or phone..."
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Role
              </label>
              <Select
                value={roleFilter || 'all'}
                onValueChange={(val) => {
                  setRoleFilter(val === 'all' ? '' : val);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-end">
              <div className="text-sm text-muted-foreground pb-2">
                Total: <span className="font-semibold text-foreground">{total}</span> users
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const userId = typeof user._id === 'string' ? user._id : String(user._id || '');
                  return (
                    <TableRow key={userId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {user.displayName || user.name || 'No name'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ID: {String(user._id || '').slice(-8)}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          {user.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span>{user.email}</span>
                            </div>
                          )}
                          {user.phoneNumber && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              <span>{user.phoneNumber}</span>
                            </div>
                          )}
                          {!user.email && !user.phoneNumber && (
                            <span className="text-muted-foreground">No contact info</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRoleVariant(user.role) as any} className="capitalize">
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={(user.isActive ? 'success' : 'destructive') as any} className="capitalize">
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {user.createdAt
                          ? formatDate(user.createdAt, 'MMM dd, yyyy')
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/users/${userId}`} className="text-primary hover:text-primary/80">
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
    </div>
  );
};

export default Users;


