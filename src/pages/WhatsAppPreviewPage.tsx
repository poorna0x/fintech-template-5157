import { Navigate, useSearchParams } from 'react-router-dom';

/** Legacy route — opens the admin WhatsApp composer dialog. */
export default function WhatsAppPreviewRedirect() {
  const [params] = useSearchParams();
  const customerId = params.get('customerId');
  const template = params.get('template') || params.get('whatsappTemplate') || 'general';

  if (customerId) {
    const qs = new URLSearchParams({
      composeWhatsApp: customerId,
      whatsappTemplate: template,
    });
    return <Navigate to={`/admin?${qs.toString()}`} replace />;
  }

  return <Navigate to="/admin?composeWhatsApp=1" replace />;
}
