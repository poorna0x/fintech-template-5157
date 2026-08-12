import { useEffect } from 'react';

const CALL_TEL = 'tel:+919880693311';

/** WhatsApp Call us CTA / deep link — opens the phone dialer. */
export default function CallDialPage() {
  useEffect(() => {
    window.location.replace(CALL_TEL);
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', textAlign: 'center' }}>
      <p>Opening dialer…</p>
      <p>
        <a href={CALL_TEL}>Tap here if the dialer did not open</a>
      </p>
    </main>
  );
}
