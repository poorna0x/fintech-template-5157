import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearWrongPortalSession } from '@/lib/authPortal';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, EyeOff, Droplets } from 'lucide-react';
import { toast } from 'sonner';
import AltchaWidget from '@/components/AltchaWidget';
import TurnstileWidget, { isTurnstileEnabled } from '@/components/TurnstileWidget';
import { registerAdminPWA } from '@/lib/pwa';
import { formatLoginError } from '@/lib/loginResult';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [altchaLoginToken, setAltchaLoginToken] = useState('');
  const [altchaPayload, setAltchaPayload] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [showSecurityStep, setShowSecurityStep] = useState(false);
  const [captchaStartTime] = useState(Date.now());
  const [captchaTimeout, setCaptchaTimeout] = useState<NodeJS.Timeout | null>(null);
  const turnstileRequired = isTurnstileEnabled();
  /** Prevents the auto-submit effect from firing twice for the same token combo
   *  (e.g. on failure → don't loop). Reset when the user types or a new Turnstile
   *  token arrives. */
  const autoSubmitTokenRef = useRef<string | null>(null);

  const navigate = useNavigate();
  const { user, authInitializing, login } = useAuth();

  // Don't block login page rendering - it should show immediately
  // The auth loading state should not prevent login page from displaying

  useEffect(() => {
    registerAdminPWA();
    void clearWrongPortalSession('admin');
    setIsCaptchaVerified(false);
    setAltchaLoginToken('');
    setAltchaPayload('');
    setShowSecurityStep(false);
    if (captchaTimeout) {
      clearTimeout(captchaTimeout);
      setCaptchaTimeout(null);
    }
  }, []);

  useEffect(() => {
    if (authInitializing) return;
    if (user?.role === 'admin' && window.location.pathname !== '/admin') {
      navigate('/admin', { replace: true });
    }
  }, [user, authInitializing, navigate]);

  // Force light/white theme for admin login page
  useEffect(() => {
    // Remove dark mode classes to ensure white theme
    document.documentElement.classList.remove('dark-mode', 'dark');
  }, []);

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

    const { getSupabaseConfigError } = await import('@/lib/supabaseConfig');
    const configError = getSupabaseConfigError();
    if (configError) {
      setError(configError);
      toast.error('Server configuration error — contact admin');
      setIsLoading(false);
      return;
    }

    try {
      const result = await login(
        email,
        password,
        altchaLoginToken,
        altchaPayload,
        turnstileToken
      );
      if (result.ok) {
        navigate('/admin', { replace: true });
      } else {
        setError(
          formatLoginError(
            result,
            'Invalid email or password. Please check your credentials.'
          )
        );
      }
    } catch (err: unknown) {
      console.error('Login error:', err);
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      if (message.includes('timeout') || message.includes('network')) {
        setError('Connection timeout. Please check your internet connection and try again.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check if CAPTCHA is verified before proceeding
    if (!isCaptchaVerified || !altchaLoginToken) {
      // Show security step if not verified yet (fallback)
      setShowSecurityStep(true);
      setError('Please complete the security verification before logging in.');
      toast.error('Security verification required');
      return;
    }

    // Turnstile guards the raw Supabase /auth/v1/token endpoint (which bypasses
    // our proxy). Only enforce when a site key is configured.
    if (turnstileRequired && !turnstileToken) {
      setError('Please complete the Cloudflare security check before logging in.');
      toast.error('Security check required');
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

  // Auto-submit once all gates are green and credentials are present. The ref
  // prevents a second attempt for the same Turnstile token (avoid loop on bad
  // password). A fresh Turnstile token (re-challenge / expiry) resets the ref.
  useEffect(() => {
    if (isLoading) return;
    if (!email || !password) return;
    if (!isCaptchaVerified || !altchaLoginToken) return;
    if (turnstileRequired && !turnstileToken) return;

    const submitKey = `${altchaLoginToken}::${turnstileToken || 'none'}`;
    if (autoSubmitTokenRef.current === submitKey) return;
    autoSubmitTokenRef.current = submitKey;

    void performLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isCaptchaVerified,
    altchaLoginToken,
    turnstileToken,
    turnstileRequired,
    email,
    password,
    isLoading,
  ]);

  // Track verification status
  const handleVerify = (isValid: boolean, payload?: string, loginToken?: string) => {
    console.log('[Login] ALTCHA verification result:', isValid);
    setIsCaptchaVerified(isValid);
    if (payload) setAltchaPayload(payload);
    if (loginToken) setAltchaLoginToken(loginToken);
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
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
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
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-3xl font-bold text-card-foreground">Admin Login</CardTitle>
            <CardDescription className="text-muted-foreground text-base mt-2">
              Secure access to your dashboard
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your admin email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  required
                  disabled={isLoading}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                    required
                    disabled={isLoading}
                    className="w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
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

              {/* Background ALTCHA (not display:none — widget needs layout to run) */}
              <AltchaWidget onVerify={handleVerify} autoStart={true} hidden={true} />

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

              {/* Cloudflare Turnstile — guards the raw Supabase /auth/v1/token endpoint.
                  Renders only when VITE_TURNSTILE_SITE_KEY is set. */}
              {turnstileRequired && (
                <div className="pt-2">
                  <TurnstileWidget
                    onToken={setTurnstileToken}
                    action="admin-login"
                    size="flexible"
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                disabled={
                  isLoading ||
                  !isCaptchaVerified ||
                  !altchaLoginToken ||
                  (turnstileRequired && !turnstileToken)
                }
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Signing in...
                  </div>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLogin;
