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
  ArrowRight,
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
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    companyName: '',
    contactEmail: '',
    contactPhone: '',
    website: '',
    address: '',
    city: '',
    state: '',
    country: 'India',
    postalCode: '',
    gstNumber: '',
    panNumber: '',
    businessDescription: '',
    expectedMonthlyVolume: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.partner.submitApplication.mutate({
        companyName: formData.companyName,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
        website: formData.website || undefined,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        country: formData.country,
        postalCode: formData.postalCode,
        gstNumber: formData.gstNumber || undefined,
        panNumber: formData.panNumber || undefined,
        businessDescription: formData.businessDescription,
        expectedMonthlyVolume: formData.expectedMonthlyVolume,
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
              {/* Step Indicator */}
              <div className="flex items-center gap-4 mb-8">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    step === 1
                      ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="h-6 w-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs">
                    1
                  </span>
                  Company Info
                </button>
                <ArrowRight className="h-4 w-4 text-gray-400" />
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    step === 2
                      ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span
                    className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${
                      step >= 2
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    2
                  </span>
                  Business Details
                </button>
              </div>

              {step === 1 && (
                <>
                  {/* Company Information */}
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
                        <Label htmlFor="contactPhone">Contact Phone *</Label>
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
                            required
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2 space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            id="website"
                            value={formData.website}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, website: e.target.value }))
                            }
                            className="pl-10"
                            placeholder="https://yourcompany.com"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <MapPin className="h-5 w-5 text-gray-400" />
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Address
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2 space-y-2">
                        <Label htmlFor="address">Street Address *</Label>
                        <Textarea
                          id="address"
                          value={formData.address}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, address: e.target.value }))
                          }
                          rows={2}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="city">City *</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, city: e.target.value }))
                          }
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="state">State / Province *</Label>
                        <Input
                          id="state"
                          value={formData.state}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, state: e.target.value }))
                          }
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="country">Country *</Label>
                        <Input
                          id="country"
                          value={formData.country}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, country: e.target.value }))
                          }
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="postalCode">Postal Code *</Label>
                        <Input
                          id="postalCode"
                          value={formData.postalCode}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, postalCode: e.target.value }))
                          }
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="button" onClick={() => setStep(2)}>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  {/* Tax Information */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <FileText className="h-5 w-5 text-gray-400" />
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Tax Information
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="gstNumber">GST Number</Label>
                        <Input
                          id="gstNumber"
                          value={formData.gstNumber}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, gstNumber: e.target.value }))
                          }
                          placeholder="22AAAAA0000A1Z5"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Required for GST invoicing in India
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="panNumber">PAN Number</Label>
                        <Input
                          id="panNumber"
                          value={formData.panNumber}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, panNumber: e.target.value }))
                          }
                          placeholder="AAAAA0000A"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Business Details */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <Handshake className="h-5 w-5 text-gray-400" />
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Business Details
                      </h2>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="businessDescription">
                          Tell us about your business *
                        </Label>
                        <Textarea
                          id="businessDescription"
                          value={formData.businessDescription}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              businessDescription: e.target.value,
                            }))
                          }
                          rows={4}
                          placeholder="What industry do you serve? How do you plan to use Nubo email services?"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="expectedMonthlyVolume">
                          Expected Monthly Volume (Users) *
                        </Label>
                        <Input
                          id="expectedMonthlyVolume"
                          value={formData.expectedMonthlyVolume}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              expectedMonthlyVolume: e.target.value,
                            }))
                          }
                          placeholder="e.g., 100-500 users"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {loading ? 'Submitting...' : 'Submit Application'}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
