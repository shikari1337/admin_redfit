import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { leadsAPI, cartsAPI } from '../services/api';
import LeadDetailsModal from '../components/leads/LeadDetailsModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  Search,
  Plus,
  Phone,
  MessageCircle,
  CheckCircle,
  Clock,
  Filter,
  Calendar,
  Tag,
} from 'lucide-react';

interface Lead {
  _id: string;
  fullName?: string;
  name?: string;
  mobileNumber?: string;
  phone?: string;
  email?: string;
  status: string;
  source?: string;
  tags?: string[];
  isBrochureSent?: boolean;
  nextFollowUp?: string;
  createdAt: string;
  projectId?: { name?: string };
}

const STATUS_OPTIONS = [
  'new',
  'contacted',
  'interested',
  'site_visit_scheduled',
  'site_visit_done',
  'negotiation',
  'booked',
  'lost',
  'junk',
  'in_progress',
  'completed',
  'converted',
];

/**
 * Abandoned carts inside the CRM — these ARE warm leads (a filled cart with
 * contact info). Shows the hottest ones with a jump into the full workspace.
 */
const AbandonedCartsCrmPanel: React.FC = () => {
  const [carts, setCarts] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    cartsAPI.listAdmin({ status: 'abandoned' })
      .then((data: any) => {
        const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        setCarts(list);
      })
      .catch(() => setCarts([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || carts.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="font-semibold text-foreground">
              🛒 {carts.length} abandoned cart{carts.length === 1 ? '' : 's'} waiting for follow-up
            </p>
            <p className="text-xs text-muted-foreground">Filled carts with contact details — the warmest leads you have.</p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to="/orders/abandoned-carts">Open cart recovery</Link>
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {carts.slice(0, 6).map((c: any) => (
            <Link
              key={c._id ?? c.id}
              to={`/orders/abandoned-carts/${c._id ?? c.id}`}
              className="border rounded-md bg-background px-3 py-2 hover:border-amber-400 transition-colors"
            >
              <p className="text-sm font-medium truncate">
                {c.user?.name || 'Guest'} · {(c.items?.length ?? 0)} item(s)
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {c.user?.phoneNumber || 'no phone'} · last active {c.lastActiveAt ? new Date(c.lastActiveAt).toLocaleDateString('en-IN') : '—'}
              </p>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const Leads: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [showBrochureSentOnly, setShowBrochureSentOnly] = useState(false);

  const fetchLeads = async () => {
    try {
      const data = await leadsAPI.getAll();
      setLeads(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching leads:', error);
      setLeads([]);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await leadsAPI.update(id, { status: newStatus });
      fetchLeads();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleLeadUpdate = (updatedLead: Lead) => {
    setLeads((prev) => prev.map((l) => (l._id === updatedLead._id ? updatedLead : l)));
    setSelectedLead(updatedLead);
  };

  const getStatusClass = (status: string) => {
    const classes: Record<string, string> = {
      new: 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-transparent',
      interested: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border-transparent',
      site_visit_scheduled: 'bg-purple-100 text-purple-800 hover:bg-purple-200 border-transparent',
      site_visit_done: 'bg-pink-100 text-pink-800 hover:bg-pink-200 border-transparent',
      negotiation: 'bg-orange-100 text-orange-800 hover:bg-orange-200 border-transparent',
      lost: 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-transparent',
    };
    return classes[status] || '';
  };

  const getLeadName = (lead: Lead) => lead.fullName || lead.name || 'Unknown';
  const getLeadPhone = (lead: Lead) => lead.mobileNumber || lead.phone || '';

  const handleWhatsApp = (phone: string, name: string) => {
    if (!phone) return;
    const number = phone.replace(/\D/g, '');
    const text = `Hi ${name}, greeting from our team!`;
    window.open(`https://wa.me/91${number}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCall = (phone: string) => {
    if (!phone) return;
    window.open(`tel:${phone}`);
  };

  const filteredLeads = leads.filter((lead) => {
    const name = getLeadName(lead);
    const phone = getLeadPhone(lead);
    const matchesSearch =
      name.toLowerCase().includes(filter.toLowerCase()) ||
      (lead.email?.toLowerCase() || '').includes(filter.toLowerCase()) ||
      phone.includes(filter);

    const matchesTag = tagFilter !== 'all' ? lead.tags?.includes(tagFilter) : true;
    const matchesBrochure = showBrochureSentOnly ? lead.isBrochureSent : true;

    return matchesSearch && matchesTag && matchesBrochure;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeads(filteredLeads.map((l) => l._id));
    } else {
      setSelectedLeads([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (!checked) {
      setSelectedLeads(selectedLeads.filter((lId) => lId !== id));
    } else {
      setSelectedLeads([...selectedLeads, id]);
    }
  };

  const handleExport = () => {
    const leadsToExport = selectedLeads.length > 0 ? leads.filter((l) => selectedLeads.includes(l._id)) : filteredLeads;

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Name,Phone,Email,Status,Source,Tags,Brochure Sent,Date']
        .concat(
          leadsToExport.map((l) =>
            [
              `"${getLeadName(l)}"`,
              `"${getLeadPhone(l)}"`,
              `"${l.email || ''}"`,
              `"${l.status}"`,
              `"${l.source || ''}"`,
              `"${(l.tags || []).join(';')}"`,
              `"${l.isBrochureSent ? 'Yes' : 'No'}"`,
              `"${new Date(l.createdAt).toLocaleDateString()}"`,
            ].join(',')
          )
        )
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const allTags = [...new Set(leads.flatMap((l) => l.tags || []))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage and track your leads.</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Add New Lead
        </Button>
      </div>

      <AbandonedCartsCrmPanel />

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b bg-muted/40 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:flex-none w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search leads..."
                  className="pl-9"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <div className="flex items-center gap-2">
                    <Filter className="w-3 h-3 text-muted-foreground" />
                    <SelectValue placeholder="All Tags" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {allTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto justify-end">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <Checkbox
                  checked={showBrochureSentOnly}
                  onCheckedChange={(checked) => setShowBrochureSentOnly(checked as boolean)}
                />
                Brochure Sent
              </label>
              <div className="hidden sm:block h-6 w-px bg-border" />
              <Button
                variant={selectedLeads.length > 0 ? 'default' : 'outline'}
                onClick={handleExport}
                className={selectedLeads.length > 0 ? 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200' : ''}
              >
                <Download className="w-4 h-4 mr-2" />
                {selectedLeads.length > 0 ? `Export (${selectedLeads.length})` : 'Export All'}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <Checkbox
                      checked={filteredLeads.length > 0 && selectedLeads.length === filteredLeads.length}
                      onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                    />
                  </TableHead>
                  <TableHead>Lead Details</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Follow Up</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <TableRow
                    key={lead._id}
                    className={selectedLeads.includes(lead._id) ? 'bg-muted/50' : ''}
                  >
                    <TableCell className="text-center">
                      <Checkbox
                        checked={selectedLeads.includes(lead._id)}
                        onCheckedChange={(checked) => handleSelectRow(lead._id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{getLeadName(lead)}</span>
                          {lead.projectId && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {lead.projectId.name || 'Project'}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(lead.createdAt).toLocaleDateString()}</span>
                          <span>|</span>
                          <span>
                            {new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex gap-1 mt-2 flex-wrap items-center">
                          <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wide px-1.5 py-0 h-4 rounded-sm">
                            {lead.source || 'website'}
                          </Badge>
                          {lead.isBrochureSent && (
                            <Badge className="text-[10px] bg-green-100 text-green-700 hover:bg-green-100 border-transparent px-1.5 py-0 h-4 rounded-sm flex items-center gap-0.5">
                              <CheckCircle className="w-3 h-3" /> Brochure
                            </Badge>
                          )}
                          {lead.tags?.slice(0, 2).map((tag, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              className="text-[10px] bg-red-50 text-red-600 border-red-100 px-1.5 py-0 h-4 rounded-sm hover:bg-red-100"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {lead.tags && lead.tags.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{lead.tags.length - 2}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <a
                            href={`tel:${getLeadPhone(lead)}`}
                            className="text-sm font-medium hover:text-primary transition-colors"
                          >
                            {getLeadPhone(lead)}
                          </a>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                              onClick={() => handleCall(getLeadPhone(lead))}
                            >
                              <Phone className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-full bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700"
                              onClick={() => handleWhatsApp(getLeadPhone(lead), getLeadName(lead))}
                            >
                              <MessageCircle className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={lead.email}>
                          {lead.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={lead.status}
                        onValueChange={(val) => handleStatusChange(lead._id, val)}
                      >
                        <SelectTrigger className={`h-8 text-xs font-bold uppercase tracking-wide w-[150px] ${getStatusClass(lead.status)}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s} className="normal-case">
                              {s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {lead.nextFollowUp ? (
                        <div className="text-xs flex items-center gap-1.5 text-orange-600 bg-orange-50 px-2 py-1 rounded-md inline-flex border border-orange-100">
                          <Clock className="w-3 h-3" />
                          {new Date(lead.nextFollowUp).toLocaleDateString()}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No follow-up</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLead(lead)}
                        className="hover:text-primary hover:bg-primary/10"
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLeads.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Search className="w-8 h-8 opacity-20" />
                        <p>No leads found matching your filters.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedLead && (
        <LeadDetailsModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
        />
      )}
    </div>
  );
};

export default Leads;
