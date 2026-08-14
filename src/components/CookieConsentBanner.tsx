import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { readCookieConsent, writeCookieConsent } from '@/lib/cookieConsent';
import { isNativeApp } from '@/lib/isNativeApp';
import { shouldIndexPath } from '@/lib/publicSiteSeo';

/** Bottom banner: analytics cookies only after explicit accept. Public website only. */
export default function CookieConsentBanner() {
  const { pathname } = useLocation();
  const skip = isNativeApp() || !shouldIndexPath(pathname);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (skip) {
      setVisible(false);
      return;
    }
    setVisible(!readCookieConsent());
  }, [skip]);

  if (skip || !visible) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[90] border-t bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-4"
      role="dialog"
      aria-label="Cookie and analytics consent"
    >
      <div className="mx-auto w-full max-w-4xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
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
            className="w-full sm:w-auto"
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
