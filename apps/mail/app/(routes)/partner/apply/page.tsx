'use client';

import { api } from '@/lib/trpc';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Handshake,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  FileText,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function PartnerApplyPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    companyWebsite: '',
    companyAddress: '',
    companyGst: '',
    businessDescription: '',
    expectedMonthlySales: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.partner.submitApplication.mutate({
        companyName: formData.companyName,
        contactName: formData.contactName,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone || undefined,
        companyWebsite: formData.companyWebsite || undefined,
        companyAddress: formData.companyAddress || undefined,
        companyGst: formData.companyGst || undefined,
        businessDescription: formData.businessDescription || undefined,
        expectedMonthlySales: formData.expectedMonthlySales || undefined,
      });
      toast.success('Application submitted successfully');
      navigate('/partner');
    } catch (error: any) {
      console.error('Failed to submit application:', error);
      toast.error(error.message || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  const benefits = [
    { icon: Check, text: 'Up to 35% discount on all plans' },
    { icon: Check, text: 'Unlimited organizations' },
    { icon: Check, text: 'Priority support' },
    { icon: Check, text: 'White-label options' },
    { icon: Check, text: 'Dedicated account manager' },
    { icon: Check, text: 'Monthly performance reports' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 mb-6">
            <Handshake className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Become a Nubo Partner
          </h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
            Join our partner program and unlock exclusive benefits. Grow your business while
            providing enterprise email solutions to your customers.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Benefits Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sticky top-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Partner Benefits
              </h2>
              <ul className="space-y-3">
                {benefits.map((benefit) => (
                  <li key={benefit.text} className="flex items-start gap-3">
                    <div className="h-5 w-5 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center shrink-0 mt-0.5">
                      <benefit.icon className="h-3 w-3 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-gray-600 dark:text-gray-300">{benefit.text}</span>
                  </li>
                ))}
              </ul>

              {/* Tier Info */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                  Partner Tiers
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Entry</span>
                    <span className="font-medium text-gray-900 dark:text-white">20% discount</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Bronze</span>
                    <span className="font-medium text-gray-900 dark:text-white">25% discount</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Silver</span>
                    <span className="font-medium text-gray-900 dark:text-white">30% discount</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Gold</span>
                    <span className="font-medium text-gray-900 dark:text-white">35% discount</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Application Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Form */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Building2 className="h-5 w-5 text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Company Information
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input
                      id="companyName"
                      value={formData.companyName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, companyName: e.target.value }))
                      }
                      placeholder="Your Company Name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactName">Contact Person Name *</Label>
                    <Input
                      id="contactName"
                      value={formData.contactName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, contactName: e.target.value }))
                      }
                      placeholder="John Doe"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">Contact Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="contactEmail"
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, contactEmail: e.target.value }))
                        }
                        className="pl-10"
                        placeholder="contact@company.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactPhone">Contact Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="contactPhone"
                        type="tel"
                        value={formData.contactPhone}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, contactPhone: e.target.value }))
                        }
                        className="pl-10"
                        placeholder="+91 9876543210"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyWebsite">Website</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="companyWebsite"
                        value={formData.companyWebsite}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, companyWebsite: e.target.value }))
                        }
                        className="pl-10"
                        placeholder="https://yourcompany.com"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="companyAddress">Company Address</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Textarea
                        id="companyAddress"
                        value={formData.companyAddress}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, companyAddress: e.target.value }))
                        }
                        className="pl-10"
                        rows={2}
                        placeholder="Full company address"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyGst">GST Number</Label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="companyGst"
                        value={formData.companyGst}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, companyGst: e.target.value }))
                        }
                        className="pl-10"
                        placeholder="22AAAAA0000A1Z5"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expectedMonthlySales">Expected Monthly Sales</Label>
                    <Input
                      id="expectedMonthlySales"
                      value={formData.expectedMonthlySales}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, expectedMonthlySales: e.target.value }))
                      }
                      placeholder="e.g., ₹50,000 - ₹1,00,000"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="businessDescription">Tell us about your business</Label>
                    <Textarea
                      id="businessDescription"
                      value={formData.businessDescription}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, businessDescription: e.target.value }))
                      }
                      rows={4}
                      placeholder="What industry do you serve? How do you plan to use Nubo email services?"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {loading ? 'Submitting...' : 'Submit Application'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
