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
      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },
    
    async getAll() {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('createdAt', { ascending: false });
      
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
          customer:customers(*)
        `)
        .eq('id', id)
        .single();
      
      return { data, error };
    },
    
    async getByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('customerId', customerId)
        .order('createdAt', { ascending: false });
      
      return { data, error };
    },
    
    async getAll() {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          customer:customers(*)
        `)
        .order('createdAt', { ascending: false });
      
      return { data, error };
    },
    
    async update(id: string, updates: Database['public']['Tables']['jobs']['Update']) {
      const { data, error } = await supabase
        .from('jobs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },
    
    async getByStatus(status: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          customer:customers(*)
        `)
        .eq('status', status)
        .order('createdAt', { ascending: false });
      
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
        .order('createdAt', { ascending: false });
      
      return { data, error };
    },
    
    async getAvailable() {
      const { data, error } = await supabase
        .from('technicians')
        .select('*')
        .eq('status', 'AVAILABLE')
        .order('createdAt', { ascending: false });
      
      return { data, error };
    },
    
    async update(id: string, updates: Database['public']['Tables']['technicians']['Update']) {
      const { data, error } = await supabase
        .from('technicians')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
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
