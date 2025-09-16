import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

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
        .single();
      
      return { data, error };
    },
    
    async update(id: string, updates: Database['public']['Tables']['customers']['Update']) {
      console.log('DB Update - ID:', id, 'Updates:', updates);
      
      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', id)
        .select();
      
      console.log('DB Update - Raw response:', { data, error });
      
      if (error) {
        console.error('DB Update - Error:', error);
        return { data: null, error };
      }
      
      // Return the first (and should be only) updated row
      const result = { data: data?.[0] || null, error: null };
      console.log('DB Update - Final result:', result);
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
