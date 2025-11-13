// QR Code Management Utility
// Handles common QR codes and localStorage caching for mobile

export interface CommonQrCode {
  id: string;
  name: string;
  qrCodeUrl: string;
  createdAt: string;
  updatedAt: string;
}

const QR_CODES_STORAGE_KEY = 'hydrogenro_common_qr_codes';
const QR_CODES_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Get QR codes from localStorage cache
export const getCachedQrCodes = (): CommonQrCode[] | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(QR_CODES_STORAGE_KEY);
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is expired
    if (now - timestamp > QR_CODES_CACHE_EXPIRY) {
      localStorage.removeItem(QR_CODES_STORAGE_KEY);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error reading cached QR codes:', error);
    return null;
  }
};

// Save QR codes to localStorage cache
export const cacheQrCodes = (qrCodes: CommonQrCode[]): void => {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheData = {
      data: qrCodes,
      timestamp: Date.now()
    };
    localStorage.setItem(QR_CODES_STORAGE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Error caching QR codes:', error);
  }
};

// Check if we should use cache (mobile devices)
export const shouldUseCache = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // Check if mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  return isMobile;
};

// Get technician QR code from localStorage cache
export const getCachedTechnicianQrCode = (technicianId: string): string | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const key = `hydrogenro_tech_qr_${technicianId}`;
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is expired (24 hours)
    if (now - timestamp > QR_CODES_CACHE_EXPIRY) {
      localStorage.removeItem(key);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error reading cached technician QR code:', error);
    return null;
  }
};

// Cache technician QR code
export const cacheTechnicianQrCode = (technicianId: string, qrCodeUrl: string): void => {
  if (typeof window === 'undefined') return;
  
  try {
    const key = `hydrogenro_tech_qr_${technicianId}`;
    const cacheData = {
      data: qrCodeUrl,
      timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Error caching technician QR code:', error);
  }
};

