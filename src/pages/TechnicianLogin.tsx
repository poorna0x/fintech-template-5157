import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
// Notification permissions removed - only using toast notifications
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Wrench, Eye, EyeOff, Droplets } from 'lucide-react';
import { toast } from 'sonner';
import AltchaWidget from '@/components/AltchaWidget';
import { registerTechnicianPWA, disablePWA } from '@/lib/pwa';
import { clearAuthSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const TechnicianLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [showSecurityStep, setShowSecurityStep] = useState(false);
  const [captchaStartTime] = useState(Date.now());
  const [captchaTimeout, setCaptchaTimeout] = useState<NodeJS.Timeout | null>(null);

  const { login, loading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    registerTechnicianPWA();
    
    // PWA fix: Clear any stale auth state when login page loads
    // This ensures clean state after logout
    if (user) {
      console.log('[Login] User still exists after logout, clearing...');
      // Force clear - user shouldn't be here on login page
      clearAuthSession();
      // Clear Supabase session too
      supabase.auth.signOut().catch(() => {});
    }
    
    // Reset ALTCHA state on mount (important after logout)
    setIsCaptchaVerified(false);
    setShowSecurityStep(false);
    if (captchaTimeout) {
      clearTimeout(captchaTimeout);
      setCaptchaTimeout(null);
    }
    
    // Cleanup: disable PWA when component unmounts
    return () => {
      disablePWA();
    };
  }, []); // Only run on mount

  // Don't block login page rendering - it should show immediately
  // The auth loading state should not prevent login page from displaying

  // Add noindex meta tag to prevent search engine indexing
  useEffect(() => {
    // Remove any existing robots meta tag
    const existingRobots = document.querySelector('meta[name="robots"]');
    if (existingRobots) {
      existingRobots.remove();
    }
    
    // Add noindex meta tag
    const metaRobots = document.createElement('meta');
    metaRobots.name = 'robots';
    metaRobots.content = 'noindex, nofollow';
    document.head.appendChild(metaRobots);
    
    // Also add X-Robots-Tag header via meta tag
    const metaXRobots = document.createElement('meta');
    metaXRobots.httpEquiv = 'X-Robots-Tag';
    metaXRobots.content = 'noindex, nofollow';
    document.head.appendChild(metaXRobots);
    
    return () => {
      // Cleanup on unmount
      const robotsTag = document.querySelector('meta[name="robots"]');
      if (robotsTag && robotsTag.getAttribute('content') === 'noindex, nofollow') {
        robotsTag.remove();
      }
      const xRobotsTag = document.querySelector('meta[http-equiv="X-Robots-Tag"]');
      if (xRobotsTag) {
        xRobotsTag.remove();
      }
    };
  }, []);



  // Extract login logic to be called automatically after verification
  const performLogin = async () => {
    if (!email || !password) {
      return; // Don't auto-login if fields are empty
    }

    setIsLoading(true);
    setError('');

    try {
      // Detect Chrome mobile for timeout handling
      const isChromeMobile = typeof window !== 'undefined' && 
        /Chrome/i.test(navigator.userAgent) && 
        /Mobile|Android/i.test(navigator.userAgent);
      
      // Add timeout wrapper for Chrome mobile
      const loginPromise = login(email, password);
      const timeoutPromise = new Promise<boolean>((_, reject) => 
        setTimeout(() => reject(new Error('Login timeout')), isChromeMobile ? 15000 : 30000)
      );
      
      const success = await Promise.race([loginPromise, timeoutPromise]) as boolean;
      
      if (success) {
        console.log('Login successful, navigating to technician dashboard...');
        // Small delay to ensure state is updated (reduced for Chrome mobile)
        setTimeout(() => {
          console.log('Navigating to /technician');
          navigate('/technician', { replace: true });
        }, isChromeMobile ? 50 : 100);
      } else {
        console.log('Login failed - success was false');
        setError('Login failed. Please try again.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err?.message?.includes('timeout')) {
        setError('Connection timeout. Please check your internet connection and try again.');
        toast.error('Connection timeout. Please check your network.');
      } else {
        setError('Login failed. Please try again.');
        toast.error('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Check if CAPTCHA is verified before proceeding
    if (!isCaptchaVerified) {
      // Show security step if not verified yet (fallback)
      setShowSecurityStep(true);
      setError('Please complete the security verification before logging in.');
      return;
    }
    
    await performLogin();
  };

  // Check if security step should be shown (fallback if auto-verification fails)
  useEffect(() => {
    if (!isCaptchaVerified) {
      // Set timeout to show security step if verification doesn't complete in 5 seconds
      const timeout = setTimeout(() => {
        console.log('[Login] ALTCHA verification timeout - showing security step');
        setShowSecurityStep(true);
      }, 5000); // 5 seconds timeout for PWA
      
      setCaptchaTimeout(timeout);
      
      // Cleanup timeout on unmount or when verified
      return () => {
        clearTimeout(timeout);
      };
    } else if (isCaptchaVerified) {
      setShowSecurityStep(false); // Hide if verified
      if (captchaTimeout) {
        clearTimeout(captchaTimeout);
        setCaptchaTimeout(null);
      }
    }
  }, [isCaptchaVerified]);

  // Track verification status
  const handleVerify = (isValid: boolean) => {
    console.log('[Login] ALTCHA verification result:', isValid);
    setIsCaptchaVerified(isValid);
    if (isValid) {
      setShowSecurityStep(false);
      // Clear timeout if verification succeeds
      if (captchaTimeout) {
        clearTimeout(captchaTimeout);
        setCaptchaTimeout(null);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Hydrogen RO Logo */}
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg">
              <Droplets className="w-7 h-7 text-primary-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              Hydrogen RO
            </div>
          </div>
        </div>

        <Card className="shadow-xl cosmic-card">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-4 shadow-lg">
              <Wrench className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-3xl font-bold text-card-foreground">
              Technician Login
            </CardTitle>
            <CardDescription className="text-muted-foreground text-base mt-2">
              Access your assigned jobs
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="technician@roservice.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  required
                  className="h-11"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                    required
                    className="h-11 pr-10"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Hidden ALTCHA widget - runs verification in background */}
              <div className="hidden">
                <AltchaWidget
                  onVerify={handleVerify}
                  autoStart={true}
                  hidden={true}
                />
              </div>

              {/* Fallback: Show security widget if auto-verification failed or took too long */}
              {showSecurityStep && !isCaptchaVerified && (
                <div className="space-y-2 border-t pt-4 mt-4">
                  <div className="text-center mb-2">
                    <p className="text-sm font-medium text-foreground">Security Verification</p>
                    <p className="text-xs text-muted-foreground">Please complete the security check to continue</p>
                  </div>
                  <AltchaWidget
                    onVerify={handleVerify}
                    autoStart={true}
                    className="mb-4"
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                disabled={isLoading || !isCaptchaVerified}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Signing in...
                  </div>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{' '}
                <span className="text-muted-foreground/70">
                  Contact administrator
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TechnicianLogin;
