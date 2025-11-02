import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SecurityProvider } from "./contexts/SecurityContext";
import { AuthProvider } from "./contexts/AuthContext";
import { Suspense, lazy } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PerformanceMonitor from "./components/PerformanceMonitor";

// Lazy load heavy components for better performance
const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const Booking = lazy(() => import("./pages/Booking"));
const TechnicianLogin = lazy(() => import("./pages/TechnicianLogin"));
const TechnicianDashboard = lazy(() => import("./pages/TechnicianDashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const PaymentTest = lazy(() => import("./components/PaymentTest"));
const PaymentTestSimple = lazy(() => import("./components/PaymentTestSimple"));
const PaymentRequest = lazy(() => import("./pages/PaymentRequest"));
const CustomerPayment = lazy(() => import("./pages/CustomerPayment"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentWebhook = lazy(() => import("./pages/PaymentWebhook"));

// New SEO pages
const Services = lazy(() => import("./pages/Services"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const ServiceAreas = lazy(() => import("./pages/ServiceAreas"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogArticle = lazy(() => import("./pages/BlogArticle"));

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
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/book" element={<Booking />} />
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/technician/login" element={<TechnicianLogin />} />
                  <Route path="/technician" element={<TechnicianDashboard />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/terms-of-service" element={<TermsOfService />} />
                  <Route path="/refund-policy" element={<RefundPolicy />} />
                  <Route path="/cookie-policy" element={<CookiePolicy />} />
                  <Route path="/payment-test" element={<PaymentTest />} />
                  <Route path="/payment-test-simple" element={<PaymentTestSimple />} />
                  <Route path="/payment-request" element={<PaymentRequest />} />
                  <Route path="/pay" element={<CustomerPayment />} />
                  <Route path="/payment/success" element={<PaymentSuccess />} />
                  <Route path="/payment/webhook" element={<PaymentWebhook />} />
                  
                  {/* SEO Pages */}
                  <Route path="/services" element={<Services />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/service-areas" element={<ServiceAreas />} />
                  <Route path="/booking" element={<Booking />} />
                  <Route path="/blog" element={<Blog />} />
                  <Route path="/blog/how-to-maintain-ro-purifier-at-home" element={<BlogArticle />} />
                  
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
