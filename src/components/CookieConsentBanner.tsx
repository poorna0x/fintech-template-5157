import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { readCookieConsent, writeCookieConsent } from '@/lib/cookieConsent';

/** Bottom banner: analytics cookies only after explicit accept. */
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!readCookieConsent());
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[90] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 p-4"
      role="dialog"
      aria-label="Cookie and analytics consent"
    >
      <div className="container mx-auto max-w-4xl flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground leading-snug">
          We use essential cookies to run this site. Optional analytics (Google Analytics) help us
          improve the website — only if you accept.{' '}
          <Link to="/cookie-policy" className="text-primary underline underline-offset-2">
            Cookie Policy
          </Link>
          {' · '}
          <Link to="/privacy-policy" className="text-primary underline underline-offset-2">
            Privacy Policy
          </Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              writeCookieConsent('rejected');
              setVisible(false);
            }}
          >
            Reject analytics
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              writeCookieConsent('accepted');
              setVisible(false);
            }}
          >
            Accept analytics
          </Button>
        </div>
      </div>
    </div>
  );
}
