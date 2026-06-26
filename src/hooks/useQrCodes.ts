import { useState, useCallback, useEffect } from 'react';
import { db } from '@/lib/supabase';
import { getCachedQrCodes, cacheQrCodes, CommonQrCode } from '@/lib/qrCodeManager';

export const useQrCodes = () => {
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);

  const loadQrCodes = useCallback(async (force = false) => {
    try {
      console.log('Loading QR codes...');

      const cachedCommon = getCachedQrCodes();
      if (!force && cachedCommon && cachedCommon.length > 0) {
        console.log('Using cached QR codes:', cachedCommon.length, 'items');
        setCommonQrCodes(cachedCommon);
        return;
      }

      console.log('Fetching QR codes from database...');
      const commonResult = await db.commonQrCodes.getAll();

      if (commonResult.error) {
        console.error('Error fetching QR codes:', commonResult.error);
        // If we have cached data, keep using it even if fetch fails
        if (cachedCommon && cachedCommon.length > 0) {
          setCommonQrCodes(cachedCommon);
        } else {
          setCommonQrCodes([]);
        }
        return;
      }

      if (commonResult.data) {
        const transformed = commonResult.data.map((qr: any) => ({
          id: qr.id,
          name: qr.name,
          qrCodeUrl: qr.qr_code_url,
          createdAt: qr.created_at,
          updatedAt: qr.updated_at
        }));
        console.log('QR codes loaded from DB:', transformed.length, 'items');
        setCommonQrCodes(transformed);
        // Always update cache with fresh data
        cacheQrCodes(transformed);
      } else {
        console.log('No QR codes found');
        setCommonQrCodes([]);
      }
    } catch (error) {
      console.error('Error loading QR codes:', error);
      // Fallback to cache if available
      const cachedCommon = getCachedQrCodes();
      if (cachedCommon && cachedCommon.length > 0) {
        setCommonQrCodes(cachedCommon);
      } else {
        setCommonQrCodes([]);
      }
    }
  }, []);

  // Reload QR codes when page becomes visible only if cache is expired
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check if cache is expired before reloading
        const cachedCommon = getCachedQrCodes();
        if (!cachedCommon || cachedCommon.length === 0) {
          console.log('Page became visible, cache expired, reloading QR codes...');
          loadQrCodes();
        } else {
          console.log('Page became visible, using cached QR codes');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadQrCodes]);

  return {
    commonQrCodes,
    loadQrCodes
  };
};

