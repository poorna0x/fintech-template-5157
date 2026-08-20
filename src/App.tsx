import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Suspense, lazy, useEffect } from "react";
import { useGlobalButtonHaptics } from "@/hooks/useGlobalButtonHaptics";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PerformanceMonitor from "./components/PerformanceMonitor";
import PublicSiteSeo from "./components/PublicSiteSeo";
import GoogleAnalytics from "./components/GoogleAnalytics";
import CookieConsentBanner from "./components/CookieConsentBanner";
import {
  findCityServicePage,
  findLocationPage,
  findServicePage,
} from "@/lib/publicSeoPages";
import { disablePWA } from "@/lib/pwa";
import { isTechnicianPortalPath } from "@/lib/portalPaths";
import { startNativeBackButtonHandler } from "@/lib/nativeBackButton";
import { isNativeApp } from "@/lib/isNativeApp";
import { PortalBootLoader } from "@/components/PortalBootLoader";

// APK cold open: start the portal entry chunk ASAP (overlaps with main-bundle parse).
if (typeof window !== "undefined" && isNativeApp()) {
  const path = window.location.pathname;
  if (path.startsWith("/technician")) {
    void import("./pages/TechnicianLogin");
  } else if (path.startsWith("/admin") || path.startsWith("/settings")) {
    void import("./pages/AdminPortal");
  }
}

// Lazy load heavy components for better performance.
// AdminPortal and TechnicianLogin are lazy too so their login + captcha widget
// code stays out of the entry chunk that loads on every public page.
const AdminPortal = lazy(() => import("./pages/AdminPortal"));
const Booking = lazy(() => import("./pages/Booking"));
const TechnicianLogin = lazy(() => import("./pages/TechnicianLogin"));
const TechnicianDashboard = lazy(() => import("./pages/TechnicianDashboard"));
const EmailPreviewRedirect = lazy(() => import("./pages/EmailPreviewPage"));
const WhatsAppPreviewRedirect = lazy(() => import("./pages/WhatsAppPreviewPage"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const PrivacyDataRequestPage = lazy(() => import("./pages/PrivacyDataRequestPage"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const Disclaimer = lazy(() => import("./pages/Disclaimer"));
// New SEO pages
const Services = lazy(() => import("./pages/Services"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const ServiceAreas = lazy(() => import("./pages/ServiceAreas"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogArticle = lazy(() => import("./pages/BlogArticle"));
const TechnicianIdCard = lazy(() => import("./pages/TechnicianIdCard"));
const ProductVerification = lazy(() => import("./pages/ProductVerification"));
const SpareParts = lazy(() => import("./pages/SpareParts"));
const Warranty = lazy(() => import("./pages/Warranty"));
const PublicPdfAuthenticityPage = lazy(() => import("./pages/PublicPdfAuthenticityPage"));
const PublicJobReviewPage = lazy(() => import("./pages/PublicJobReviewPage"));
const PublicDocumentAcceptPage = lazy(() => import("./pages/PublicDocumentAcceptPage"));
const PublicTechOfficeStatusPage = lazy(() => import("./pages/PublicTechOfficeStatusPage"));
const WherePwaLaunchPage = lazy(() => import("./pages/WherePwaLaunchPage"));
const PayUpi = lazy(() => import("./pages/PayUpi"));
const CallDialPage = lazy(() => import("./pages/CallDialPage"));
const PortalProviders = lazy(() => import("./components/PortalProviders"));
const PublicSecurityProviders = lazy(() => import("./components/PublicSecurityProviders"));

/**
 * One route handles the 1,000+ generated public SEO slugs. Rendering a
 * separate <Route> for every slug added substantial startup work on every
 * page, even though only one can ever match.
 */
function SeoLandingRoute() {
  const { pathname } = useLocation();
  if (findCityServicePage(pathname) || findServicePage(pathname)) {
    return <Services />;
  }
  if (findLocationPage(pathname)) {
    return <ServiceAreas />;
  }
  return <NotFound />;
}

/** Plain bounce — used for in-session Suspense (Settings, previews, tech dashboard, …). */
function PlainPortalSuspenseLoader() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
      <div className="flex justify-center space-x-1">
        <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

/**
 * Branded logo loader only on the first portal Suspense in this page load
 * (cold enter). Later lazy navigations stay plain so Settings / email preview
 * / tech dashboard don't flash logo+name again.
 */
let portalEntryLoaderShown = false;

const LoadingSpinner = () => {
  const { pathname } = useLocation();
  const isTechnicianPortal = pathname.startsWith("/technician");
  const isAdminPortal = pathname.startsWith("/admin") || pathname.startsWith("/settings");

  if (isTechnicianPortal || isAdminPortal) {
    if (!portalEntryLoaderShown) {
      portalEntryLoaderShown = true;
      return <PortalBootLoader showName={isAdminPortal} />;
    }
    return <PlainPortalSuspenseLoader />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex justify-center space-x-1">
        <div className="w-4 h-4 bg-primary rounded-full animate-bounce"></div>
        <div className="w-4 h-4 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
        <div className="w-4 h-4 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
      </div>
    </div>
  );
};

// Optimized QueryClient with better defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function isPortalPath(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/settings') ||
    isTechnicianPortalPath(pathname)
  );
}

/** Public pages that use AltchaWidget / honeypot (need SecurityProvider, not Auth). */
function isPublicSecurityPath(pathname: string): boolean {
  return (
    pathname === '/book' ||
    pathname === '/booking' ||
    pathname === '/warranty' ||
    pathname === '/authenticity' ||
    pathname === '/privacy-request'
  );
}

/**
 * Marketing pages stay provider-light. Portal routes get Auth + Security.
 * Public forms get Security only (ALTCHA / honeypot).
 */
const RouteProviders = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname === '/where' || pathname.startsWith('/where/')) return;
    if (!isPortalPath(pathname)) disablePWA();
  }, [pathname]);

  if (isPortalPath(pathname)) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <PortalProviders>{children}</PortalProviders>
      </Suspense>
    );
  }

  if (isPublicSecurityPath(pathname)) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <PublicSecurityProviders>{children}</PublicSecurityProviders>
      </Suspense>
    );
  }

  return <>{children}</>;
};

const GlobalHaptics = () => {
  useGlobalButtonHaptics(true);
  return null;
};

/** Capacitor Android: gesture/hardware back walks SPA history instead of exiting. */
const NativeBackButton = () => {
  useEffect(() => {
    void startNativeBackButtonHandler();
  }, []);
  return null;
};

/**
 * SPA footer/nav links change the path while leaving scroll at the bottom, so
 * the new page looks like "nothing happened". Scroll to top on pathname change;
 * leave hash-only jumps alone so /#testimonials etc. still work.
 */
const ScrollToTopOnNavigate = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        {import.meta.env.DEV ? <PerformanceMonitor /> : null}
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <NativeBackButton />
          <ScrollToTopOnNavigate />
          <GlobalHaptics />
          <PublicSiteSeo />
          <GoogleAnalytics />
          <CookieConsentBanner />
          <RouteProviders>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/book" element={<Booking />} />
                  <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin" element={<AdminPortal />} />
                  <Route path="/admin/email-preview" element={<EmailPreviewRedirect />} />
                  <Route path="/admin/whatsapp-preview" element={<WhatsAppPreviewRedirect />} />
                  <Route path="/settings" element={<AdminPortal />} />
                  <Route
                    path="/calling"
                    element={<Navigate to="/settings?section=calling&action=open" replace />}
                  />
                  <Route path="/technician/login" element={<TechnicianLogin />} />
                  <Route path="/technician" element={<TechnicianDashboard />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/privacy-request" element={<PrivacyDataRequestPage />} />
                  <Route path="/terms-of-service" element={<TermsOfService />} />
                  <Route path="/refund-policy" element={<RefundPolicy />} />
                  <Route path="/cookie-policy" element={<CookiePolicy />} />
                  <Route path="/disclaimer" element={<Disclaimer />} />
                  
                  {/* SEO Pages */}
                  <Route path="/services" element={<Services />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/service-areas" element={<ServiceAreas />} />
                  <Route path="/booking" element={<Navigate to="/book" replace />} />
                  <Route path="/blog" element={<Blog />} />
                  <Route path="/blog/:slug" element={<BlogArticle />} />
                  <Route path="/spare-parts" element={<SpareParts />} />
                  <Route path="/warranty" element={<Warranty />} />
                  <Route path="/authenticity" element={<PublicPdfAuthenticityPage />} />
                  <Route path="/review/:token" element={<PublicJobReviewPage />} />
                  <Route path="/accept/:token" element={<PublicDocumentAcceptPage />} />
                  <Route path="/where/:token" element={<PublicTechOfficeStatusPage />} />
                  <Route path="/where" element={<WherePwaLaunchPage />} />
                  <Route path="/where/*" element={<WherePwaLaunchPage />} />
                  
                  {/* Search route - return 404 */}
                  <Route path="/search" element={<NotFound />} />
                  
                  {/* Technician ID Card - Public route */}
                  <Route path="/technician-id/:id" element={<TechnicianIdCard />} />
                  
                  {/* Product Verification - Public route */}
                  <Route path="/product-verify/:id" element={<ProductVerification />} />

                  {/* Short UPI pay links: /p/xK9m2q — also legacy /pay-upi?... */}
                  <Route path="/p/:code" element={<PayUpi />} />
                  <Route path="/pay-upi" element={<PayUpi />} />
                  <Route path="/call" element={<CallDialPage />} />

                  {/* Generated city/service/location SEO landing pages. */}
                  <Route path="/:slug" element={<SeoLandingRoute />} />
                  
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
          </RouteProviders>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
