import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, Phone, Mail, Briefcase, Building2, MapPin, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CompanyInfo } from '@/types';
import Logo from '@/components/Logo';
import Header from '@/components/Header';
import { useTheme } from '@/contexts/ThemeContext';

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
  const { isDarkMode } = useTheme();
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
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading ID card...</p>
        </div>
      </div>
    );
  }

  if (error || !technician) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm bg-card border border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <User className="w-6 h-6 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold text-card-foreground mb-1">ID Card Not Found</h2>
              <p className="text-sm text-muted-foreground">{error || 'The requested technician ID card could not be found.'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="p-4">
        <div className="max-w-sm mx-auto">
        {/* ID Card */}
        <Card className="bg-card border-2 border-primary/20 dark:border-primary/30 shadow-xl overflow-hidden rounded-xl">
          <CardContent className="p-0">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground px-4 py-4 sm:py-5">
              <h1 className="text-base sm:text-lg font-bold text-primary-foreground text-center mb-1">{technician.full_name}</h1>
              <p className="text-xs sm:text-sm text-primary-foreground/90 text-center">Employee ID: {technician.employee_id}</p>
              <p className="text-xs text-primary-foreground/80 text-center mt-1">Service Technician</p>
            </div>

            {/* Photo and Basic Info */}
            <div className="px-4 py-4 sm:py-5">
              <div className="flex flex-col items-center mb-4 sm:mb-5">
                <div className="relative mb-3">
                  {technician.photo ? (
                    <img
                      src={technician.photo}
                      alt={technician.full_name}
                      className="w-28 h-28 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-primary shadow-lg"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className = `w-28 h-28 sm:w-24 sm:h-24 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center border-4 border-primary shadow-lg`;
                          fallback.innerHTML = `<svg class="w-14 h-14 sm:w-12 sm:h-12 text-primary" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>`;
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : (
                    <div className="w-28 h-28 sm:w-24 sm:h-24 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center border-4 border-primary shadow-lg">
                      <User className="w-14 h-14 sm:w-12 sm:h-12 text-primary" />
                    </div>
                  )}
                </div>
              </div>

              {/* Contact Details */}
              <div className="space-y-2.5 sm:space-y-3 border-t border-border pt-4">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  </div>
                  <span className="text-sm sm:text-base text-card-foreground font-medium">{technician.phone}</span>
                </div>
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  </div>
                  <span className="text-sm sm:text-base text-card-foreground font-medium break-all">{technician.email}</span>
                </div>
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  </div>
                  <span className="text-sm sm:text-base text-card-foreground font-medium">Service Technician</span>
                </div>
              </div>
            </div>

            {/* Company Details */}
            <div className="bg-muted/50 dark:bg-muted/30 px-4 py-3 sm:py-4 border-t border-border">
              <p className="text-xs font-semibold text-card-foreground mb-3 uppercase tracking-wide">Company Details</p>
              <div className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground leading-relaxed">
                    {companyInfo.address}, {companyInfo.city} - {companyInfo.pincode}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">{companyInfo.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">{companyInfo.email}</span>
                </div>
                {companyInfo.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-muted-foreground">{companyInfo.website}</span>
                  </div>
                )}
                <div className="flex items-start gap-2 pt-2 border-t border-border">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="text-muted-foreground block">GST: {companyInfo.gstNumber}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Note */}
            <div className="bg-primary/5 dark:bg-primary/10 px-4 py-2.5 sm:py-3 border-t border-border">
              <p className="text-[10px] sm:text-xs text-muted-foreground text-center leading-relaxed">
                This is an official ID card. Verify technician identity before service.
              </p>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default TechnicianIdCard;

