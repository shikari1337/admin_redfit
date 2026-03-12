import React, { useEffect, useState } from 'react';
import { staffAPI } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';

const MODULES = [
  { id: 'page_editor', label: 'Content / Page Editor' },
  { id: 'leads_manager', label: 'Leads (CRM)' },
];

const Staff: React.FC = () => {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const data = await staffAPI.list();
      setStaff(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch staff:', error);
      setStaff([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionToggle = async (staffId: string, moduleId: string, checked: boolean) => {
    const user = staff.find((s) => s._id === staffId || s.id === staffId);
    if (!user) return;
    const perms = user.permissions || [];
    const newPerms = checked ? [...perms, moduleId] : perms.filter((p: string) => p !== moduleId);
    try {
      await staffAPI.update(staffId, { permissions: newPerms });
      setStaff((prev) =>
        prev.map((s) =>
          (s._id === staffId || s.id === staffId) ? { ...s, permissions: newPerms } : s
        )
      );
    } catch (error) {
      console.error('Failed to update permissions:', error);
      alert('Failed to update permissions');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Staff & Permissions</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage which staff members can access the Page Editor and Leads Manager modules.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    {MODULES.map((m) => (
                      <TableHead key={m.id}>{m.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={MODULES.length + 1} className="h-32 text-center text-muted-foreground">
                        No staff members found. Staff are created via the API or backend.
                      </TableCell>
                    </TableRow>
                  ) : (
                    staff.map((user) => (
                      <TableRow key={user._id || user.id}>
                        <TableCell>
                          <div className="font-medium">{user.name || user.email}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </TableCell>
                        {MODULES.map((m) => {
                          const perms = user.permissions || [];
                          const hasAccess = perms.includes(m.id);
                          return (
                            <TableCell key={m.id}>
                              <label className="flex items-center gap-2 cursor-pointer font-medium text-sm">
                                <Checkbox
                                  checked={hasAccess}
                                  onCheckedChange={(checked) =>
                                    handlePermissionToggle(user._id || user.id, m.id, checked as boolean)
                                  }
                                />
                                {hasAccess ? 'Yes' : 'No'}
                              </label>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Staff;
