import React, { useState, useEffect } from 'react';
import { X, Send, Clock, CheckCircle, Smartphone, Mail, FileText, Tag, Calendar } from 'lucide-react';
import { leadsAPI } from '../../services/api';

interface Lead {
  _id: string;
  fullName?: string;
  name?: string;
  mobileNumber?: string;
  phone?: string;
  email?: string;
  status: string;
  source?: string;
  address?: string;
  city?: string;
  state?: string;
  alternatePhones?: string[];
  tags?: string[];
  isBrochureSent?: boolean;
  nextFollowUp?: string;
  budget?: string;
  history?: Array<{ action: string; details: string; date: string }>;
  createdAt: string;
}

interface LeadDetailsModalProps {
  lead: Lead;
  onClose: () => void;
  onUpdate: (lead: Lead) => void;
}

const formatDateForInput = (dateString?: string) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const LeadDetailsModal: React.FC<LeadDetailsModalProps> = ({ lead, onClose, onUpdate }) => {
  const getLeadName = () => lead.fullName || lead.name || 'Unknown';
  const getLeadPhone = () => lead.mobileNumber || lead.phone || '';

  const [note, setNote] = useState('');
  const [isBrochureSent, setIsBrochureSent] = useState(lead.isBrochureSent || false);
  const [tags, setTags] = useState<string[]>(lead.tags || []);
  const [followUpDate, setFollowUpDate] = useState(formatDateForInput(lead.nextFollowUp));
  const [budget, setBudget] = useState(lead.budget || '');
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: getLeadName(),
    email: lead.email || '',
    phone: getLeadPhone(),
    source: lead.source || '',
    address: lead.address || '',
    city: lead.city || '',
    state: lead.state || '',
  });
  const [alternatePhones, setAlternatePhones] = useState<string[]>(lead.alternatePhones || []);
  const [newPhone, setNewPhone] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setIsBrochureSent(lead.isBrochureSent || false);
    setTags(lead.tags || []);
    setFollowUpDate(formatDateForInput(lead.nextFollowUp));
    setBudget(lead.budget || '');
    setFormData({
      name: getLeadName(),
      email: lead.email || '',
      phone: getLeadPhone(),
      source: lead.source || '',
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
    });
    setAlternatePhones(lead.alternatePhones || []);
  }, [lead]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSaveDetails = async () => {
    setLoading(true);
    try {
      const data = await leadsAPI.update(lead._id, {
        fullName: formData.name,
        email: formData.email,
        mobileNumber: formData.phone,
        source: formData.source,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        alternatePhones,
      });
      onUpdate(data as Lead);
      setIsEditing(false);
    } catch (error) {
      console.error('Update failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const addAlternatePhone = () => {
    if (newPhone.trim()) {
      setAlternatePhones([...alternatePhones, newPhone.trim()]);
      setNewPhone('');
    }
  };

  const removeAlternatePhone = (index: number) => {
    setAlternatePhones(alternatePhones.filter((_, i) => i !== index));
  };

  const handleDateChange = async (date: string) => {
    setFollowUpDate(date);
    try {
      const data = await leadsAPI.update(lead._id, { nextFollowUp: date ? new Date(date).toISOString() : null });
      onUpdate(data as Lead);
    } catch (error) {
      console.error('Failed to update follow up:', error);
    }
  };

  const handleBudgetUpdate = async () => {
    if (budget === lead.budget) return;
    try {
      const data = await leadsAPI.update(lead._id, { budget });
      onUpdate(data as Lead);
    } catch (error) {
      console.error('Failed to update budget:', error);
    }
  };

  const handleAddNote = async () => {
    if (!note.trim()) return;
    setLoading(true);
    try {
      const data = await leadsAPI.update(lead._id, {
        notes: note,
        logHistory: { action: 'Note Added', details: note },
      });
      onUpdate(data as Lead);
      setNote('');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBrochure = async () => {
    const newValue = !isBrochureSent;
    setIsBrochureSent(newValue);
    try {
      const data = await leadsAPI.update(lead._id, { isBrochureSent: newValue });
      onUpdate(data as Lead);
    } catch (error) {
      console.error(error);
      setIsBrochureSent(!newValue);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      const newTags = [...tags, tagInput.trim()];
      setTags(newTags);
      setTagInput('');
      leadsAPI.update(lead._id, { tags: newTags }).then((data) => onUpdate(data as Lead));
    }
  };

  const removeTag = (tagToRemove: string) => {
    const newTags = tags.filter((t) => t !== tagToRemove);
    setTags(newTags);
    leadsAPI.update(lead._id, { tags: newTags }).then((data) => onUpdate(data as Lead));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row border border-slate-100">
        <div className="w-full md:w-5/12 bg-slate-50 p-6 md:p-8 border-r border-slate-200 overflow-y-auto">
          <div className="mb-8">
            {isEditing ? (
              <div className="space-y-4">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
                <input
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-lg text-slate-800 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                  placeholder="Lead Name"
                />
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveDetails}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative group">
                <div className="flex justify-between items-start">
                  <h2 className="text-2xl font-extrabold text-slate-900 leading-tight">{getLeadName()}</h2>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-red-600 text-xs font-semibold bg-red-50 hover:bg-red-100 px-3 py-1 rounded-full transition-colors"
                  >
                    Edit Profile
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                  <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-bold uppercase">
                    {lead.status}
                  </span>
                  <span>•</span>
                  <span>Added {new Date(lead.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-8">
            <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                Contact Details
              </h3>
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg"
                      placeholder="Primary Phone"
                    />
                    <input
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg"
                      placeholder="Email Address"
                    />
                    <input
                      name="source"
                      value={formData.source}
                      onChange={handleInputChange}
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg"
                      placeholder="Lead Source"
                    />
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <p className="text-xs font-bold text-slate-500 mb-2">Alternate Numbers</p>
                    {alternatePhones.map((p, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center text-sm mb-2 bg-white p-2 rounded border border-slate-200"
                      >
                        <span>{p}</span>
                        <X
                          className="w-4 h-4 cursor-pointer text-slate-400 hover:text-red-500"
                          onClick={() => removeAlternatePhone(i)}
                        />
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        className="flex-1 p-2 text-sm border border-slate-300 rounded-lg"
                        placeholder="+ Add Phone"
                      />
                      <button
                        onClick={addAlternatePhone}
                        className="bg-green-100 hover:bg-green-200 text-green-700 px-3 rounded-lg text-lg font-bold transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div className="flex items-center gap-3 group">
                    <div className="p-2 bg-red-50 text-red-600 rounded-lg group-hover:bg-red-100 transition-colors">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <span className="text-slate-700 font-medium">{getLeadPhone()}</span>
                    {lead.alternatePhones && lead.alternatePhones.length > 0 && (
                      <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        +{lead.alternatePhones.length} more
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 group">
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-100 transition-colors">
                      <Mail className="w-4 h-4" />
                    </div>
                    <span className="text-slate-700 text-sm break-all font-medium">
                      {lead.email || <span className="text-slate-400 italic">No email provided</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 group">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg group-hover:bg-orange-100 transition-colors">
                      <Tag className="w-4 h-4" />
                    </div>
                    <span className="text-slate-700 text-sm font-medium capitalize">
                      {lead.source || 'Website'}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {(lead.address || lead.city || lead.state || isEditing) && (
              <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                  Location
                </h3>
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg"
                      placeholder="Street Address"
                    />
                    <div className="flex gap-2">
                      <input
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        className="w-1/2 p-2 text-sm border border-slate-300 rounded-lg"
                        placeholder="City"
                      />
                      <input
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        className="w-1/2 p-2 text-sm border border-slate-300 rounded-lg"
                        placeholder="State"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-700">
                    <p className="font-medium">
                      {lead.address || <span className="text-slate-400 italic">No Street Address</span>}
                    </p>
                    <p className="text-slate-500">
                      {lead.city}
                      {lead.city && lead.state ? ', ' : ''}
                      {lead.state}
                    </p>
                  </div>
                )}
              </section>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Next Follow Up
                </label>
                <input
                  type="datetime-local"
                  value={followUpDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block p-2"
                />
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Budget Range
                </label>
                <input
                  type="text"
                  placeholder="e.g. 50L - 1Cr"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  onBlur={handleBudgetUpdate}
                  onKeyDown={(e) => e.key === 'Enter' && handleBudgetUpdate()}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block p-2"
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Tags</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-red-50 text-red-700 px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 border border-red-100"
                  >
                    {tag}
                    <X className="w-3 h-3 cursor-pointer hover:text-red-900" onClick={() => removeTag(tag)} />
                  </span>
                ))}
                {tags.length === 0 && <span className="text-xs text-slate-400 italic">No tags added</span>}
              </div>
              <input
                type="text"
                placeholder="+ Add new tag (Press Enter)"
                className="w-full text-sm bg-transparent border-b border-slate-200 focus:border-red-500 outline-none py-2 transition-colors placeholder:text-slate-400"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
              />
            </div>

            <div
              onClick={handleToggleBrochure}
              className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center gap-4 group ${
                isBrochureSent ? 'border-green-200 bg-green-50 shadow-sm' : 'border-slate-200 bg-white hover:border-red-300 hover:shadow-md'
              }`}
            >
              <div
                className={`p-2 rounded-full ${
                  isBrochureSent ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400 group-hover:bg-red-50 group-hover:text-red-500'
                }`}
              >
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <p className={`font-bold ${isBrochureSent ? 'text-green-800' : 'text-slate-700'}`}>
                  {isBrochureSent ? 'Brochure Sent' : 'Send Brochure'}
                </p>
                <p className="text-xs text-slate-500">
                  {isBrochureSent ? 'Lead has received project details' : 'Mark if you have shared details'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full md:w-7/12 flex flex-col bg-slate-50/50">
          <div className="p-5 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-red-600" />
              <span>Activity Timeline</span>
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-6 h-6 text-slate-400 hover:text-slate-700" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {lead.history && lead.history.length > 0 ? (
              [...lead.history]
                .reverse()
                .map((item, idx) => (
                  <div key={idx} className="flex gap-4 group">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-red-500 ring-4 ring-red-100 mt-1.5 group-first:bg-green-500 group-first:ring-green-100" />
                      <div className="w-0.5 h-full bg-slate-200 my-2 group-last:bg-transparent" />
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-1 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-slate-800 text-sm">{item.action}</span>
                        <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">
                          {new Date(item.date).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">{item.details}</p>
                    </div>
                  </div>
                ))
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <FileText className="w-12 h-12 mb-3 opacity-20" />
                <p>No history available yet</p>
              </div>
            )}
          </div>

          <div className="p-5 border-t border-slate-200 bg-white z-10">
            <div className="relative flex gap-3">
              <input
                type="text"
                placeholder="Add a note or update..."
                className="flex-1 bg-slate-100 border-none pl-5 pr-4 py-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all font-medium text-slate-700 placeholder:text-slate-400"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              />
              <button
                onClick={handleAddNote}
                disabled={loading || !note}
                className="px-5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-red-200 flex items-center justify-center"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadDetailsModal;
