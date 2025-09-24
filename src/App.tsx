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
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const PaymentTest = lazy(() => import("./components/PaymentTest"));
const PaymentTestSimple = lazy(() => import("./components/PaymentTestSimple"));
const PaymentRequest = lazy(() => import("./pages/PaymentRequest"));
const CustomerPayment = lazy(() => import("./pages/CustomerPayment"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentWebhook = lazy(() => import("./pages/PaymentWebhook"));

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
                  <Route path="/cookie-policy" element={<CookiePolicy />} />
            <Route path="/payment-test" element={<PaymentTest />} />
            <Route path="/payment-test-simple" element={<PaymentTestSimple />} />
            <Route path="/payment-request" element={<PaymentRequest />} />
            <Route path="/pay" element={<CustomerPayment />} />
            <Route path="/payment/success" element={<PaymentSuccess />} />
            <Route path="/payment/webhook" element={<PaymentWebhook />} />
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
