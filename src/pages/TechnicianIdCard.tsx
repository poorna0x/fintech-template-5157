import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, Phone, Mail, Briefcase, Building2, MapPin, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CompanyInfo } from '@/types';
import Logo from '@/components/Logo';

// Company information (same as in BillGenerator)
const companyInfo: CompanyInfo = {
  name: "Authorised Service Franchise",
  address: "Ground Floor, 13, 4th Main Road, Next To Jain Temple,Seshadripuram, Kumara Park West",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560020",
  phone: "9886944288 & 8884944288",
  email: "mail@hydrogenro.com",
  gstNumber: "29LIJPS5140P1Z6",
  panNumber: "LIJPS5140P",
  website: "hydrogenro.com"
};

interface TechnicianData {
  id: string;
  full_name: string;
  employee_id: string;
  phone: string;
  email: string;
  photo?: string;
  status?: string;
}

const TechnicianIdCard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [technician, setTechnician] = useState<TechnicianData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTechnician = async () => {
      if (!id) {
        setError('Invalid technician ID');
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('technicians')
          .select('id, full_name, employee_id, phone, email, photo, status')
          .eq('id', id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (data) {
          setTechnician(data);
        } else {
          setError('Technician not found');
        }
      } catch (err: any) {
        console.error('Error loading technician:', err);
        setError(err.message || 'Failed to load technician information');
      } finally {
        setLoading(false);
      }
    };

    loadTechnician();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading ID card...</p>
        </div>
      </div>
    );
  }

  if (error || !technician) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-sm bg-white border border-gray-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <User className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">ID Card Not Found</h2>
              <p className="text-sm text-gray-600">{error || 'The requested technician ID card could not be found.'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-sm mx-auto">
        {/* ID Card */}
        <Card className="bg-white border border-gray-200 shadow-lg overflow-hidden">
          <CardContent className="p-0">
            {/* Header with Logo */}
            <div className="bg-gradient-to-r from-primary to-primary/90 text-white px-4 py-4 sm:py-5">
              <div className="mb-2 sm:mb-3 flex justify-center [&_*]:text-white">
                <Logo />
              </div>
              <h1 className="text-sm sm:text-base font-semibold mb-0.5 text-white text-center">{companyInfo.name}</h1>
              <p className="text-xs text-white/90 text-center">Authorized Service Technician</p>
            </div>

            {/* Photo and Basic Info */}
            <div className="px-4 py-4 sm:py-5">
              <div className="flex flex-col items-center mb-4 sm:mb-5">
                <div className="relative mb-3">
                  {technician.photo ? (
                    <img
                      src={technician.photo}
                      alt={technician.full_name}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-3 border-primary shadow-md"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className = 'w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary/10 flex items-center justify-center border-3 border-primary';
                          fallback.innerHTML = `<svg class="w-10 h-10 sm:w-12 sm:h-12 text-primary" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>`;
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary/10 flex items-center justify-center border-3 border-primary shadow-md">
                      <User className="w-10 h-10 sm:w-12 sm:h-12 text-primary" />
                    </div>
                  )}
                </div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-1 text-center">
                  {technician.full_name}
                </h2>
                <p className="text-xs sm:text-sm text-primary font-semibold">ID: {technician.employee_id}</p>
              </div>

              {/* Contact Details */}
              <div className="space-y-2.5 sm:space-y-3 border-t border-gray-200 pt-4">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  </div>
                  <span className="text-sm sm:text-base text-gray-800 font-medium">{technician.phone}</span>
                </div>
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  </div>
                  <span className="text-sm sm:text-base text-gray-800 font-medium break-all">{technician.email}</span>
                </div>
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  </div>
                  <span className="text-sm sm:text-base text-gray-800 font-medium">Service Technician</span>
                </div>
              </div>
            </div>

            {/* Company Details */}
            <div className="bg-gray-50 px-4 py-3 sm:py-4 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Company Details</p>
              <div className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700 leading-relaxed">
                    {companyInfo.address}, {companyInfo.city} - {companyInfo.pincode}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-gray-700">{companyInfo.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-gray-700">{companyInfo.email}</span>
                </div>
                {companyInfo.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-gray-700">{companyInfo.website}</span>
                  </div>
                )}
                <div className="flex items-start gap-2 pt-2 border-t border-gray-200">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="text-gray-700 block">GST: {companyInfo.gstNumber}</span>
                    <span className="text-gray-700 block">PAN: {companyInfo.panNumber}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Note */}
            <div className="bg-primary/5 px-4 py-2.5 sm:py-3 border-t border-gray-200">
              <p className="text-[10px] sm:text-xs text-gray-600 text-center leading-relaxed">
                This is an official ID card. Verify technician identity before service.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TechnicianIdCard;

