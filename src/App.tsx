import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SecurityProvider } from "./contexts/SecurityContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthPortalCoordinator } from "./components/AuthPortalCoordinator";
import { Suspense, lazy, useEffect } from "react";
import { useGlobalButtonHaptics } from "@/hooks/useGlobalButtonHaptics";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PerformanceMonitor from "./components/PerformanceMonitor";
import PublicSiteSeo from "./components/PublicSiteSeo";
import GoogleAnalytics from "./components/GoogleAnalytics";
import CookieConsentBanner from "./components/CookieConsentBanner";
import { SEO_CITY_SERVICE_PAGES, SEO_LOCATION_PAGES, SEO_SERVICE_PAGES } from "@/lib/publicSeoPages";
import { disablePWA } from "@/lib/pwa";
import { isTechnicianPortalPath } from "@/lib/authPortal";
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
const PublicTechOfficeStatusPage = lazy(() => import("./pages/PublicTechOfficeStatusPage"));
const WherePwaLaunchPage = lazy(() => import("./pages/WherePwaLaunchPage"));
const PayUpi = lazy(() => import("./pages/PayUpi"));
const CallDialPage = lazy(() => import("./pages/CallDialPage"));

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

// Component to handle PWA enable/disable based on route
const PWARouteHandler = () => {
  const location = useLocation();
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    // Family office-status PWA owns its own SW/manifest — leave it alone.
    if (location.pathname === '/where' || location.pathname.startsWith('/where/')) return;

    // Admin app routes (must match admin-manifest scope / install — do not disablePWA here)
    const isPWAPage =
      isTechnicianPortalPath(location.pathname) ||
      location.pathname.startsWith('/admin') ||
      location.pathname.startsWith('/settings');
    
    if (!isPWAPage) {
      disablePWA();
    }
    // Note: PWA is enabled by registerTechnicianPWA() or registerAdminPWA() 
    // when those components mount, so we don't need to enable it here

    // Security: only warm the admin/data chunks AFTER we know the visitor is
    // actually an authenticated admin. Otherwise an anonymous visitor to /admin
    // would download `admin-data-*.js` (which contains all RPC + table names).
    if (location.pathname.startsWith('/admin')) {
      if (user && isAdmin) {
        void import('./components/AdminDashboard');
        void import('./lib/supabase');
      }
    } else if (isTechnicianPortalPath(location.pathname)) {
      void import('./pages/TechnicianDashboard');
    }
  }, [location.pathname, user, isAdmin]);

  return null;
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <SecurityProvider>
        <AuthProvider>
            <TooltipProvider>
            {import.meta.env.DEV ? <PerformanceMonitor /> : null}
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <NativeBackButton />
              <GlobalHaptics />
              <AuthPortalCoordinator />
              <PublicSiteSeo />
              <GoogleAnalytics />
              <CookieConsentBanner />
              <PWARouteHandler />
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
                  <Route path="/where/:token" element={<PublicTechOfficeStatusPage />} />
                  <Route path="/where" element={<WherePwaLaunchPage />} />
                  <Route path="/where/*" element={<WherePwaLaunchPage />} />
                  
                  {/* Search route - return 404 */}
                  <Route path="/search" element={<NotFound />} />
                  
                  {/* City × service pages — e.g. /ro-installation-in-mysuru */}
                  {SEO_CITY_SERVICE_PAGES.map(({ path }) => (
                    <Route key={path} path={path} element={<Services />} />
                  ))}

                  {/* Service-specific pages — same UI, unique SEO URLs */}
                  {SEO_SERVICE_PAGES.map(({ path }) => (
                    <Route key={path} path={path} element={<Services />} />
                  ))}

                  {/* Location-specific pages — same UI, unique SEO URLs */}
                  {SEO_LOCATION_PAGES.map(({ path }) => (
                    <Route key={path} path={path} element={<ServiceAreas />} />
                  ))}
                  
                  {/* Technician ID Card - Public route */}
                  <Route path="/technician-id/:id" element={<TechnicianIdCard />} />
                  
                  {/* Product Verification - Public route */}
                  <Route path="/product-verify/:id" element={<ProductVerification />} />

                  {/* Short UPI pay links: /p/xK9m2q — also legacy /pay-upi?... */}
                  <Route path="/p/:code" element={<PayUpi />} />
                  <Route path="/pay-upi" element={<PayUpi />} />
                  <Route path="/call" element={<CallDialPage />} />

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </SecurityProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
