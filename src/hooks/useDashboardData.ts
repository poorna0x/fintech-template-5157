import { useState, useCallback } from 'react';
import { db, supabase } from '@/lib/supabase';
import { Customer, Technician } from '@/types';
import { toast } from 'sonner';

// Transform technician data from database format to frontend format
const transformTechnicianData = (tech: any) => ({
  id: tech.id,
  fullName: tech.full_name,
  phone: tech.phone,
  email: tech.email,
  employeeId: tech.employee_id,
  status: tech.status || 'AVAILABLE',
  skills: tech.skills,
  serviceAreas: tech.service_areas,
  currentLocation: tech.current_location,
  workSchedule: tech.work_schedule,
  performance: tech.performance,
  vehicle: tech.vehicle,
  salary: tech.salary,
  qrCode: tech.qr_code || tech.qrCode || '',
  createdAt: tech.created_at,
  updatedAt: tech.updated_at
});

// Transform customer data from database format to frontend format
const transformCustomerData = (customer: any): Customer => ({
  id: customer.id,
  customerId: customer.customer_id,
  fullName: customer.full_name,
  phone: customer.phone,
  alternatePhone: customer.alternate_phone,
  email: customer.email,
  address: {
    street: customer.address?.street || '',
    area: customer.address?.area || '',
    city: customer.address?.city || '',
    state: customer.address?.state || '',
    pincode: customer.address?.pincode || '',
    landmark: customer.address?.landmark,
    visible_address: customer.visible_address || customer.address?.visible_address || ''
  },
  location: {
    latitude: customer.location?.latitude || 0,
    longitude: customer.location?.longitude || 0,
    formattedAddress: customer.location?.formatted_address || customer.location?.formattedAddress || '',
    googlePlaceId: customer.location?.google_place_id,
    googleLocation: customer.location?.googleLocation || null
  } as any,
  serviceType: customer.service_type,
  brand: customer.brand,
  model: customer.model,
  installationDate: customer.installation_date,
  warrantyExpiry: customer.warranty_expiry,
  status: customer.status,
  customerSince: customer.customer_since,
  lastServiceDate: customer.last_service_date,
  notes: customer.notes,
  preferredTimeSlot: customer.preferred_time_slot,
  customTime: (customer as any).custom_time || null,
  preferredLanguage: customer.preferred_language,
  serviceCost: customer.service_cost,
  costAgreed: customer.cost_agreed,
  has_prefilter: customer.has_prefilter ?? null,
  createdAt: customer.created_at,
  updatedAt: customer.updated_at
});

export const useDashboardData = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [customerAMCStatus, setCustomerAMCStatus] = useState<Record<string, boolean>>({});
  const [jobCounts, setJobCounts] = useState<{ongoing: number; followup: number; denied: number; completed: number}>({
    ongoing: 0,
    followup: 0,
    denied: 0,
    completed: 0
  });
  const [loading, setLoading] = useState(true);

  const loadDashboardData = useCallback(async (onJobsReload?: () => void) => {
    try {
      setLoading(true);
      
      // OPTIMIZATION: Run AMC job creation in background without blocking initial load
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          db.amcContracts.createAMCServiceJobs().then((result) => {
            if (result.error) {
              console.error('Error creating AMC service jobs:', result.error);
            } else if (result.created > 0) {
              console.log(`✅ Created ${result.created} AMC service jobs automatically`);
              toast.success(`Created ${result.created} AMC service job${result.created > 1 ? 's' : ''} automatically`);
              if (onJobsReload) onJobsReload();
            }
          }).catch((error) => {
            console.error('Error in AMC service job creation:', error);
          });
        }
      }).catch(() => {
        // Silently fail - auth check failed, skip AMC job creation
      });
      
      // OPTIMIZATION: Parallelize all independent data loading operations
      const [customersResult, techniciansResult, amcContractsResult, jobCountsResult] = await Promise.all([
        db.customers.getAll(),
        db.technicians.getAll(),
        supabase
          .from('amc_contracts')
          .select('customer_id, status')
          .eq('status', 'ACTIVE'),
        db.jobs.getCounts()
      ]);
      
      // Process AMC contracts
      const amcStatusMap: Record<string, boolean> = {};
      if (amcContractsResult.data) {
        amcContractsResult.data.forEach((amc: any) => {
          amcStatusMap[amc.customer_id] = true;
        });
      }
      setCustomerAMCStatus(amcStatusMap);

      // Process job counts
      if (jobCountsResult.data) {
        setJobCounts(jobCountsResult.data);
      }

      // Log errors for debugging
      if (customersResult.error) {
        toast.error(`Failed to load customers: ${customersResult.error.message}`);
      }
      if (techniciansResult.error) {
        console.error('Failed to load technicians:', techniciansResult.error);
      }

      if (customersResult.data) {
        const transformedCustomers = customersResult.data.map(transformCustomerData);
        setCustomers(transformedCustomers);
      } else {
        setCustomers([]);
      }
      
      if (techniciansResult.data) {
        const transformedTechnicians = techniciansResult.data.map(transformTechnicianData);
        setTechnicians(transformedTechnicians);
      } else {
        setTechnicians([]);
      }

    } catch (error) {
      toast.error(`Failed to load dashboard data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadTechnicians = useCallback(async () => {
    try {
      const { data, error } = await db.technicians.getAll();
      if (error) {
        console.error('Error reloading technicians:', error);
        return;
      }
      if (data) {
        const transformedTechnicians = data.map(transformTechnicianData);
        setTechnicians(transformedTechnicians);
      }
    } catch (error) {
      console.error('Error reloading technicians:', error);
    }
  }, []);

  return {
    customers,
    technicians,
    customerAMCStatus,
    jobCounts,
    loading,
    setCustomers,
    setTechnicians,
    setJobCounts,
    loadDashboardData,
    reloadTechnicians
  };
};

