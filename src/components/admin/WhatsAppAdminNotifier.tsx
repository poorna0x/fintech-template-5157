import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  setWhatsAppAlertNavigator,
  startWhatsAppAdminAlerts,
} from '@/lib/whatsappAdminAlerts';

/** Global admin listener for inbound WhatsApp messages (toast + desktop notify). */
export function WhatsAppAdminNotifier() {
  const navigate = useNavigate();

  useEffect(() => {
    setWhatsAppAlertNavigator((path) => navigate(path));
    return startWhatsAppAdminAlerts();
  }, [navigate]);

  return null;
}
