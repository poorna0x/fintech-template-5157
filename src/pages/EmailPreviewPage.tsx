import { Navigate, useSearchParams } from 'react-router-dom';

/** Legacy route — opens the admin email composer dialog. */
export default function EmailPreviewRedirect() {
  const [params] = useSearchParams();
  const customerId = params.get('customerId');
  const template = params.get('template') || params.get('emailTemplate') || 'general';

  if (customerId) {
    const qs = new URLSearchParams({
      composeEmail: customerId,
      emailTemplate: template,
    });
    return <Navigate to={`/admin?${qs.toString()}`} replace />;
  }

  return <Navigate to="/admin?composeEmail=1" replace />;
}
