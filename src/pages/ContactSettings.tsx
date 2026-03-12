import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import api from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ContactSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    phoneNumber: '+91 9876543210',
    whatsappNumber: '+91 9876543210',
    email: 'contact@redfit.in',
  });

  useEffect(() => {
    fetchContactDetails();
  }, []);

  const fetchContactDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get('/contact');
      // Backend returns: { success: true, data: contact }
      // API interceptor normalizes to: contact or { data: contact }
      const contactData = response.data?.success && response.data?.data 
        ? response.data.data 
        : response.data?.data 
        ? response.data.data 
        : response.data;
      if (contactData) {
        setFormData(contactData);
      }
    } catch (error: any) {
      console.error('Failed to fetch contact details:', error);
      alert('Failed to load contact details');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/contact', formData);
      alert('Contact details updated successfully!');
    } catch (error: any) {
      console.error('Failed to update contact details:', error);
      alert(error.response?.data?.message || 'Failed to update contact details');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/settings')}
          className="text-muted-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Contact Details</h1>
        <p className="text-sm text-muted-foreground mt-2">Manage contact information displayed on the contact us page</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Phone Number <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  required
                  value={formData.phoneNumber}
                  onChange={(e) => handleChange('phoneNumber', e.target.value)}
                  placeholder="+91 9876543210"
                />
                <p className="text-[10px] text-muted-foreground">Phone number for customers to call</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  WhatsApp Number <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  required
                  value={formData.whatsappNumber}
                  onChange={(e) => handleChange('whatsappNumber', e.target.value)}
                  placeholder="+91 9876543210"
                />
                <p className="text-[10px] text-muted-foreground">WhatsApp number for customers to message</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Email <span className="text-destructive">*</span>
                </label>
                <Input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="contact@redfit.in"
                />
                <p className="text-[10px] text-muted-foreground">Email address for customer inquiries</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/settings')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default ContactSettings;

