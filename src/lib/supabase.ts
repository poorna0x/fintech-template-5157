import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types';
import { chromeStorage } from './storage';

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

// Create a storage adapter compatible with Supabase's expected interface
const supabaseStorageAdapter = typeof window !== 'undefined' ? {
  getItem: (key: string) => chromeStorage.getItem(key),
  setItem: (key: string, value: string) => chromeStorage.setItem(key, value),
  removeItem: (key: string) => chromeStorage.removeItem(key),
} : undefined;

// Create Supabase client with better error handling for local development and Chrome mobile
export const supabase = createClient<Database>(buildTimeUrl, buildTimeKey, {
  auth: {
    // Use Chrome-compatible storage adapter for session persistence
    storage: supabaseStorageAdapter,
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
      
      // Add timeout to prevent hanging requests in PWA
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      return fetch(url, {
        ...options,
        headers: headers,
        signal: controller.signal,
      })
        .then((response) => {
          clearTimeout(timeoutId);
          return response;
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          // Log fetch errors for debugging
          if (import.meta.env.DEV) {
            console.error('[Supabase Fetch Error]', error);
          }
          // If it's an abort error (timeout), provide a more helpful message
          if (error.name === 'AbortError') {
            throw new Error('Request timeout - please check your internet connection');
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
    
    async getAll(limit?: number) {
      let query = supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Add limit if provided to reduce data transfer
      if (limit && limit > 0) {
        query = query.limit(limit);
      }
      
      const { data, error } = await query;
      return { data, error };
    },

    async search(query: string, limit: number = 100) {
      let q = supabase
        .from('customers')
        .select('*')
        .or(`customer_id.ilike.%${query}%,full_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
        .order('created_at', { ascending: false });
      if (limit > 0) q = q.limit(limit);
      const { data, error } = await q;
      return { data, error };
    },

    /** Scoped fetch: customers created today (local date). Use instead of loading all customers. Limit default 100. */
    async getCreatedToday(limit: number = 100) {
      const d = new Date();
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .gte('customer_since', start.toISOString())
        .lte('customer_since', end.toISOString())
        .order('customer_since', { ascending: false })
        .limit(limit);
      return { data, error };
    },

    async getByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_id', customerId)
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { data, error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id)
        .select(); // Select to verify deletion
      
      return { data, error };
    }
  },
  
  // Job operations
  jobs: {
    async create(job: Database['public']['Tables']['jobs']['Insert'], retryCount: number = 0) {
      const { data, error } = await supabase
        .from('jobs')
        .insert(job)
        .select()
        .single();
      
      // If duplicate job_number error and we haven't retried too many times, retry with new job number
      if (error && error.code === '23505' && error.message?.includes('job_number') && retryCount < 3) {
        // Generate a new job number by adding more randomness
        const serviceType = (job as any).service_type || 'RO';
        const prefix = serviceType === 'RO' ? 'RO' : 'WS';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0'); // 4 digits for more uniqueness
        const newJobNumber = `${prefix}${timestamp}${random}`;
        
        // Retry with new job number
        return this.create({ ...job, job_number: newJobNumber }, retryCount + 1);
      }
      
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
            has_prefilter,
            raw_water_tds,
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
    
    async getAll(limit?: number, includeCustomer?: boolean) {
      // OPTIMIZATION: By default, don't fetch nested customer data to reduce payload size
      // Only fetch customer data when explicitly needed
      let query;
      if (includeCustomer) {
        query = supabase
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
              has_prefilter,
              raw_water_tds,
              created_at,
              updated_at
            )
          `);
      } else {
        // Fetch only job data without nested customer (much smaller payload)
        query = supabase
          .from('jobs')
          .select('*');
      }
      
      query = query.order('created_at', { ascending: false });
      
      // Add limit if provided to reduce data transfer
      if (limit && limit > 0) {
        query = query.limit(limit);
      }
      
      const { data, error } = await query;
      return { data, error };
    },
    
    async update(id: string, updates: Database['public']['Tables']['jobs']['Update']) {
      // Debug logging
      console.log('🔧 [db.jobs.update] Called with:', {
        id,
        updates,
        updateKeys: Object.keys(updates || {}),
        assignedTechnicianId: (updates as any)?.assigned_technician_id
      });
      
      try {
        // First, try update without select to avoid relationship query issues
        const { error: updateError } = await supabase
        .from('jobs')
        .update(updates)
          .eq('id', id);
        
        if (updateError) {
          console.error('❌ [db.jobs.update] Supabase update error:', {
            error: updateError,
            errorMessage: updateError.message,
            errorDetails: updateError.details,
            errorHint: updateError.hint,
            errorCode: updateError.code,
            id,
            updates
          });
          return { data: null, error: updateError };
        }
        
        // Then fetch the updated row with minimal select to avoid relationship issues
        const { data, error: selectError } = await supabase
          .from('jobs')
          .select('id, status, assigned_technician_id, completed_by, completed_at, end_time')
        .eq('id', id)
          .single();
      
        if (selectError) {
          console.warn('⚠️ [db.jobs.update] Select error (non-critical):', {
            error: selectError,
            id
          });
          // Update succeeded, but select failed - return success anyway
          return { data: null, error: null };
      }
      
        console.log('✅ [db.jobs.update] Success:', {
          id,
          updatedData: data
        });
        
        return { data: data || null, error: null };
      } catch (err: any) {
        console.error('❌ [db.jobs.update] Exception:', {
          err,
          errorMessage: err?.message,
          errorStack: err?.stack,
          id,
          updates
        });
        return { 
          data: null, 
          error: {
            message: err?.message || 'Unknown error during update',
            details: err?.details || null,
            hint: err?.hint || null,
            code: err?.code || 'UNKNOWN_ERROR'
          } as any
        };
      }
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
      // Optimized query for mobile - only fetch essential fields
      // Include jobs where technician is assigned OR is a team member
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
            preferred_time_slot,
            preferred_language,
            has_prefilter,
            raw_water_tds
          ),
          assigned_technician:technicians!assigned_technician_id(
            id,
            full_name,
            phone,
            email,
            employee_id
          )
        `)
        .or(`assigned_technician_id.eq.${technicianId},team_members.cs.["${technicianId}"]`)
        .order('created_at', { ascending: false })
        .limit(100); // Limit to 100 jobs for mobile performance
      
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
        // Get today's date range (start and end of today) for today-specific counts
        // Use local timezone date, then convert to UTC for database comparison
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const day = today.getDate();
        
        // Create date objects in local timezone (start and end of today)
        // new Date(year, month, day, hour, min, sec) creates a date at that LOCAL time
        // When converted to ISO string, it automatically converts to UTC
        const localStartOfDay = new Date(year, month, day, 0, 0, 0, 0);
        const localStartOfNextDay = new Date(year, month, day + 1, 0, 0, 0, 0);
        
        // The Date objects already represent the correct moment in time
        // When converted to ISO string, they will be in UTC
        const todayStart = localStartOfDay.toISOString();
        const todayStartNextDay = localStartOfNextDay.toISOString();
        
        // Count jobs in parallel for better performance
        const [ongoingResult, followupResult, deniedResult, completedResult] = await Promise.all([
          // Ongoing: ALL current jobs with status PENDING, ASSIGNED, EN_ROUTE, or IN_PROGRESS
          supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
            .in('status', ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']),
          // Followup: ALL jobs with status FOLLOW_UP or RESCHEDULED
          supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .in('status', ['FOLLOW_UP', 'RESCHEDULED']),
          // Denied: Only TODAY's jobs with status DENIED or CANCELLED (using denied_at field)
          supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .in('status', ['DENIED', 'CANCELLED'])
            .gte('denied_at', todayStart)
            .lt('denied_at', todayStartNextDay),
          // Completed: Only TODAY's jobs with status COMPLETED (using completed_at OR end_time field)
          // Check both completed_at and end_time fields - use whichever is set
          // Format: (completed_at >= start AND completed_at < nextDay) OR (end_time >= start AND end_time < nextDay)
          supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'COMPLETED')
            .or(`and(completed_at.gte.${todayStart},completed_at.lt.${todayStartNextDay}),and(end_time.gte.${todayStart},end_time.lt.${todayStartNextDay})`)
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
            has_prefilter,
            raw_water_tds,
            created_at,
            updated_at
          )
        `, { count: 'exact' });
      
      // If date filter is provided, filter by date based on status
      if (dateFilter) {
        // Parse date filter (format: YYYY-MM-DD) and create date range
        // Filter by date portion in local timezone (what the user sees)
        // Since timestamps are stored in UTC, we need to convert local date range to UTC
        const [year, month, day] = dateFilter.split('-').map(Number);
        
        // Create date objects in local timezone (start and end of selected day)
        // new Date(year, month, day, hour, min, sec) creates a date at that LOCAL time
        // For IST: Dec 3, 2025 00:00:00 IST = Dec 2, 2025 18:30:00 UTC
        const localStartOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
        const localStartOfNextDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
        
        // The Date objects already represent the correct moment in time
        // When converted to ISO string, they will be in UTC
        // For IST (UTC+5:30): Dec 3, 2025 00:00:00 IST.toISOString() = "2025-12-02T18:30:00.000Z"
        // So we can use the Date objects directly
        const startOfDay = localStartOfDay;
        const startOfNextDay = localStartOfNextDay;
        
        if (statuses.includes('DENIED')) {
          // Filter DENIED jobs by denied_at date
          // Filter: DENIED jobs with denied_at in date range, OR CANCELLED jobs (show all cancelled regardless of date)
          if (statuses.includes('CANCELLED')) {
            query = query.or(`and(status.eq.DENIED,denied_at.gte.${startOfDay.toISOString()},denied_at.lt.${startOfNextDay.toISOString()}),status.eq.CANCELLED`);
          } else {
            // Only DENIED jobs, filter by date
            // Use start of next day with lt (less than) for reliability
            query = query
              .eq('status', 'DENIED')
              .gte('denied_at', startOfDay.toISOString())
              .lt('denied_at', startOfNextDay.toISOString());
          }
        } else if (statuses.includes('COMPLETED')) {
          // Filter COMPLETED jobs by completed_at or end_time date
          // Some jobs might have end_time set but not completed_at (or vice versa)
          // Filter by date portion in local timezone (what user sees)
          const startISO = startOfDay.toISOString();
          const nextDayISO = startOfNextDay.toISOString(); // Use start of next day with .lt() for reliability
          
          // Debug logging in development
          if (import.meta.env.DEV && dateFilter) {
            console.log('Completed jobs date filter:', {
              dateFilter,
              startISO,
              nextDayISO,
              localStartOfDay: localStartOfDay.toISOString(),
              localStartOfNextDay: localStartOfNextDay.toISOString(),
              timezoneOffset: localStartOfDay.getTimezoneOffset()
            });
          }
          
          // Check both completed_at and end_time using OR condition
          // PostgREST OR syntax: condition1,condition2
          // We want jobs where either completed_at OR end_time is in the date range
          // Use .lt() with start of next day to ensure we capture all jobs within the day
          // Simplified: Just check if either field is in the date range (nulls will be excluded by .gte/.lt)
          query = query
            .eq('status', 'COMPLETED')
            .or(`and(completed_at.gte.${startISO},completed_at.lt.${nextDayISO}),and(end_time.gte.${startISO},end_time.lt.${nextDayISO})`);
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

    /** Analytics only: selective columns (no before_photos, after_photos, service_address, etc.). Same aggregates, lower egress. */
    async getForAnalytics(limit: number = 5000) {
      const cols = [
        'id', 'status', 'created_at', 'completed_at', 'end_time', 'requirements',
        'assigned_technician_id', 'assigned_by', 'payment_amount', 'actual_cost', 'lead_cost',
        'service_type', 'service_sub_type', 'payment_method', 'job_number'
      ].join(', ');
      const { data, error } = await supabase
        .from('jobs')
        .select(cols)
        .order('created_at', { ascending: false })
        .limit(limit);
      return { data: data || [], error };
    },

    // Get ongoing jobs (PENDING, ASSIGNED, IN_PROGRESS). Limit 100 to cap egress if count grows.
    async getOngoing(limit: number = 100) {
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
            has_prefilter,
            raw_water_tds,
            created_at,
            updated_at
          )
        `)
        .in('status', ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'])
        .order('created_at', { ascending: false })
        .limit(limit);
      
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
    
    async getAll(limit?: number) {
      let query = supabase
        .from('technicians')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Add limit if provided to reduce data transfer
      if (limit && limit > 0) {
        query = query.limit(limit);
      }
      
      const { data, error } = await query;
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

    /** Fetch only names (minimal egress) for dropdowns */
    async getNames() {
      const { data, error } = await supabase
        .from('common_qr_codes')
        .select('name')
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

  // Technician Common QR (non-payment): QR shown below payment QR on technician app
  technicianCommonQr: {
    async create(qrCode: { name: string; qr_code_url: string }) {
      const { data, error } = await supabase
        .from('technician_common_qr')
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
        .from('technician_common_qr')
        .select('*')
        .order('created_at', { ascending: false });
      return { data, error };
    },
    async update(id: string, updates: { name?: string; qr_code_url?: string }) {
      const { data, error } = await supabase
        .from('technician_common_qr')
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
        .from('technician_common_qr')
        .delete()
        .eq('id', id);
      return { data: null, error };
    }
  },

  // Product QR Codes operations (for product verification QR codes)
  productQrCodes: {
    async create(qrCode: { name: string; qr_code_url: string; product_image_url?: string; product_name?: string; product_description?: string; product_mrp?: string }) {
      const { data, error } = await supabase
        .from('product_qr_codes')
        .insert({
          name: qrCode.name,
          qr_code_url: qrCode.qr_code_url,
          product_image_url: qrCode.product_image_url || null,
          product_name: qrCode.product_name || null,
          product_description: qrCode.product_description || null,
          product_mrp: qrCode.product_mrp || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      return { data, error };
    },
    
    async getAll() {
      const { data, error } = await supabase
        .from('product_qr_codes')
        .select('*')
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async getById(id: string) {
      const { data, error } = await supabase
        .from('product_qr_codes')
        .select('*')
        .eq('id', id)
        .single();
      
      return { data, error };
    },
    
    async update(id: string, updates: { name?: string; qr_code_url?: string; product_image_url?: string; product_name?: string; product_description?: string; product_mrp?: string }) {
      const { data, error } = await supabase
        .from('product_qr_codes')
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
        .from('product_qr_codes')
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
      let query = supabase
        .from('tax_invoices')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });
      
      // Always apply range to avoid Supabase default limit (1000 rows)
      // Use a high limit if limit is 0 or very large
      const effectiveLimit = limit <= 0 ? 100000 : (limit > 100000 ? 100000 : limit);
      query = query.range(offset, offset + effectiveLimit - 1);
      
      const { data, error, count } = await query;
      
      return { data, error, count };
    },
    
    // Optimized method for filtered and paginated queries
    async getFilteredPaginated(filters: {
      invoiceType?: 'ALL' | 'B2B' | 'B2C';
      dateFilter?: 'all' | 'custom' | 'month' | 'year';
      startDate?: string;
      endDate?: string;
      selectedMonth?: number;
      selectedYear?: number;
      searchQuery?: string;
      page?: number;
      pageSize?: number;
    }) {
      const { invoiceType, dateFilter, startDate, endDate, selectedMonth, selectedYear, searchQuery, page = 1, pageSize = 20 } = filters;
      
      let query = supabase
        .from('tax_invoices')
        .select('id, invoice_number, invoice_date, invoice_type, customer_name, customer_phone, customer_email, customer_gstin, total_amount, cgst, sgst, igst, is_intra_state, created_at', { count: 'exact' })
        .order('invoice_date', { ascending: false });
      
      // Filter by invoice type
      if (invoiceType && invoiceType !== 'ALL') {
        query = query.eq('invoice_type', invoiceType);
      }
      
      // Filter by date
      if (dateFilter === 'custom' && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.gte('invoice_date', start.toISOString()).lte('invoice_date', end.toISOString());
      } else if (dateFilter === 'month' && selectedMonth && selectedYear) {
        const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
        const monthEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);
        query = query.gte('invoice_date', monthStart.toISOString()).lte('invoice_date', monthEnd.toISOString());
      } else if (dateFilter === 'year' && selectedYear) {
        const yearStart = new Date(selectedYear, 0, 1);
        const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
        query = query.gte('invoice_date', yearStart.toISOString()).lte('invoice_date', yearEnd.toISOString());
      }
      
      // Filter by search query
      if (searchQuery && searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        query = query.or(`invoice_number.ilike.%${queryLower}%,customer_name.ilike.%${queryLower}%,customer_phone.ilike.%${queryLower}%,customer_email.ilike.%${queryLower}%,customer_gstin.ilike.%${queryLower}%`);
      }
      
      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
      
      const { data, error, count } = await query;
      
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
    },
    
    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('tax_invoices')
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
        .from('tax_invoices')
        .delete()
        .eq('id', id);
      
      return { error };
    },
    
    async checkInvoiceNumberExists(invoiceNumber: string, excludeId?: string) {
      let query = supabase
        .from('tax_invoices')
        .select('id')
        .eq('invoice_number', invoiceNumber);
      
      if (excludeId) {
        query = query.neq('id', excludeId);
      }
      
      const { data, error } = await query.single();
      return { exists: !!data && !error, error };
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

  // AMC Contracts operations
  amcContracts: {
    async create(amc: {
      customer_id: string;
      job_id?: string | null;
      start_date: string;
      end_date: string;
      years: number;
      includes_prefilter: boolean;
      additional_info?: string | null;
      service_period_months?: number | null;
    }) {
      // First, mark any existing active AMC for this customer as RENEWED or EXPIRED
      const { data: existingAMCs } = await supabase
        .from('amc_contracts')
        .select('id')
        .eq('customer_id', amc.customer_id)
        .eq('status', 'ACTIVE');
      
      if (existingAMCs && existingAMCs.length > 0) {
        // Mark existing AMCs as RENEWED if end_date hasn't passed, otherwise EXPIRED
        const today = new Date().toISOString().split('T')[0];
        for (const existingAMC of existingAMCs) {
          const { data: existing } = await supabase
            .from('amc_contracts')
            .select('end_date')
            .eq('id', existingAMC.id)
            .single();
          
          const newStatus = existing && existing.end_date >= today ? 'RENEWED' : 'EXPIRED';
          await supabase
            .from('amc_contracts')
            .update({ status: newStatus })
            .eq('id', existingAMC.id);
        }
      }

      // Create new AMC contract
      const { data, error } = await supabase
        .from('amc_contracts')
        .insert({
          customer_id: amc.customer_id,
          job_id: amc.job_id || null,
          start_date: amc.start_date,
          end_date: amc.end_date,
          years: amc.years,
          includes_prefilter: amc.includes_prefilter,
          additional_info: amc.additional_info || null,
          service_period_months: amc.service_period_months ?? null,
          status: 'ACTIVE'
        })
        .select()
        .single();
      
      return { data, error };
    },

    async getByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('amc_contracts')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getActiveByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('amc_contracts')
        .select('*')
        .eq('customer_id', customerId)
        .eq('status', 'ACTIVE')
        .single();
      
      return { data, error };
    },

    async getAll(limit: number = 100, offset: number = 0) {
      let query = supabase
        .from('amc_contracts')
        .select('*, customers(id, full_name, phone, email, customer_id, brand, model)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (limit > 0 && limit < 100000) {
        query = query.range(offset, offset + limit - 1);
      } else {
        query = query.range(offset, offset + 99999);
      }

      const { data, error, count } = await query;
      return { data, error, count };
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('amc_contracts')
        .select('*, customers(id, full_name, phone, email, customer_id, brand, model)')
        .eq('id', id)
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: {
      start_date?: string;
      end_date?: string;
      years?: number;
      includes_prefilter?: boolean;
      additional_info?: string | null;
      service_period_months?: number | null;
      status?: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'RENEWED';
    }) {
      const { data, error } = await supabase
        .from('amc_contracts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('amc_contracts')
        .delete()
        .eq('id', id);
      
      return { error };
    },

    async getExpiringSoon(days: number = 30) {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + days);
      
      const { data, error } = await supabase
        .from('amc_contracts')
        .select('*, customers(full_name, phone, email, customer_id)')
        .eq('status', 'ACTIVE')
        .gte('end_date', today.toISOString().split('T')[0])
        .lte('end_date', futureDate.toISOString().split('T')[0])
        .order('end_date', { ascending: true });
      
      return { data, error };
    },

    async createAMCServiceJobs(options?: { dryRun?: boolean }) {
      const dryRun = options?.dryRun === true;
      const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
      if (dryRun) console.log('🔵 [DRY RUN] AMC service job creation preview...');
      else if (isDev) console.log('🔵 Starting AMC service job creation...');

      // Batch IN clauses to avoid URL/query limits (~200–300 IDs per request)
      const BATCH_SIZE = 200;
      const chunk = <T>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      // Helper function to generate job number
      const generateJobNumber = (serviceType: string) => {
        const prefix = serviceType === 'RO' ? 'RO' : 'WS';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        return `${prefix}${timestamp}${random}`;
      };

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        if (isDev) console.warn('AMC job creation: not authenticated', authError);
        return { data: null, error: authError || new Error('Not authenticated'), created: 0 };
      }
      
      // Try with RLS bypass or check if we can access the table
      const { data: activeAMCsRaw, error: amcError } = await supabase
        .from('amc_contracts')
        .select('*')
        .eq('status', 'ACTIVE');

      if (amcError) {
        console.error('❌ Error fetching AMC contracts:', amcError);
        return { data: null, error: amcError, created: 0 };
      }

      if (!activeAMCsRaw || activeAMCsRaw.length === 0) {
        if (isDev) console.log('ℹ️ No active AMC contracts found');
        return { data: [], error: null, created: 0 };
      }

      const amcCustomerIds = [...new Set(activeAMCsRaw.map(amc => amc.customer_id).filter(Boolean))] as string[];

      // Fetch customers in batches (avoids large IN clauses when AMCs are 1000+)
      const customerIdChunks = chunk(amcCustomerIds, BATCH_SIZE);
      let customersData: any[] = [];
      for (const ids of customerIdChunks) {
        const { data, error: customersError } = await supabase
          .from('customers')
          .select('id, customer_id, full_name, phone, email, address, location, service_type, brand, model, last_service_date')
          .in('id', ids);
        if (customersError) {
          console.error('❌ Error fetching customers:', customersError);
          return { data: null, error: customersError, created: 0 };
        }
        customersData = customersData.concat(data || []);
      }

      // Combine AMC contracts with customer data
      const activeAMCs = activeAMCsRaw.map(amc => ({
        ...amc,
        customers: customersData?.find(c => c.id === amc.customer_id) || null
      }));

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // Default AMC service period from settings (localStorage); only in browser
      const getDefaultServicePeriodMonths = (): number => {
        if (typeof window === 'undefined') return 4;
        const stored = localStorage.getItem('amc_default_service_period_months');
        if (stored === null || stored === '') return 4;
        const n = parseInt(stored, 10);
        return Number.isNaN(n) ? 4 : n;
      };
      const defaultPeriodMonths = getDefaultServicePeriodMonths();

      // Helper: add months to YYYY-MM-DD, return YYYY-MM-DD
      const addMonthsToDate = (dateStr: string, months: number): string => {
        const d = new Date(dateStr + 'T12:00:00');
        d.setMonth(d.getMonth() + months);
        return d.toISOString().split('T')[0];
      };

      // Get last completed job per customer (batched for scale)
      const customerIds = [...new Set(activeAMCs.map(amc => amc.customer_id).filter(Boolean))] as string[];
      const lastServiceMap = new Map<string, string>();
      const jobChunks = chunk(customerIds, BATCH_SIZE);
      for (const ids of jobChunks) {
        const { data: lastJobs, error: jobsError } = await supabase
          .from('jobs')
          .select('customer_id, completed_at, service_sub_type')
          .in('customer_id', ids)
          .eq('status', 'COMPLETED')
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false });
        if (!jobsError && lastJobs) {
          lastJobs.forEach((job: any) => {
            if (!lastServiceMap.has(job.customer_id)) lastServiceMap.set(job.customer_id, job.completed_at);
          });
        }
      }

      // Existing AMC service jobs (batched) — skip creating if customer already has one open
      const existingAMCCustomers = new Set<string>();
      for (const ids of jobChunks) {
        const { data: existingAMCJobs } = await supabase
          .from('jobs')
          .select('customer_id')
          .in('customer_id', ids)
          .eq('service_sub_type', 'AMC Service')
          .in('status', ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'FOLLOW_UP', 'RESCHEDULED']);
        (existingAMCJobs || []).forEach((job: any) => existingAMCCustomers.add(job.customer_id));
      }

      // Preview for dry run: list of each active AMC and whether a job would be created
      type PreviewItem = {
        customer_id: string;
        customer_name: string;
        reference_date: string | null;
        period_months: number;
        next_due: string | null;
        would_create: boolean;
        skip_reason?: string;
      };
      const preview: PreviewItem[] = [];

      const jobsToCreate: any[] = [];
      let createdCount = 0;

      for (const amc of activeAMCs) {
        const customer = amc.customers as any;
        if (!customer) {
          console.log('⚠️ AMC has no customer data:', amc.id);
          preview.push({
            customer_id: amc.customer_id || '',
            customer_name: 'Unknown',
            reference_date: null,
            period_months: 0,
            next_due: null,
            would_create: false,
            skip_reason: 'No customer data'
          });
          continue;
        }

        if (isDev) console.log(`\n🔍 Processing customer: ${customer.customer_id || customer.id}`);

        // Skip if already has an AMC service job in PENDING, IN_PROGRESS, FOLLOW_UP, or RESCHEDULED (no duplicate)
        if (existingAMCCustomers.has(customer.id)) {
          if (isDev) console.log(`  ⏭️ Skipping - already has AMC service job (pending / in progress / follow-up)`);
          preview.push({
            customer_id: customer.customer_id || customer.id,
            customer_name: customer.full_name || 'Unknown',
            reference_date: null,
            period_months: 0,
            next_due: null,
            would_create: false,
            skip_reason: 'Already has open AMC service job'
          });
          continue;
        }

        // Service period: contract value or app default; 0 = no auto
        const periodMonths = amc.service_period_months != null ? amc.service_period_months : defaultPeriodMonths;
        if (periodMonths <= 0) {
          if (isDev) console.log(`  ⏭️ Skipping - no auto (service_period_months=${amc.service_period_months}, default=${defaultPeriodMonths})`);
          preview.push({
            customer_id: customer.customer_id || customer.id,
            customer_name: customer.full_name || 'Unknown',
            reference_date: null,
            period_months: periodMonths,
            next_due: null,
            would_create: false,
            skip_reason: 'No auto (service period is 0 or not set)'
          });
          continue;
        }

        // Reference date for next due: last service date, else AMC start date (creation)
        const lastServiceDateRaw = lastServiceMap.get(customer.id) || customer.last_service_date || amc.start_date;
        if (isDev) console.log(`  📅 Last service raw:`, lastServiceDateRaw, `(from job / customer.last_service_date / amc.start_date)`);

        let referenceDateStr: string | null = null;
        if (lastServiceDateRaw) {
          if (typeof lastServiceDateRaw === 'string') {
            referenceDateStr = lastServiceDateRaw.split('T')[0].split(' ')[0];
          } else {
            referenceDateStr = new Date(lastServiceDateRaw).toISOString().split('T')[0];
          }
        }
        if (!referenceDateStr) {
          if (isDev) console.log(`  ⏭️ Skipping - no reference date`);
          preview.push({
            customer_id: customer.customer_id || customer.id,
            customer_name: customer.full_name || 'Unknown',
            reference_date: null,
            period_months: periodMonths,
            next_due: null,
            would_create: false,
            skip_reason: 'No reference date (last service or AMC start)'
          });
          continue;
        }

        const nextDueStr = addMonthsToDate(referenceDateStr, periodMonths);
        const due = todayStr >= nextDueStr;
        if (isDev) console.log(`  📅 Reference: ${referenceDateStr}, period: ${periodMonths} months, next due: ${nextDueStr}, due: ${due}`);

        if (!due) {
          if (isDev) console.log(`  ❌ Skipping - not yet due`);
          preview.push({
            customer_id: customer.customer_id || customer.id,
            customer_name: customer.full_name || 'Unknown',
            reference_date: referenceDateStr,
            period_months: periodMonths,
            next_due: nextDueStr,
            would_create: false,
            skip_reason: `Not yet due (next due ${nextDueStr})`
          });
          continue;
        }

        preview.push({
          customer_id: customer.customer_id || customer.id,
          customer_name: customer.full_name || 'Unknown',
          reference_date: referenceDateStr,
          period_months: periodMonths,
          next_due: nextDueStr,
          would_create: true
        });

        {
          if (isDev) console.log(`  ✅ Will create job for ${customer.customer_id || customer.id}`);
          // Generate job number
          const serviceType = customer.service_type || 'RO';
          const jobNumber = generateJobNumber(serviceType);

          // Determine scheduled date (today)
          const scheduledDate = new Date();
          scheduledDate.setHours(0, 0, 0, 0);
          const scheduledDateStr = scheduledDate.toISOString().split('T')[0];

          // Format reference (last service / AMC start) date for display
          const formattedLastServiceDate = new Date(referenceDateStr + 'T00:00:00').toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });

          const jobData = {
            job_number: jobNumber,
            customer_id: customer.id,
            service_type: serviceType,
            service_sub_type: 'AMC Service',
            brand: customer.brand || 'Not Specified',
            model: customer.model || 'Not Specified',
            scheduled_date: scheduledDateStr,
            scheduled_time_slot: 'MORNING',
            estimated_duration: 120,
            service_address: customer.address || {},
            service_location: customer.location || {},
            status: 'PENDING',
            priority: 'MEDIUM',
            description: `AMC Service - Scheduled maintenance service. Last service was on ${formattedLastServiceDate}. This is an automatic AMC service job created for regular maintenance.`,
            requirements: [{ 
              amc_contract_id: amc.id,
              auto_created: true,
              service_due: true,
              amc_service: true,
              lead_source: 'Direct call'
            }],
            estimated_cost: 0,
            payment_status: 'PENDING'
          };

          jobsToCreate.push(jobData);
        }
      }

      if (isDev) console.log(`\n📦 Total jobs to create: ${jobsToCreate.length}`);

      if (dryRun) {
        if (isDev) console.log('ℹ️ [DRY RUN] No jobs inserted. Preview:', preview);
        return { data: null, error: null, created: 0, preview };
      }

      // Create jobs in batch
      if (jobsToCreate.length > 0) {
        if (isDev) console.log(`💾 Creating ${jobsToCreate.length} jobs...`);
        const { data: createdJobsData, error: createError } = await supabase
          .from('jobs')
          .insert(jobsToCreate)
          .select();

        if (createError) {
          console.error('❌ Error creating jobs:', createError);
          return { data: null, error: createError, created: 0 };
        }

        createdCount = createdJobsData?.length || 0;
        if (isDev) console.log(`✅ Successfully created ${createdCount} AMC service jobs`);
        return { data: createdJobsData, error: null, created: createdCount };
      }

      if (isDev) console.log('ℹ️ No jobs to create');
      return { data: [], error: null, created: 0 };
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

  // Business expenses operations
  businessExpenses: {
    async getAll(startDate?: string, endDate?: string) {
      let query = supabase
        .from('business_expenses')
        .select('*')
        .order('expense_date', { ascending: false });
      
      if (startDate) {
        query = query.gte('expense_date', startDate);
      }
      
      if (endDate) {
        query = query.lte('expense_date', endDate);
      }
      
      const { data, error } = await query;
      return { data, error };
    },

    async create(expense: any) {
      const { data, error } = await supabase
        .from('business_expenses')
        .insert(expense)
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('business_expenses')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('business_expenses')
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
      // Parse date string (format: YYYY-MM-DD) and create date range in local timezone
      const [year, month, day] = date.split('-').map(Number);
      const localStartOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const localStartOfNextDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
      
      // Use Date objects directly - they automatically convert to UTC when calling toISOString()
      const startDate = localStartOfDay;
      const endDate = localStartOfNextDay;
      
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
        .lt('completed_at', endDate.toISOString())
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
        // Parse date string (format: YYYY-MM-DD) and create date range in local timezone
        const [year, month, day] = date.split('-').map(Number);
        const localStartOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
        const localStartOfNextDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
        
        // Use Date objects directly - they automatically convert to UTC when calling toISOString()
        query = query
          .gte('completed_at', localStartOfDay.toISOString())
          .lt('completed_at', localStartOfNextDay.toISOString());
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
  },

  // Call History operations
  callHistory: {
    async create(callData: {
      customer_id: string;
      contact_type: 'CALL' | 'WHATSAPP' | 'SMS' | 'EMAIL';
      phone_number?: string;
      message_sent?: string;
      status?: string;
      notes?: string;
    }) {
      const { data, error } = await supabase
        .from('call_history')
        .insert({
          customer_id: callData.customer_id,
          contact_type: callData.contact_type,
          phone_number: callData.phone_number,
          message_sent: callData.message_sent,
          status: callData.status || 'COMPLETED',
          notes: callData.notes
        })
        .select()
        .single();
      
      return { data, error };
    },

    async getByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('call_history')
        .select('*')
        .eq('customer_id', customerId)
        .order('contacted_at', { ascending: false });
      
      return { data, error };
    },

    async getRecent(days: number = 7) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const { data, error } = await supabase
        .from('call_history')
        .select('*')
        .gte('contacted_at', cutoffDate.toISOString())
        .order('contacted_at', { ascending: false });
      
      return { data, error };
    },

    async getAll() {
      const { data, error } = await supabase
        .from('call_history')
        .select('*')
        .order('contacted_at', { ascending: false });
      
      return { data, error };
    }
  },

  // Admin Todos operations
  adminTodos: {
    async getAll() {
      const { data, error } = await supabase
        .from('admin_todos')
        .select('*')
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async create(todoData: { text: string }) {
      const { data, error } = await supabase
        .from('admin_todos')
        .insert({ text: todoData.text })
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('admin_todos')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  // Inventory operations
  inventory: {
    async getAll() {
      // Only select needed fields to reduce egress
      const { data, error } = await supabase
        .from('inventory')
        .select('id, product_name, code, price, quantity, created_at, updated_at')
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', id)
        .single();
      
      return { data, error };
    },

    async create(item: { product_name: string; code?: string; price: number; quantity: number }) {
      const { data, error } = await supabase
        .from('inventory')
        .insert({
          product_name: item.product_name,
          code: item.code || null,
          price: item.price,
          quantity: item.quantity
        })
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: { product_name?: string; code?: string; price?: number; quantity?: number }) {
      const { data, error } = await supabase
        .from('inventory')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);
      
      return { error };
    },

    async getSummary() {
      const { data, error } = await supabase
        .from('inventory')
        .select('id, product_name, code, price, quantity');
      
      if (error) return { data: null, error };
      
      const totalItems = data?.length || 0;
      const totalValue = data?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
      const lowStockItems = data?.filter(item => item.quantity <= 5).length || 0;
      
      return {
        data: {
          totalItems,
          totalValue,
          lowStockItems,
          items: data || []
        },
        error: null
      };
    }
  },

  // Technician Inventory operations
  technicianInventory: {
    async getAll() {
      // Only select needed fields to reduce egress
      const { data, error } = await supabase
        .from('technician_inventory')
        .select(`
          id,
          technician_id,
          inventory_id,
          quantity,
          created_at,
          updated_at,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code)
        `)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getByTechnician(technicianId: string) {
      // Only select needed fields to reduce egress
      const { data, error } = await supabase
        .from('technician_inventory')
        .select(`
          id,
          technician_id,
          inventory_id,
          quantity,
          created_at,
          updated_at,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code)
        `)
        .eq('technician_id', technicianId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getByInventory(inventoryId: string) {
      const { data, error } = await supabase
        .from('technician_inventory')
        .select(`
          *,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code, price)
        `)
        .eq('inventory_id', inventoryId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('technician_inventory')
        .select(`
          *,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code, price)
        `)
        .eq('id', id)
        .single();
      
      return { data, error };
    },

    async create(item: { technician_id: string; inventory_id: string; quantity: number; notes?: string }) {
      const { data, error } = await supabase
        .from('technician_inventory')
        .insert({
          technician_id: item.technician_id,
          inventory_id: item.inventory_id,
          quantity: item.quantity,
          notes: item.notes || null
        })
        .select(`
          *,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code, price)
        `)
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: { quantity?: number }) {
      const { data, error } = await supabase
        .from('technician_inventory')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code, price)
        `)
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('technician_inventory')
        .delete()
        .eq('id', id);
      
      return { error };
    },

    async upsert(item: { technician_id: string; inventory_id: string; quantity: number }) {
      // Upsert: insert or update if technician_id + inventory_id combination exists
      const { data, error } = await supabase
        .from('technician_inventory')
        .upsert({
          technician_id: item.technician_id,
          inventory_id: item.inventory_id,
          quantity: item.quantity
        }, {
          onConflict: 'technician_id,inventory_id'
        })
        .select(`
          *,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code, price)
        `)
        .single();
      
      return { data, error };
    }
  },

  // Job Parts Used operations
  jobPartsUsed: {
    async getByJob(jobId: string) {
      const { data, error } = await supabase
        .from('job_parts_used')
        .select(`
          id,
          job_id,
          technician_id,
          inventory_id,
          quantity_used,
          price_at_time_of_use,
          created_at,
          inventory:inventory(id, product_name, code, price)
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getByTechnician(technicianId: string) {
      const { data, error } = await supabase
        .from('job_parts_used')
        .select(`
          id,
          job_id,
          technician_id,
          inventory_id,
          quantity_used,
          created_at,
          inventory:inventory(id, product_name, code),
          job:jobs(completed_at, end_time)
        `)
        .eq('technician_id', technicianId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    /** Fetch parts used for given job IDs with stored price_at_time_of_use (for analytics spare parts cost) */
    async getWithPriceByJobIds(jobIds: string[]) {
      if (!jobIds?.length) return { data: [] as any[], error: null };
      const { data, error } = await supabase
        .from('job_parts_used')
        .select('id, job_id, quantity_used, price_at_time_of_use, inventory:inventory(id, price)')
        .in('job_id', jobIds);
      return { data: data || [], error };
    },

    async create(part: { job_id: string; technician_id: string; inventory_id: string; quantity_used: number; price_at_time_of_use?: number }) {
      // If price not provided, fetch it from inventory
      let priceToStore = part.price_at_time_of_use;
      if (priceToStore === undefined || priceToStore === null) {
        const { data: invData } = await supabase
          .from('inventory')
          .select('price')
          .eq('id', part.inventory_id)
          .single();
        priceToStore = invData?.price ? Number(invData.price) : 0;
      }

      const { data, error } = await supabase
        .from('job_parts_used')
        .insert({
          job_id: part.job_id,
          technician_id: part.technician_id,
          inventory_id: part.inventory_id,
          quantity_used: part.quantity_used,
          price_at_time_of_use: priceToStore
        })
        .select(`
          id,
          job_id,
          technician_id,
          inventory_id,
          quantity_used,
          price_at_time_of_use,
          created_at,
          inventory:inventory(id, product_name, code)
        `)
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: { quantity_used?: number; price_at_time_of_use?: number }) {
      const { data, error } = await supabase
        .from('job_parts_used')
        .update(updates)
        .eq('id', id)
        .select(`
          id,
          job_id,
          technician_id,
          inventory_id,
          quantity_used,
          price_at_time_of_use,
          created_at,
          inventory:inventory(id, product_name, code)
        `)
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('job_parts_used')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  reminders: {
    async create(row: {
      entity_type: 'customer' | 'job' | 'general';
      entity_id?: string | null;
      title: string;
      notes?: string | null;
      reminder_at: string;
      created_by?: string | null;
      interval_type?: 'days' | 'months' | null;
      interval_value?: number | null;
    }) {
      const { data, error } = await supabase
        .from('reminders')
        .insert({
          entity_type: row.entity_type,
          entity_id: row.entity_id ?? null,
          title: row.title,
          notes: row.notes ?? null,
          reminder_at: row.reminder_at,
          created_by: row.created_by ?? null,
          interval_type: row.interval_type ?? null,
          interval_value: row.interval_value ?? null,
        })
        .select()
        .single();
      return { data, error };
    },
    async getForTodayAndTomorrow() {
      // Use local date so "today" matches reminder_at stored as local date (e.g. from date picker)
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const tomorrowDate = new Date(now);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrow = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .in('reminder_at', [today, tomorrow])
        .is('completed_at', null)
        .order('reminder_at', { ascending: true })
        .order('created_at', { ascending: true });
      return { data: data || [], error };
    },
    async getAll(includeCompleted = false, limitCount = 1000) {
      let query = supabase
        .from('reminders')
        .select('*')
        .order('reminder_at', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(Math.min(limitCount, 2000));
      if (!includeCompleted) {
        query = query.is('completed_at', null);
      }
      const { data, error } = await query;
      return { data: data || [], error };
    },
    async getByEntity(entityType: 'customer' | 'job' | 'general', entityId: string | null, includeCompleted = false) {
      if (!entityId) return { data: [], error: null };
      let query = supabase
        .from('reminders')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('reminder_at', { ascending: true })
        .order('created_at', { ascending: false });
      if (!includeCompleted) {
        query = query.is('completed_at', null);
      }
      const { data, error } = await query;
      return { data: data || [], error };
    },
    async update(id: string, updates: {
      title?: string;
      notes?: string | null;
      reminder_at?: string;
      completed_at?: string | null;
      interval_type?: 'days' | 'months' | null;
      interval_value?: number | null;
    }) {
      const { data, error } = await supabase
        .from('reminders')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },
    async delete(id: string) {
      const { error } = await supabase.from('reminders').delete().eq('id', id);
      return { error };
    },
  },
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
