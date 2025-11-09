import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { requestNotificationPermission } from '@/lib/notifications';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Wrench, Eye, EyeOff, Droplets } from 'lucide-react';
import AltchaWidget from '@/components/AltchaWidget';
import { registerTechnicianPWA } from '@/lib/pwa';

const TechnicianLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [showSecurityStep, setShowSecurityStep] = useState(false);
  const [captchaStartTime] = useState(Date.now());

  const { login } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    registerTechnicianPWA();
  }, []);


  // Auto-verify captcha in development mode when accessed from local network
  useEffect(() => {
    if (import.meta.env.DEV) {
      // Check if accessing from local network IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      const isLocalNetwork = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(window.location.hostname);
      if (isLocalNetwork) {
        // Auto-verify for local network access in development - set immediately
        console.log('[TechnicianLogin] Auto-verifying captcha for local network access');
        setIsCaptchaVerified(true);
        setShowSecurityStep(false);
      }
    }
    
    // Fallback: If ALTCHA takes too long (5 seconds), auto-verify for local network
    const timeout = setTimeout(() => {
      if (import.meta.env.DEV && !isCaptchaVerified) {
        const isLocalNetwork = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(window.location.hostname);
        if (isLocalNetwork) {
          console.log('[TechnicianLogin] Captcha timeout - auto-verifying for local network');
          setIsCaptchaVerified(true);
          setShowSecurityStep(false);
        }
      }
    }, 5000);
    
    return () => clearTimeout(timeout);
  }, [isCaptchaVerified]);

  // Extract login logic to be called automatically after verification
  const performLogin = async () => {
    if (!email || !password) {
      return; // Don't auto-login if fields are empty
    }

    setIsLoading(true);
    setError('');

    try {
      const success = await login(email, password);
      
      if (success) {
        console.log('Login successful, navigating to technician dashboard...');
        // Request notification permission for job updates
        await requestNotificationPermission();
        // Small delay to ensure state is updated
        setTimeout(() => {
          console.log('Navigating to /technician');
          navigate('/technician', { replace: true });
        }, 100);
      } else {
        console.log('Login failed - success was false');
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
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
      const timeSinceStart = Date.now() - captchaStartTime;
      // Show security step if more than 3 seconds have passed without verification
      if (timeSinceStart > 3000) {
        setShowSecurityStep(true);
      }
    } else if (isCaptchaVerified) {
      setShowSecurityStep(false); // Hide if verified
    }
  }, [isCaptchaVerified, captchaStartTime]);

  // Track verification status
  const handleVerify = (isValid: boolean) => {
    setIsCaptchaVerified(isValid);
    if (isValid) {
      setShowSecurityStep(false);
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

              {/* Hidden ALTCHA widget - runs verification in background (skip for local network in dev) */}
              {import.meta.env.DEV && /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(window.location.hostname) ? null : (
                <div className="hidden">
                  <AltchaWidget
                    onVerify={handleVerify}
                    autoStart={true}
                    hidden={true}
                  />
                </div>
              )}

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
