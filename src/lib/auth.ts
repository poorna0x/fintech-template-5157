// Technician authentication system using database credentials
// Note: Admin authentication is handled by Supabase Auth (see AdminLogin.tsx)
import { supabase } from './supabase';

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'technician';
  technicianId?: string;
  fullName?: string;
}

// Track if technician was found (to prevent Supabase auth fallback)
let technicianFound = false;

export const authenticateUser = async (email: string, password: string): Promise<AuthUser | null> => {
  try {
    console.log('Authenticating technician:', email);
    technicianFound = false; // Reset flag
    
    // Authenticate technician (admin auth is handled by Supabase Auth)
    
    // First, let's check if the technicians table has the required columns
    const { data: technician, error } = await supabase
      .from('technicians')
      .select('id, full_name, email, password, account_status')
      .eq('email', email.toLowerCase())
      .single();

    console.log('Technician query result:', { technician: technician ? { ...technician, password: '***' } : null, error });
    
    // If technician not found, return null (don't try Supabase auth - that's for admins only)
    if (error) {
      console.error('Database error:', error);
      // If the error is about missing columns, let's try without them
      if (error.message.includes('password') || error.message.includes('account_status')) {
        console.log('Trying without password/account_status columns...');
        const { data: techWithoutAuth, error: techError } = await supabase
          .from('technicians')
          .select('id, full_name, email')
          .eq('email', email.toLowerCase())
          .single();
        
        if (techWithoutAuth && !techError) {
          console.log('Found technician but missing auth columns. Please run the SQL scripts to add password and account_status fields.');
          return null;
        }
      }
      // If technician not found in database, return null (don't try Supabase auth)
      console.log('Technician not found in database - returning null (will not try Supabase auth)');
      return null;
    }
    
    // If no technician found, return null (don't try Supabase auth)
    if (!technician) {
      console.log('No technician found with this email - returning null');
      technicianFound = false;
      return null;
    }
    
    // Mark that we found a technician
    technicianFound = true;
    
    if (technician) {
      // Check if password and account_status exist
      if (!technician.password) {
        console.log('Technician found but no password set');
        return null;
      }
      
      if (technician.account_status !== 'ACTIVE') {
        console.log('Technician account is not active:', technician.account_status);
        return null;
      }
      
      // SECURE: Use server-side password verification instead of plaintext comparison
      // Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
      const isHashed = technician.password.startsWith('$2a$') || 
                       technician.password.startsWith('$2b$') || 
                       technician.password.startsWith('$2y$');
      
      if (isHashed) {
        // Password is hashed - use server-side verification
        const apiUrl = import.meta.env.DEV 
          ? 'http://localhost:8888/.netlify/functions/verify-technician-password'
          : '/.netlify/functions/verify-technician-password';
        
        try {
          console.log('Calling password verification API:', apiUrl);
          const verifyResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              password: password,
              hashedPassword: technician.password,
            }),
          });

          console.log('Verification response status:', verifyResponse.status);
          
          if (!verifyResponse.ok) {
            console.error('Password verification API error:', verifyResponse.status, verifyResponse.statusText);
            const errorText = await verifyResponse.text();
            console.error('Error details:', errorText);
            // If verification API is unavailable (404), show helpful error
            if (verifyResponse.status === 404) {
              console.error('❌ Password verification API not found. Make sure dev server is running: npm run dev:server');
              throw new Error('Password verification service unavailable. Please ensure the development server is running.');
            }
            return null;
          }

          const verifyResult = await verifyResponse.json();
          console.log('Verification result:', verifyResult);
          
          if (verifyResult.verified) {
            console.log('Technician authentication successful');
            return {
              id: technician.id,
              email: technician.email,
              role: 'technician',
              technicianId: technician.id,
              fullName: technician.full_name
            };
          } else {
            console.log('Password mismatch:', verifyResult.error || 'Unknown error');
            return null;
          }
        } catch (verifyError) {
          console.error('Password verification error:', verifyError);
          console.error('Error details:', verifyError.message);
          // If verification API fails, we cannot verify hashed passwords
          // DO NOT fallback to plaintext - this would be a security issue
          // Since technician was found, we should NOT try Supabase auth
          console.error('❌ Cannot verify password - verification API unavailable');
          console.error('⚠️ Make sure dev server is running: npm run dev:server');
          // Throw error to prevent Supabase auth fallback
          throw new Error('Password verification failed - service unavailable');
        }
      } else {
        // Password is still in plaintext (legacy) - migrate to hashed
        // For now, we'll still allow comparison but log a warning
        console.warn('⚠️ WARNING: Password stored in plaintext. Please run migration script to hash passwords.');
        if (technician.password === password) {
          console.log('Technician authentication successful (legacy plaintext)');
          return {
            id: technician.id,
            email: technician.email,
            role: 'technician',
            technicianId: technician.id,
            fullName: technician.full_name
          };
        } else {
          console.log('Password mismatch');
          return null;
        }
      }
    } else {
      console.log('No technician found with email:', email);
    }

    return null;
  } catch (error) {
    console.error('Authentication error:', error);
    // If technician was found but verification failed, throw error to prevent Supabase auth fallback
    if (technicianFound) {
      throw error; // Re-throw to prevent fallback to Supabase auth
    }
    return null;
  }
};

// Export a function to check if technician exists (to prevent Supabase auth fallback)
export const isTechnicianEmail = async (email: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('technicians')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();
    return !error && !!data;
  } catch {
    return false;
  }
};

// Simple session storage
export const setAuthSession = (user: AuthUser) => {
  try {
    const userString = JSON.stringify(user);
    localStorage.setItem('auth_user', userString);
    console.log('Session saved successfully');
  } catch (error) {
    console.error('💥 Error saving session:', error);
  }
};

export const getAuthSession = (): AuthUser | null => {
  try {
    const userData = localStorage.getItem('auth_user');
    
    if (!userData) {
      return null;
    }
    
    const user = JSON.parse(userData);
    
    // Validate user object has required fields
    if (!user || !user.id || !user.email || !user.role) {
      clearAuthSession();
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('Error getting auth session:', error);
    clearAuthSession();
    return null;
  }
};

export const clearAuthSession = () => {
  try {
    localStorage.removeItem('auth_user');
    console.log('Session cleared');
  } catch (error) {
    console.error('Error clearing session:', error);
  }
};
