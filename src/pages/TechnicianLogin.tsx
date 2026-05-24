import React, { useState, useEffect, useRef } from 'react';
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
import TurnstileWidget, {
  isTurnstileEnabled,
  type TurnstileWidgetHandle,
} from '@/components/TurnstileWidget';
import { registerTechnicianPWA, disablePWA, isPWAMode } from '@/lib/pwa';
import { clearWrongPortalSession } from '@/lib/authPortal';
import { formatLoginError } from '@/lib/loginResult';

const TechnicianLogin = () => {
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
   *  (e.g. on failure → don't loop). A fresh Turnstile token resets it. */
  const autoSubmitTokenRef = useRef<string | null>(null);
  const loginInFlightRef = useRef(false);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  /** Latest creds, read by the auto-submit effect without re-firing on every keystroke. */
  const credsRef = useRef({ email: '', password: '' });
  /** (email|password) combos that have already failed this page session — skip auto-submit
   *  so a Turnstile auto-pass doesn't spam Supabase with the same wrong password. */
  const failedCredsRef = useRef<Set<string>>(new Set());

  const { login, loading: authLoading, user, authInitializing } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    document.title = 'Hydrogen RO Technician';
    registerTechnicianPWA();
    void clearWrongPortalSession('technician');
    setIsCaptchaVerified(false);
    setAltchaLoginToken('');
    setAltchaPayload('');
    setShowSecurityStep(false);
    if (captchaTimeout) {
      clearTimeout(captchaTimeout);
      setCaptchaTimeout(null);
    }
    return () => {
      disablePWA();
    };
  }, []);

  // Already logged in as technician — go to dashboard (avoids stuck spinner loop)
  useEffect(() => {
    if (authInitializing) return;
    if (user?.role === 'technician') {
      navigate('/technician', { replace: true });
    }
  }, [user, authInitializing, navigate]);

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



  useEffect(() => {
    credsRef.current = { email, password };
  }, [email, password]);

  const resetTurnstileAfterFailure = () => {
    if (!turnstileRequired) return;
    setTurnstileToken('');
    turnstileRef.current?.reset();
  };

  const devLog = (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log(...args);
  };

  // Extract login logic to be called automatically after verification
  const performLogin = async () => {
    if (!email || !password) {
      return;
    }
    if (loginInFlightRef.current) {
      return;
    }
    loginInFlightRef.current = true;

    setIsLoading(true);
    setError('');

    const { getSupabaseConfigError } = await import('@/lib/supabaseConfig');
    const configError = getSupabaseConfigError();
    if (configError) {
      setError(configError);
      toast.error('Server configuration error — contact admin');
      loginInFlightRef.current = false;
      setIsLoading(false);
      return;
    }

    try {
      const isChromeMobile =
        typeof window !== 'undefined' &&
        /Chrome/i.test(navigator.userAgent) &&
        /Mobile|Android/i.test(navigator.userAgent);

      const loginTimeoutMs = isPWAMode() ? 70_000 : isChromeMobile ? 35_000 : 50_000;
      devLog('[TechnicianLogin] timeout', `${loginTimeoutMs / 1000}s`);

      const loginPromise = login(
        email,
        password,
        altchaLoginToken,
        altchaPayload,
        turnstileToken
      );
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Login timeout')), loginTimeoutMs)
      );

      const result = await Promise.race([loginPromise, timeoutPromise]);

      if (result.ok) {
        navigate('/technician', { replace: true });
      } else {
        failedCredsRef.current.add(`${email}::${password}`);
        autoSubmitTokenRef.current = null;
        resetTurnstileAfterFailure();
        setError(
          formatLoginError(result, 'Login failed. Please check your credentials.')
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (import.meta.env.DEV) console.error('[TechnicianLogin]', err);
      if (message.includes('timeout')) {
        setError('Connection timeout. Please check your internet connection and try again.');
        toast.error('Connection timeout. Please check your network.');
      } else {
        setError('Login failed. Please try again.');
        toast.error('Login failed. Please try again.');
      }
    } finally {
      loginInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginInFlightRef.current) return;
    setError('');

    // Check if CAPTCHA is verified before proceeding
    if (!isCaptchaVerified || !altchaLoginToken) {
      // Show security step if not verified yet (fallback)
      setShowSecurityStep(true);
      setError('Please complete the security verification before logging in.');
      return;
    }

    // Turnstile guards the raw Supabase /auth/v1/token endpoint (which bypasses
    // our proxy). Only enforce when a site key is configured.
    if (turnstileRequired && !turnstileToken) {
      setError('Please complete the Cloudflare security check before logging in.');
      return;
    }

    await performLogin();
  };

  // Check if security step should be shown (fallback if auto-verification fails)
  useEffect(() => {
    if (!isCaptchaVerified) {
      // Set timeout to show security step if verification doesn't complete in 5 seconds
      const timeout = setTimeout(() => {
        if (import.meta.env.DEV) {
          console.log('[Login] ALTCHA verification timeout - showing security step');
        }
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

  // Auto-submit ONLY when CAPTCHA state changes — never on email/password keystrokes
  // (those are read from credsRef). A failed (email|password) combo is recorded so a
  // Turnstile auto-pass after failure does not re-submit the same wrong password.
  useEffect(() => {
    if (isLoading || loginInFlightRef.current) return;
    if (!isCaptchaVerified || !altchaLoginToken) return;
    if (turnstileRequired && !turnstileToken) return;

    const { email: e, password: p } = credsRef.current;
    if (!e || !p) return;
    if (failedCredsRef.current.has(`${e}::${p}`)) return;

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
    isLoading,
  ]);

  // Track verification status
  const handleVerify = (isValid: boolean, payload?: string, loginToken?: string) => {
    if (import.meta.env.DEV) {
      console.log('[Login] ALTCHA verification result:', isValid);
    }
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
                    ref={turnstileRef}
                    onToken={setTurnstileToken}
                    action="technician-login"
                    size="flexible"
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                disabled={
                  isLoading ||
                  !isCaptchaVerified ||
                  !altchaLoginToken ||
                  (turnstileRequired && !turnstileToken)
                }
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
