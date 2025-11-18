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

// Use placeholder values during build if env vars are missing (prevents build failures)
// The app will fail at runtime if these are actually missing, but build will succeed
const buildTimeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const buildTimeKey = supabaseAnonKey || 'placeholder-key';

// Runtime validation - check if env vars are actually set when app runs
if (typeof window !== 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
  console.error('[Supabase Config] Missing environment variables at runtime!');
  console.error('[Supabase Config] URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
  console.error('[Supabase Config] Anon Key:', supabaseAnonKey ? '✓ Set' : '✗ Missing');
  console.error('[Supabase Config] Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables.');
}

// Create Supabase client with better error handling for local development
export const supabase = createClient<Database>(buildTimeUrl, buildTimeKey, {
  auth: {
    // Use localStorage for session persistence (works across HTTP/HTTPS)
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Don't redirect on auth errors - let the app handle it
    flowType: 'pkce',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    // Better error handling and ensure API key is sent
    fetch: (url, options = {}) => {
      // Ensure apikey header is always included
      // Convert headers to a plain object if needed, then back to Headers
      const existingHeaders = options.headers || {};
      const headers = new Headers(existingHeaders instanceof Headers ? existingHeaders : existingHeaders);
      
      // Always set apikey header if not present (Supabase requires this)
      const actualKey = supabaseAnonKey || buildTimeKey;
      if (!headers.has('apikey') && actualKey) {
        headers.set('apikey', actualKey);
      }
      // Set Authorization header if not present (for auth requests)
      if (!headers.has('Authorization') && actualKey) {
        headers.set('Authorization', `Bearer ${actualKey}`);
      }
      
      // Logging disabled to reduce console noise
      // Uncomment below for debugging if needed:
      // if (import.meta.env.DEV) {
      //   console.log('[Supabase Request]', url.toString());
      //   console.log('[Supabase Headers]', {
      //     hasApikey: headers.has('apikey'),
      //     hasAuthorization: headers.has('Authorization'),
      //   });
      // }
      
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
          customer:customers(
            id,
            customer_id,
            full_name,
            phone,
            email,
            alternate_phone,
            visible_address,
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
          ),
          assigned_technician:technicians!assigned_technician_id(
            id,
            full_name,
            phone,
            email,
            employee_id
          )
        `)
        .eq('assigned_technician_id', technicianId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    // Legacy function - keeping for backward compatibility
    async getByTechnicianIdOld(technicianId: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          service_address,
          service_location,
          customer:customers(
            id,
            customer_id,
            full_name,
            phone,
            alternate_phone,
            email,
            visible_address,
            address,
            location
          )
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
    async getByStatusPaginated(statuses: string[], page: number = 1, pageSize: number = 20, dateFilter?: string) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      let query = supabase
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
        `, { count: 'exact' });
      
      // If date filter is provided, filter by date based on status
      if (dateFilter) {
        const startOfDay = new Date(dateFilter);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(dateFilter);
        endOfDay.setHours(23, 59, 59, 999);
        
        if (statuses.includes('DENIED')) {
          // Filter DENIED jobs by denied_at date
          // Filter: DENIED jobs with denied_at in date range, OR CANCELLED jobs (show all cancelled regardless of date)
          if (statuses.includes('CANCELLED')) {
            query = query.or(`and(status.eq.DENIED,denied_at.gte.${startOfDay.toISOString()},denied_at.lte.${endOfDay.toISOString()}),status.eq.CANCELLED`);
          } else {
            // Only DENIED jobs, filter by date
            query = query
              .eq('status', 'DENIED')
              .gte('denied_at', startOfDay.toISOString())
              .lte('denied_at', endOfDay.toISOString());
          }
        } else if (statuses.includes('COMPLETED')) {
          // Filter COMPLETED jobs by completed_at date
          query = query
            .eq('status', 'COMPLETED')
            .gte('completed_at', startOfDay.toISOString())
            .lte('completed_at', endOfDay.toISOString());
        } else {
          // No date filter for this status, use normal status filter
          query = query.in('status', statuses);
        }
      } else {
        // No date filter, use normal status filter
        query = query.in('status', statuses);
      }
      
      const { data, error, count } = await query
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
            service_address,
            service_location,
            customer:customers(
              id,
              customer_id,
              full_name,
              phone,
              email,
              visible_address,
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
  },

  // Common QR Codes operations (for payment QR codes shared by all technicians)
  commonQrCodes: {
    async create(qrCode: { name: string; qr_code_url: string }) {
      const { data, error } = await supabase
        .from('common_qr_codes')
        .insert({
          name: qrCode.name,
          qr_code_url: qrCode.qr_code_url,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      return { data, error };
    },
    
    async getAll() {
      const { data, error } = await supabase
        .from('common_qr_codes')
        .select('*')
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async update(id: string, updates: { name?: string; qr_code_url?: string }) {
      const { data, error } = await supabase
        .from('common_qr_codes')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },
    
    async delete(id: string) {
      const { error } = await supabase
        .from('common_qr_codes')
        .delete()
        .eq('id', id);
      
      return { data: null, error };
    }
  },
  
  // Tax Invoices operations
  taxInvoices: {
    async create(invoice: any) {
      const { data, error } = await supabase
        .from('tax_invoices')
        .insert({
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          invoice_type: invoice.invoice_type,
          customer_id: invoice.customer_id || null,
          customer_name: invoice.customer_name,
          customer_address: invoice.customer_address,
          customer_phone: invoice.customer_phone,
          customer_email: invoice.customer_email,
          customer_gstin: invoice.customer_gstin,
          company_info: invoice.company_info,
          items: invoice.items,
          place_of_supply: invoice.place_of_supply,
          place_of_supply_code: invoice.place_of_supply_code,
          is_intra_state: invoice.is_intra_state,
          reverse_charge: invoice.reverse_charge || false,
          e_way_bill_no: invoice.e_way_bill_no,
          transport_mode: invoice.transport_mode,
          vehicle_no: invoice.vehicle_no,
          subtotal: invoice.subtotal,
          total_discount: invoice.total_discount || 0,
          service_charge: invoice.service_charge || 0,
          total_tax: invoice.total_tax,
          cgst: invoice.cgst || 0,
          sgst: invoice.sgst || 0,
          igst: invoice.igst || 0,
          round_off: invoice.round_off || 0,
          total_amount: invoice.total_amount,
          gst_breakup: invoice.gst_breakup,
          invoice_details: invoice.invoice_details,
          bank_details: invoice.bank_details,
          notes: invoice.notes || [],
          terms: invoice.terms,
          validity_note: invoice.validity_note,
          job_id: invoice.job_id || null,
          service_type: invoice.service_type
        })
        .select()
        .single();
      
      return { data, error };
    },
    
    async getAll(limit: number = 100, offset: number = 0) {
      const { data, error, count } = await supabase
        .from('tax_invoices')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      return { data, error, count };
    },
    
    async getByInvoiceNumber(invoiceNumber: string) {
      const { data, error } = await supabase
        .from('tax_invoices')
        .select('*')
        .eq('invoice_number', invoiceNumber)
        .single();
      
      return { data, error };
    },
    
    async getByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('tax_invoices')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async getNextInvoiceNumber() {
      // Call the database function to get next invoice number
      const { data, error } = await supabase.rpc('get_next_invoice_number');
      return { data, error };
    }
  },

  // Technician Payments operations
  technicianPayments: {
    async getAll() {
      const { data, error } = await supabase
        .from('technician_payments')
        .select(`
          *,
          technician:technicians(
            id,
            full_name,
            phone,
            email,
            employee_id
          ),
          job:jobs(
            id,
            job_number,
            service_type,
            service_sub_type,
            payment_amount,
            actual_cost,
            status
          )
        `)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getByTechnicianId(technicianId: string) {
      const { data, error } = await supabase
        .from('technician_payments')
        .select(`
          *,
          job:jobs(
            id,
            job_number,
            service_type,
            service_sub_type,
            payment_amount,
            actual_cost,
            status
          )
        `)
        .eq('technician_id', technicianId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('technician_payments')
        .update(updates)
        .eq('id', id)
        .select();
      
      return { data: data?.[0] || null, error };
    },

    async getSummary() {
      // Get summary stats for all technicians
      const { data, error } = await supabase
        .rpc('get_technician_payment_summary');
      
      return { data, error };
    },

    async createPaymentsForCompletedJobs() {
      // Call the backfill function to create payment records for completed jobs
      const { data, error } = await supabase
        .rpc('backfill_technician_payments');
      
      return { data, error };
    }
  },

  // Technician expenses operations
  technicianExpenses: {
    async getAll(technicianId?: string) {
      let query = supabase
        .from('technician_expenses')
        .select('*')
        .order('expense_date', { ascending: false });
      
      if (technicianId) {
        query = query.eq('technician_id', technicianId);
      }
      
      const { data, error } = await query;
      return { data, error };
    },

    async create(expense: any) {
      const { data, error } = await supabase
        .from('technician_expenses')
        .insert(expense)
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('technician_expenses')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('technician_expenses')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  // Technician advances operations
  technicianAdvances: {
    async getAll(technicianId?: string) {
      let query = supabase
        .from('technician_advances')
        .select('*')
        .order('advance_date', { ascending: false });
      
      if (technicianId) {
        query = query.eq('technician_id', technicianId);
      }
      
      const { data, error } = await query;
      return { data, error };
    },

    async create(advance: any) {
      const { data, error } = await supabase
        .from('technician_advances')
        .insert(advance)
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('technician_advances')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('technician_advances')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  // Technician extra commissions operations
  technicianExtraCommissions: {
    async getAll(technicianId?: string) {
      let query = supabase
        .from('technician_extra_commissions')
        .select('*')
        .order('commission_date', { ascending: false });
      
      if (technicianId) {
        query = query.eq('technician_id', technicianId);
      }
      
      const { data, error } = await query;
      return { data, error };
    },

    async create(commission: any) {
      const { data, error } = await supabase
        .from('technician_extra_commissions')
        .insert(commission)
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('technician_extra_commissions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('technician_extra_commissions')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  // Technician holidays operations
  technicianHolidays: {
    async getAll(technicianId?: string, startDate?: string, endDate?: string) {
      let query = supabase
        .from('technician_holidays')
        .select('*')
        .order('holiday_date', { ascending: false });
      
      if (technicianId) {
        query = query.eq('technician_id', technicianId);
      }
      
      if (startDate) {
        query = query.gte('holiday_date', startDate);
      }
      
      if (endDate) {
        query = query.lte('holiday_date', endDate);
      }
      
      const { data, error } = await query;
      return { data, error };
    },

    async create(holiday: any) {
      const { data, error } = await supabase
        .from('technician_holidays')
        .insert(holiday)
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('technician_holidays')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('technician_holidays')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  // Stats operations
  stats: {
    async getBillingByCustomer() {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          customer_id,
          customer:customers(
            id,
            customer_id,
            full_name,
            phone
          ),
          payment_amount,
          actual_cost,
          status
        `)
        .eq('status', 'COMPLETED')
        .not('payment_amount', 'is', null)
        .order('created_at', { ascending: false });
      
      if (error) return { data: null, error };
      
      // Group by customer
      const customerTotals: Record<string, any> = {};
      data?.forEach((job: any) => {
        const customerId = job.customer_id;
        const amount = job.payment_amount || job.actual_cost || 0;
        
        if (!customerTotals[customerId]) {
          customerTotals[customerId] = {
            customer: job.customer,
            totalAmount: 0,
            jobCount: 0
          };
        }
        
        customerTotals[customerId].totalAmount += amount;
        customerTotals[customerId].jobCount += 1;
      });
      
      return { data: Object.values(customerTotals), error: null };
    },

    async getBillingByDate(date: string) {
      // Get jobs completed on a specific date
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          id,
          job_number,
          requirements,
          payment_amount,
          actual_cost,
          payment_method,
          status,
          assigned_technician_id,
          technician:technicians(
            id,
            full_name,
            employee_id
          ),
          customer:customers(
            id,
            customer_id,
            full_name
          ),
          completed_at
        `)
        .eq('status', 'COMPLETED')
        .gte('completed_at', startDate.toISOString())
        .lte('completed_at', endDate.toISOString())
        .not('payment_amount', 'is', null);
      
      return { data, error };
    },

    async getBillingByQRCode(date?: string) {
      // Get jobs with QR code information from requirements
      let query = supabase
        .from('jobs')
        .select(`
          id,
          job_number,
          requirements,
          payment_amount,
          actual_cost,
          status,
          completed_at,
          customer:customers(
            id,
            customer_id,
            full_name
          )
        `)
        .eq('status', 'COMPLETED')
        .not('payment_amount', 'is', null);
      
      // Filter by date if provided
      if (date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        query = query
          .gte('completed_at', startDate.toISOString())
          .lte('completed_at', endDate.toISOString());
      }
      
      const { data, error } = await query;
      
      if (error) return { data: null, error };
      
      // Extract QR codes from requirements
      const qrCodeTotals: Record<string, any> = {};
      data?.forEach((job: any) => {
        try {
          const requirements = typeof job.requirements === 'string' 
            ? JSON.parse(job.requirements) 
            : job.requirements || [];
          
          const qrPhotos = requirements.find((r: any) => r?.qr_photos);
          const qrCodeName = qrPhotos?.qr_photos?.selected_qr_code_name;
          
          if (qrCodeName) {
            const amount = job.payment_amount || job.actual_cost || 0;
            
            if (!qrCodeTotals[qrCodeName]) {
              qrCodeTotals[qrCodeName] = {
                qrCodeName,
                totalAmount: 0,
                jobCount: 0,
                jobs: []
              };
            }
            
            qrCodeTotals[qrCodeName].totalAmount += amount;
            qrCodeTotals[qrCodeName].jobCount += 1;
            qrCodeTotals[qrCodeName].jobs.push({
              jobNumber: job.job_number,
              amount,
              customer: job.customer
            });
          }
        } catch (e) {
          // Skip jobs with invalid requirements
        }
      });
      
      return { data: Object.values(qrCodeTotals), error: null };
    },

    async getAnalytics() {
      // Get comprehensive analytics
      const [jobsResult, techniciansResult, paymentsResult] = await Promise.all([
        supabase
          .from('jobs')
          .select('status, payment_amount, actual_cost, assigned_technician_id, created_at, denied_at, completed_at'),
        supabase
          .from('technicians')
          .select('id, full_name, performance'),
        supabase
          .from('technician_payments')
          .select('technician_id, commission_amount, payment_status')
      ]);
      
      if (jobsResult.error) return { data: null, error: jobsResult.error };
      
      const jobs = jobsResult.data || [];
      const technicians = techniciansResult.data || [];
      const payments = paymentsResult.data || [];
      
      // Calculate stats
      const totalJobs = jobs.length;
      const completedJobs = jobs.filter(j => j.status === 'COMPLETED').length;
      const deniedJobs = jobs.filter(j => j.status === 'DENIED' || j.status === 'CANCELLED').length;
      const pendingJobs = jobs.filter(j => j.status === 'PENDING').length;
      const assignedJobs = jobs.filter(j => j.status === 'ASSIGNED').length;
      const inProgressJobs = jobs.filter(j => j.status === 'IN_PROGRESS').length;
      
      // Calculate total billing
      const completedJobsWithPayment = jobs.filter(j => 
        j.status === 'COMPLETED' && (j.payment_amount || j.actual_cost)
      );
      const totalBilling = completedJobsWithPayment.reduce((sum, j) => 
        sum + (j.payment_amount || j.actual_cost || 0), 0
      );
      const averageBill = completedJobsWithPayment.length > 0
        ? totalBilling / completedJobsWithPayment.length
        : 0;
      
      // Technician stats
      const technicianStats = technicians.map(tech => {
        const techJobs = jobs.filter(j => j.assigned_technician_id === tech.id);
        const techCompleted = techJobs.filter(j => j.status === 'COMPLETED').length;
        const techPayments = payments.filter(p => p.technician_id === tech.id);
        const totalEarnings = techPayments
          .filter(p => p.payment_status === 'PAID')
          .reduce((sum, p) => sum + (p.commission_amount || 0), 0);
        const pendingEarnings = techPayments
          .filter(p => p.payment_status === 'PENDING')
          .reduce((sum, p) => sum + (p.commission_amount || 0), 0);
        
        return {
          id: tech.id,
          name: tech.full_name,
          totalJobs: techJobs.length,
          completedJobs: techCompleted,
          totalEarnings,
          pendingEarnings
        };
      });
      
      return {
        data: {
          totalJobs,
          completedJobs,
          deniedJobs,
          pendingJobs,
          assignedJobs,
          inProgressJobs,
          totalBilling,
          averageBill,
          technicianStats,
          completionRate: totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0,
          denialRate: totalJobs > 0 ? (deniedJobs / totalJobs) * 100 : 0
        },
        error: null
      };
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
