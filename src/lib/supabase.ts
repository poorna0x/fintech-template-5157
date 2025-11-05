import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug logging in development
if (import.meta.env.DEV) {
  console.log('[Supabase Config] URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
  console.log('[Supabase Config] Anon Key:', supabaseAnonKey ? '✓ Set (' + supabaseAnonKey.substring(0, 20) + '...)' : '✗ Missing');
}

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMsg = `Missing Supabase environment variables. URL: ${!!supabaseUrl}, Key: ${!!supabaseAnonKey}`;
  console.error('[Supabase Config]', errorMsg);
  throw new Error(errorMsg);
}

// Create Supabase client with better error handling for local development
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Use localStorage for session persistence (works across HTTP/HTTPS)
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Don't redirect on auth errors - let the app handle it
    flowType: 'pkce',
  },
  global: {
    // Better error handling and ensure API key is sent
    fetch: (url, options = {}) => {
      // Ensure apikey header is always included
      // Convert headers to a plain object if needed, then back to Headers
      const existingHeaders = options.headers || {};
      const headers = new Headers(existingHeaders instanceof Headers ? existingHeaders : existingHeaders);
      
      // Always set apikey header if not present (Supabase requires this)
      if (!headers.has('apikey') && supabaseAnonKey) {
        headers.set('apikey', supabaseAnonKey);
      }
      // Set Authorization header if not present (for auth requests)
      if (!headers.has('Authorization') && supabaseAnonKey) {
        headers.set('Authorization', `Bearer ${supabaseAnonKey}`);
      }
      
      // Log in development for debugging
      if (import.meta.env.DEV) {
        console.log('[Supabase Request]', url.toString());
        console.log('[Supabase Headers]', {
          hasApikey: headers.has('apikey'),
          hasAuthorization: headers.has('Authorization'),
        });
      }
      
      return fetch(url, {
        ...options,
        headers: headers,
      }).catch((error) => {
        // Log fetch errors for debugging
        if (import.meta.env.DEV) {
          console.error('[Supabase Fetch Error]', error);
        }
        throw error;
      });
    },
  },
});

// Database helper functions
export const db = {
  // Customer operations
  customers: {
    async create(customer: Database['public']['Tables']['customers']['Insert']) {
      // Generate customer ID if not provided
      if (!customer.customer_id) {
        const { data: generatedId, error: idError } = await supabase
          .rpc('generate_customer_id');
        
        if (idError) {
          return { data: null, error: idError };
        }
        
        customer.customer_id = generatedId;
      }

      const { data, error } = await supabase
        .from('customers')
        .insert(customer)
        .select()
        .single();
      
      return { data, error };
    },
    
    async getById(id: string) {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();
      
      return { data, error };
    },
    
    async getByPhone(phone: string) {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();
      
      return { data, error };
    },
    
    async update(id: string, updates: Database['public']['Tables']['customers']['Update']) {
      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', id)
        .select();
      
      if (error) {
        return { data: null, error };
      }
      
      // Return the first (and should be only) updated row
      const result = { data: data?.[0] || null, error: null };
      return result;
    },
    
    async getAll() {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async search(query: string) {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .or(`customer_id.ilike.%${query}%,full_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_id', customerId)
        .single();
      
      return { data, error };
    }
  },
  
  // Job operations
  jobs: {
    async create(job: Database['public']['Tables']['jobs']['Insert']) {
      const { data, error } = await supabase
        .from('jobs')
        .insert(job)
        .select()
        .single();
      
      return { data, error };
    },
    
    async getById(id: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          customer:customers(
            id,
            customer_id,
            full_name,
            phone,
            email,
            alternate_phone,
            address,
            location,
            service_type,
            brand,
            model,
            installation_date,
            warranty_expiry,
            status,
            customer_since,
            last_service_date,
            notes,
            preferred_time_slot,
            preferred_language,
            created_at,
            updated_at
          )
        `)
        .eq('id', id)
        .single();
      
      return { data, error };
    },
    
    async getByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async getAll() {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          customer:customers(
            id,
            customer_id,
            full_name,
            phone,
            email,
            alternate_phone,
            address,
            location,
            service_type,
            brand,
            model,
            installation_date,
            warranty_expiry,
            status,
            customer_since,
            last_service_date,
            notes,
            preferred_time_slot,
            preferred_language,
            created_at,
            updated_at
          )
        `)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async update(id: string, updates: Database['public']['Tables']['jobs']['Update']) {
      const { data, error } = await supabase
        .from('jobs')
        .update(updates)
        .eq('id', id)
        .select();
      
      if (error) {
        return { data: null, error };
      }
      
      // Return the first (and should be only) updated row
      return { data: data?.[0] || null, error: null };
    },
    
    async getByStatus(status: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          customer:customers(*)
        `)
        .eq('status', status)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async getByTechnicianId(technicianId: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          customer:customers(*)
        `)
        .eq('assigned_technician_id', technicianId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async delete(id: string) {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', id);
      
      return { data: null, error };
    },

    // Get job counts by status (for stats without loading all data)
    async getCounts() {
      try {
        const [ongoingResult, followupResult, deniedResult, completedResult] = await Promise.all([
          supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['PENDING', 'ASSIGNED', 'IN_PROGRESS']),
          supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['FOLLOW_UP', 'RESCHEDULED']),
          supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['DENIED', 'CANCELLED']),
          supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'COMPLETED')
        ]);
        
        return {
          data: {
            ongoing: ongoingResult.count || 0,
            followup: followupResult.count || 0,
            denied: deniedResult.count || 0,
            completed: completedResult.count || 0
          },
          error: ongoingResult.error || followupResult.error || deniedResult.error || completedResult.error
        };
      } catch (error) {
        console.error('Error in getCounts:', error);
        return {
          data: { ongoing: 0, followup: 0, denied: 0, completed: 0 },
          error: error instanceof Error ? error : new Error('Unknown error')
        };
      }
    },

    // Get jobs by status with pagination
    async getByStatusPaginated(statuses: string[], page: number = 1, pageSize: number = 20) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await supabase
        .from('jobs')
        .select(`
          *,
          customer:customers(
            id,
            customer_id,
            full_name,
            phone,
            email,
            alternate_phone,
            address,
            location,
            service_type,
            brand,
            model,
            installation_date,
            warranty_expiry,
            status,
            customer_since,
            last_service_date,
            notes,
            preferred_time_slot,
            preferred_language,
            created_at,
            updated_at
          )
        `, { count: 'exact' })
        .in('status', statuses)
        .order('created_at', { ascending: false })
        .range(from, to);
      
      return { 
        data: data || [], 
        error, 
        count: count || 0,
        page,
        pageSize,
        totalPages: count ? Math.ceil(count / pageSize) : 0
      };
    },

    // Get ongoing jobs (PENDING, ASSIGNED, IN_PROGRESS) - no pagination needed as they're usually fewer
    async getOngoing() {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          customer:customers(
            id,
            customer_id,
            full_name,
            phone,
            email,
            alternate_phone,
            address,
            location,
            service_type,
            brand,
            model,
            installation_date,
            warranty_expiry,
            status,
            customer_since,
            last_service_date,
            notes,
            preferred_time_slot,
            preferred_language,
            created_at,
            updated_at
          )
        `)
        .in('status', ['PENDING', 'ASSIGNED', 'IN_PROGRESS'])
        .order('created_at', { ascending: false });
      
      return { data: data || [], error };
    }
  },
  
  // Technician operations
  technicians: {
    async create(technician: Database['public']['Tables']['technicians']['Insert']) {
      const { data, error } = await supabase
        .from('technicians')
        .insert(technician)
        .select()
        .single();
      
      return { data, error };
    },
    
    async getById(id: string) {
      const { data, error } = await supabase
        .from('technicians')
        .select('*')
        .eq('id', id)
        .single();
      
      return { data, error };
    },
    
    async getAll() {
      const { data, error } = await supabase
        .from('technicians')
        .select('*')
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async getAvailable() {
      const { data, error } = await supabase
        .from('technicians')
        .select('*')
        .eq('status', 'AVAILABLE')
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async update(id: string, updates: Database['public']['Tables']['technicians']['Update']) {
      const { data, error } = await supabase
        .from('technicians')
        .update(updates)
        .eq('id', id)
        .select();
      
      if (error) {
        return { data: null, error };
      }
      
      // Return the first (and should be only) updated row
      return { data: data?.[0] || null, error: null };
    },
    
    async delete(id: string) {
      const { error } = await supabase
        .from('technicians')
        .delete()
        .eq('id', id);
      
      return { data: null, error };
    }
  },

  // Job Assignment Request operations
  jobAssignmentRequests: {
    async create(request: Database['public']['Tables']['job_assignment_requests']['Insert']) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .insert(request)
        .select()
        .single();
      
      return { data, error };
    },

    async createMultiple(requests: Database['public']['Tables']['job_assignment_requests']['Insert'][]) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .insert(requests)
        .select();
      
      return { data, error };
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .select(`
          *,
          job:jobs(
            id,
            job_number,
            service_type,
            service_sub_type,
            brand,
            model,
            scheduled_date,
            scheduled_time_slot,
            description,
            estimated_cost,
            priority,
            status,
            customer:customers(
              id,
              customer_id,
              full_name,
              phone,
              email,
              address,
              location
            )
          ),
          technician:technicians(
            id,
            full_name,
            phone,
            email,
            employee_id,
            status
          )
        `)
        .eq('id', id)
        .single();
      
      return { data, error };
    },

    async getByJobId(jobId: string) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .select(`
          *,
          technician:technicians(
            id,
            full_name,
            phone,
            email,
            employee_id,
            status
          )
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getByTechnicianId(technicianId: string) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .select(`
          *,
          job:jobs(
            id,
            job_number,
            service_type,
            service_sub_type,
            brand,
            model,
            scheduled_date,
            scheduled_time_slot,
            description,
            estimated_cost,
            priority,
            status,
            customer:customers(
              id,
              customer_id,
              full_name,
              phone,
              email,
              address,
              location
            )
          )
        `)
        .eq('technician_id', technicianId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getPendingByTechnicianId(technicianId: string) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .select(`
          *,
          job:jobs(
            id,
            job_number,
            service_type,
            service_sub_type,
            brand,
            model,
            scheduled_date,
            scheduled_time_slot,
            description,
            estimated_cost,
            priority,
            status,
            customer:customers(
              id,
              customer_id,
              full_name,
              phone,
              email,
              address,
              location
            )
          )
        `)
        .eq('technician_id', technicianId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async update(id: string, updates: Database['public']['Tables']['job_assignment_requests']['Update']) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .update(updates)
        .eq('id', id)
        .select();
      
      if (error) {
        return { data: null, error };
      }
      
      // Return the first (and should be only) updated row
      return { data: data?.[0] || null, error: null };
    },

    async respondToRequest(requestId: string, status: 'ACCEPTED' | 'REJECTED', responseNotes?: string) {
      // First check if the request is still pending
      const { data: currentRequest, error: fetchError } = await supabase
        .from('job_assignment_requests')
        .select('status, job_id')
        .eq('id', requestId)
        .single();

      if (fetchError) {
        return { data: null, error: fetchError };
      }

      if (currentRequest.status !== 'PENDING') {
        return { 
          data: null, 
          error: { 
            message: 'This assignment request is no longer available. It may have been accepted by another technician.',
            code: 'ALREADY_PROCESSED'
          } 
        };
      }

      const { data, error } = await supabase
        .from('job_assignment_requests')
        .update({
          status,
          responded_at: new Date().toISOString(),
          response_notes: responseNotes
        })
        .eq('id', requestId)
        .eq('status', 'PENDING') // Only update if still pending
        .select();
      
      if (error) {
        return { data: null, error };
      }

      // If no rows were updated, it means the request was already processed
      if (!data || data.length === 0) {
        return { 
          data: null, 
          error: { 
            message: 'This assignment request is no longer available. It may have been accepted by another technician.',
            code: 'ALREADY_PROCESSED'
          } 
        };
      }
      
      return { data: data[0], error: null };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('job_assignment_requests')
        .delete()
        .eq('id', id);
      
      return { data: null, error };
    },

    async deleteByJobId(jobId: string) {
      const { error } = await supabase
        .from('job_assignment_requests')
        .delete()
        .eq('job_id', jobId);
      
      return { data: null, error };
    }
  }
};

// Utility functions
export const generateJobNumber = (serviceType: string, year: number = new Date().getFullYear()) => {
  const prefix = serviceType.toUpperCase();
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}-${year}-${timestamp}`;
};

export const validatePincode = async (pincode: string): Promise<boolean> => {
  // This would typically check against your service area database
  // For now, we'll return true for demo purposes
  // You can implement actual pincode validation here
  return pincode.length === 6 && /^\d+$/.test(pincode);
};
