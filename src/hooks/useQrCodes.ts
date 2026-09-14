import { useState, useCallback, useEffect } from 'react';
import { db } from '@/lib/supabase';
import { getCachedQrCodes, cacheQrCodes, CommonQrCode, mapCommonQrRow } from '@/lib/qrCodeManager';

export const useQrCodes = () => {
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);

  const loadQrCodes = useCallback(async (force = false) => {
    try {
      console.log('Loading QR codes...');

      const cachedCommon = getCachedQrCodes();
      // Instant paint from cache, always soft-refresh so shared QRs stay in sync across devices.
      if (!force && cachedCommon && cachedCommon.length > 0) {
        console.log('Using cached QR codes (soft-refreshing):', cachedCommon.length, 'items');
        setCommonQrCodes(cachedCommon);
      }

      console.log('Fetching QR codes from database...');
      const commonResult = await db.commonQrCodes.getAll();

      if (commonResult.error) {
        console.error('Error fetching QR codes:', commonResult.error);
        if (cachedCommon && cachedCommon.length > 0) {
          setCommonQrCodes(cachedCommon);
        } else {
          setCommonQrCodes([]);
        }
        return;
      }

      if (commonResult.data) {
        const transformed = commonResult.data
          .map((qr: any) => mapCommonQrRow(qr))
          .filter(Boolean) as CommonQrCode[];
        console.log('QR codes loaded from DB:', transformed.length, 'items');
        setCommonQrCodes(transformed);
        cacheQrCodes(transformed);
      } else {
        console.log('No QR codes found');
        setCommonQrCodes([]);
        cacheQrCodes([]);
      }
    } catch (error) {
      console.error('Error loading QR codes:', error);
      const cachedCommon = getCachedQrCodes();
      if (cachedCommon && cachedCommon.length > 0) {
        setCommonQrCodes(cachedCommon);
      } else {
        setCommonQrCodes([]);
      }
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadQrCodes();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadQrCodes]);

  return {
    commonQrCodes,
    loadQrCodes,
  };
};
