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
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PerformanceMonitor from "./components/PerformanceMonitor";
import CanonicalTag from "./components/CanonicalTag";
import GoogleAnalytics from "./components/GoogleAnalytics";
import { disablePWA } from "@/lib/pwa";

// Lazy load heavy components for better performance.
// AdminPortal and TechnicianLogin are lazy too so their login + captcha widget
// code stays out of the entry chunk that loads on every public page.
const AdminPortal = lazy(() => import("./pages/AdminPortal"));
const Booking = lazy(() => import("./pages/Booking"));
const TechnicianLogin = lazy(() => import("./pages/TechnicianLogin"));
const TechnicianDashboard = lazy(() => import("./pages/TechnicianDashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const CallingPage = lazy(() => import("./pages/CallingPage"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
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

// Loading component for lazy-loaded routes
const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="flex justify-center space-x-1">
      <div className="w-4 h-4 bg-primary rounded-full animate-bounce"></div>
      <div className="w-4 h-4 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
      <div className="w-4 h-4 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
    </div>
  </div>
);

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
    // Admin app routes (must match admin-manifest scope / install — do not disablePWA here)
    const isPWAPage =
      location.pathname.startsWith('/technician') ||
      location.pathname.startsWith('/admin') ||
      location.pathname.startsWith('/settings') ||
      location.pathname.startsWith('/calling');
    
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
    } else if (location.pathname.startsWith('/technician')) {
      void import('./pages/TechnicianDashboard');
    }
  }, [location.pathname, user, isAdmin]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <SecurityProvider>
        <AuthProvider>
          <TooltipProvider>
            <PerformanceMonitor />
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AuthPortalCoordinator />
              <GoogleAnalytics />
              <CanonicalTag />
              <PWARouteHandler />
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/book" element={<Booking />} />
                  <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
                  <Route path="/admin" element={<AdminPortal />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/calling" element={<CallingPage />} />
                  <Route path="/technician/login" element={<TechnicianLogin />} />
                  <Route path="/technician" element={<TechnicianDashboard />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/terms-of-service" element={<TermsOfService />} />
                  <Route path="/refund-policy" element={<RefundPolicy />} />
                  <Route path="/cookie-policy" element={<CookiePolicy />} />
                  <Route path="/disclaimer" element={<Disclaimer />} />
                  
                  {/* SEO Pages */}
                  <Route path="/services" element={<Services />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/service-areas" element={<ServiceAreas />} />
                  <Route path="/booking" element={<Booking />} />
                  <Route path="/blog" element={<Blog />} />
                  <Route path="/blog/:slug" element={<BlogArticle />} />
                  <Route path="/spare-parts" element={<SpareParts />} />
                  <Route path="/warranty" element={<Warranty />} />
                  
                  {/* Search route - return 404 */}
                  <Route path="/search" element={<NotFound />} />
                  
                  {/* Service-specific pages */}
                  <Route path="/ro-installation" element={<Services />} />
                  <Route path="/ro-repair" element={<Services />} />
                  <Route path="/water-softener" element={<Services />} />
                  <Route path="/filter-replacement" element={<Services />} />
                  <Route path="/ro-maintenance" element={<Services />} />
                  <Route path="/ro-troubleshooting" element={<Services />} />
                  <Route path="/ro-spare-parts" element={<Services />} />
                  <Route path="/ro-brands" element={<Services />} />
                  <Route path="/ro-price-list" element={<Services />} />
                  <Route path="/ro-warranty" element={<Services />} />
                  <Route path="/emergency-ro-repair" element={<Services />} />
                  <Route path="/same-day-ro-service" element={<Services />} />
                  
                  {/* Location-specific pages */}
                  <Route path="/ro-service-whitefield" element={<ServiceAreas />} />
                  <Route path="/ro-service-electronic-city" element={<ServiceAreas />} />
                  <Route path="/ro-service-koramangala" element={<ServiceAreas />} />
                  <Route path="/ro-service-hsr-layout" element={<ServiceAreas />} />
                  <Route path="/ro-service-indiranagar" element={<ServiceAreas />} />
                  <Route path="/ro-service-marathahalli" element={<ServiceAreas />} />
                  <Route path="/ro-service-btm-layout" element={<ServiceAreas />} />
                  <Route path="/ro-service-jayanagar" element={<ServiceAreas />} />
                  <Route path="/ro-service-malleshwaram" element={<ServiceAreas />} />
                  <Route path="/ro-service-rajajinagar" element={<ServiceAreas />} />
                  <Route path="/ro-service-hebbal" element={<ServiceAreas />} />
                  <Route path="/ro-service-yelahanka" element={<ServiceAreas />} />
                  <Route path="/ro-service-sarjapur" element={<ServiceAreas />} />
                  <Route path="/ro-service-bellandur" element={<ServiceAreas />} />
                  <Route path="/ro-service-jp-nagar" element={<ServiceAreas />} />
                  <Route path="/ro-service-banashankari" element={<ServiceAreas />} />
                  <Route path="/ro-service-bommanahalli" element={<ServiceAreas />} />
                  <Route path="/ro-service-bannerghatta" element={<ServiceAreas />} />

                  {/* Nearby city pages */}
                  <Route path="/ro-service-tumakuru" element={<ServiceAreas />} />
                  <Route path="/ro-service-hosur" element={<ServiceAreas />} />
                  <Route path="/ro-service-kolar" element={<ServiceAreas />} />
                  <Route path="/ro-service-ramanagara" element={<ServiceAreas />} />
                  <Route path="/ro-service-nelamangala" element={<ServiceAreas />} />
                  <Route path="/ro-service-doddaballapur" element={<ServiceAreas />} />
                  <Route path="/ro-service-devanahalli" element={<ServiceAreas />} />
                  <Route path="/ro-service-anekal" element={<ServiceAreas />} />
                  
                  {/* Technician ID Card - Public route */}
                  <Route path="/technician-id/:id" element={<TechnicianIdCard />} />
                  
                  {/* Product Verification - Public route */}
                  <Route path="/product-verify/:id" element={<ProductVerification />} />
                  
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
