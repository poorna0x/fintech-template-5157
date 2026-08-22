import { useEffect, useState } from 'react';
import {
  canShowWhatsAppCloudSendUi,
  fetchWhatsAppCrmSettings,
  isWhatsAppCloudApiMasterEnabled,
  peekWhatsAppCrmSettingsCache,
  type WhatsAppSendSource,
} from '@/lib/whatsappCrmSettings';

/**
 * Gate Cloud API send UI when Settings → WhatsApp master (or surface allow_*) is off.
 * Does not hide phone wa.me — those stay available like pre-Cloud CRM.
 * Uses cache first so buttons can hide without waiting on network.
 * Re-reads when settings are saved (wa-crm-settings-changed).
 */
export function useWhatsAppCloudApiGate(source?: WhatsAppSendSource | string | null) {
  const cached = peekWhatsAppCrmSettingsCache();
  const [masterEnabled, setMasterEnabled] = useState(() =>
    cached ? isWhatsAppCloudApiMasterEnabled(cached) : true
  );
  const [cloudApiOn, setCloudApiOn] = useState(() =>
    cached ? canShowWhatsAppCloudSendUi(cached, source) : true
  );
  const [ready, setReady] = useState(() => Boolean(cached));

  useEffect(() => {
    let cancelled = false;
    const load = (force?: boolean) => {
      void fetchWhatsAppCrmSettings(force ? { force: true } : undefined).then(({ settings }) => {
        if (cancelled) return;
        setMasterEnabled(isWhatsAppCloudApiMasterEnabled(settings));
        setCloudApiOn(canShowWhatsAppCloudSendUi(settings, source));
        setReady(true);
      });
    };
    load();
    const onChange = () => load(true);
    window.addEventListener('wa-crm-settings-changed', onChange);
    return () => {
      cancelled = true;
      window.removeEventListener('wa-crm-settings-changed', onChange);
    };
  }, [source]);

  return { ready, cloudApiOn, masterEnabled };
}
