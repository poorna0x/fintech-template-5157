import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Check, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useSecurity } from '@/contexts/SecurityContext';
import { Button } from '@/components/ui/button';

interface AltchaCaptchaProps {
  onVerify: (isValid: boolean) => void;
  onAutoSubmit?: () => void;
  className?: string;
  autoStart?: boolean; // If false, requires manual activation (better for login pages)
  buttonText?: string; // Custom button text (e.g., "Submit Booking", "Start Verification")
}

interface Challenge {
  salt: string;
  number: number;
  maxNumber: number;
  algorithm: string;
  timestamp: number;
}

const AltchaCaptcha: React.FC<AltchaCaptchaProps> = ({ 
  onVerify, 
  onAutoSubmit,
  className = '',
  autoStart = true, // Default to auto-start for backward compatibility
  buttonText = 'Start Verification' // Default button text
}) => {
  const altchaRef = useRef<HTMLDivElement>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const workerRef = useRef<Worker | null>(null);
  
  const {
    difficultyLevel,
    isRateLimited,
    incrementAttempts,
    timeOnPage,
    mouseMovements,
    keystrokes,
    behaviorScore,
    isHumanBehavior,
  } = useSecurity();
  
  const [buttonReady, setButtonReady] = useState(false);
  const [pageLoadTime] = useState(Date.now());
  
  // Track form interactions - check periodically for input values
  useEffect(() => {
    if (autoStart) return;
    
    const checkFormInputs = () => {
      // Check if any input field has a value (user has typed)
      const hasInputValue = document.querySelector('input[type="email"]:not(:placeholder-shown), input[type="password"]:not(:placeholder-shown), input[type="text"]:not(:placeholder-shown)');
      if (hasInputValue && !buttonReady) {
        // Force re-check by updating state
        const timeSinceLoad = Date.now() - pageLoadTime;
        if (timeSinceLoad >= 300) {
          setButtonReady(true);
        }
      }
    };
    
    // Check every 300ms for form inputs
    const interval = setInterval(checkFormInputs, 300);
    
    return () => clearInterval(interval);
  }, [autoStart, buttonReady, pageLoadTime]);

  // Adjust complexity based on security difficulty level
  // Optimized for fast verification (0.5-1.5 seconds) while maintaining security
  const getComplexity = useCallback(() => {
    // Lower complexity = faster verification
    // Base: 14 = ~0.5 seconds on average device
    // Max: 18 = ~2 seconds (only for high difficulty)
    const baseComplexity = 14; // Fast verification
    const additionalComplexity = (difficultyLevel - 1) * 1; // Smaller multiplier
    return Math.min(baseComplexity + additionalComplexity, 18); // Reduced max
  }, [difficultyLevel]);

  // Generate SHA-256 hash
  const sha256 = async (message: string): Promise<string> => {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Solve proof-of-work challenge (optimized for speed)
  const solveChallenge = useCallback(async (challenge: Challenge): Promise<number | null> => {
    setIsSolving(true);
    
    try {
      // Proof-of-work: find a number that when hashed with salt, produces a hash < target
      const target = challenge.maxNumber;
      const salt = challenge.salt;
      const maxAttempts = target * 2; // Reasonable limit
      
      // Optimized sequential processing with early exit
      // Sequential is often faster than parallel for this use case
      for (let number = 0; number < maxAttempts; number++) {
        const message = `${salt}:${number}`;
        const hash = await sha256(message);
        
        // Convert first 8 hex characters to number (0-2^32)
        const hashNum = parseInt(hash.substring(0, 8), 16);
        
        if (hashNum < target) {
          // Found solution!
          return number;
        }
        
        // Yield to UI every 20 iterations to prevent blocking
        if (number % 20 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      
      return null;
    } catch (err) {
      console.error('Proof-of-work solving error:', err);
      return null;
    } finally {
      setIsSolving(false);
    }
  }, []);

  // Get challenge from server
  const getChallenge = useCallback(async (): Promise<Challenge | null> => {
    try {
      // In development, use localhost:8888 (dev server), otherwise use relative path
      const apiUrl = import.meta.env.DEV
        ? 'http://localhost:8888/.netlify/functions/altcha-verify'
        : '/.netlify/functions/altcha-verify';

      const response = await fetch(`${apiUrl}?complexity=${getComplexity()}`);
      
      if (!response.ok) {
        throw new Error('Failed to get challenge');
      }

      const data = await response.json();
      return {
        salt: data.salt,
        number: data.number,
        maxNumber: data.maxNumber,
        algorithm: data.algorithm || 'SHA-256',
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error('Failed to get challenge:', err);
      return null;
    }
  }, [getComplexity]);

  // Verify solution with server
  const verifySolution = useCallback(async (challenge: Challenge, solution: number): Promise<boolean> => {
    try {
      incrementAttempts();

      // In development, use localhost:8888 (dev server), otherwise use relative path
      const apiUrl = import.meta.env.DEV
        ? 'http://localhost:8888/.netlify/functions/altcha-verify'
        : '/.netlify/functions/altcha-verify';

      // Create payload
      const payload = btoa(JSON.stringify({
        salt: challenge.salt,
        number: solution,
        algorithm: challenge.algorithm,
      }));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload }),
      });

      const result = await response.json();
      return result.verified === true;
    } catch (err) {
      console.error('Verification error:', err);
      return false;
    }
  }, [incrementAttempts]);

  // Start verification process
  const startVerification = useCallback(async () => {
    if (isRateLimited) {
      setError('Too many attempts. Please wait before trying again.');
      setIsLoading(false);
      onVerify(false);
      return;
    }
    
    // Additional security checks for manual activation
    if (!autoStart) {
      const timeSinceLoad = Date.now() - pageLoadTime;
      
      // Require minimum time on page (reduced to 1 second for better UX)
      if (timeSinceLoad < 1000) {
        setError('Please wait a moment before starting verification.');
        return;
      }
      
      // On login pages, typing in form fields counts as interaction
      // So we're more lenient - just need some time or interaction
      if (timeSinceLoad < 500 && mouseMovements === 0 && keystrokes === 0) {
        setError('Please interact with the form first.');
        return;
      }
      
      // Check if clicked too quickly (suspicious) - only for very fast clicks
      if (timeSinceLoad < 1500 && mouseMovements === 0 && keystrokes === 0) {
        setError('Please type in your email or password first, then try again.');
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    setIsVerified(false);

    try {
      // Get challenge
      const newChallenge = await getChallenge();
      if (!newChallenge) {
        throw new Error('Failed to get challenge');
      }

      setChallenge(newChallenge);

      // Solve proof-of-work
      const solution = await solveChallenge(newChallenge);
      if (!solution) {
        setError('Failed to solve challenge. Please try again.');
        setIsLoading(false);
        onVerify(false);
        return;
      }

      // Verify with server
      const verified = await verifySolution(newChallenge, solution);
      
      if (verified) {
        setIsVerified(true);
        onVerify(true);
        
        // Auto-submit after successful verification
        if (onAutoSubmit) {
          setTimeout(() => {
            onAutoSubmit();
          }, 500);
        }
      } else {
        setError('Verification failed. Please try again.');
        setIsVerified(false);
        onVerify(false);
        // Reset challenge to allow retry
        setChallenge(null);
      }
    } catch (err) {
      console.error('Verification process error:', err);
      setError('Security verification failed. Please try again.');
      setIsVerified(false);
      onVerify(false);
    } finally {
      setIsLoading(false);
    }
  }, [isRateLimited, getChallenge, solveChallenge, verifySolution, onVerify, onAutoSubmit]);

  // Check if button should be enabled (behavioral checks)
  useEffect(() => {
    if (autoStart) {
      // Auto-start behavior - handled separately
      return;
    }
    
    // For manual start, require behavioral checks
    const timeSinceLoad = Date.now() - pageLoadTime;
    const minTimeOnPage = 300; // Very short wait (0.3 seconds)
    
    // Count interactions: mouse movements, keystrokes, or any page interaction
    const hasInteraction = mouseMovements > 0 || keystrokes > 0;
    
    // Check if any input field on page has value (form interaction)
    // This is checked periodically in another useEffect
    const hasFormInput = !!document.querySelector('input[type="email"]:not(:placeholder-shown), input[type="password"]:not(:placeholder-shown), input[type="text"]:not(:placeholder-shown)');
    
    // Enable button after minimum time OR if user has interacted OR if form has input
    // This makes it very responsive for login forms where users type
    if (timeSinceLoad >= minTimeOnPage || hasInteraction || hasFormInput) {
      setButtonReady(true);
    } else {
      // Reset verification state
      setIsVerified(false);
      onVerify(false);
      setButtonReady(false);
    }
  }, [autoStart, pageLoadTime, mouseMovements, keystrokes, onVerify]);
  
  // Handle auto-start separately
  useEffect(() => {
    if (autoStart && !isVerified && !isLoading) {
      startVerification();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);
  
  // Reset button state when component mounts
  useEffect(() => {
    if (!autoStart) {
      setIsVerified(false);
      onVerify(false);
      setButtonReady(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const handleRefresh = () => {
    setChallenge(null);
    startVerification();
  };

  if (isRateLimited) {
    return (
      <div className={`bg-card border-2 border-orange-200 dark:border-orange-800 rounded-xl p-6 shadow-lg ${className}`}>
        <div className="text-center">
          <div className="mb-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 mb-3">
              <AlertTriangle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Too Many Attempts</h3>
          <p className="text-base text-muted-foreground leading-relaxed">
            Please wait a few moments before trying again. This helps us keep your account secure.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-card border-2 border-border rounded-xl p-6 shadow-lg ${className}`}>
      {/* Header with larger, clearer status */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {isVerified ? (
            <>
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30">
                <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Verified</h3>
                <p className="text-sm text-muted-foreground">You're all set!</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <div className="w-4 h-4 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse"></div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Security Verification</h3>
                <p className="text-sm text-muted-foreground">Protecting your information</p>
              </div>
            </>
          )}
        </div>
        {!isVerified && !isLoading && autoStart && (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={handleRefresh}
            className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
            disabled={isSolving}
            aria-label="Refresh verification"
          >
            <RefreshCw className="w-5 h-5" />
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {isLoading || isSolving ? (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-base font-medium text-foreground mb-1">
                  {isSolving ? 'Verifying Security...' : 'Preparing...'}
                </p>
              </div>
            </div>
          </div>
        ) : !isVerified && !autoStart ? (
          <div className="text-center py-4 space-y-4">
            {!buttonReady ? (
              <>
                <div className="space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4 max-w-md mx-auto">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-base font-semibold text-foreground mb-1">
                          Almost Ready!
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Start typing your email or password in the fields above. The verification button will appear automatically when you're ready.
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    className="w-full h-12 text-base font-medium opacity-50 cursor-not-allowed"
                  >
                    {buttonText}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3 mb-2">
                  <div className="bg-green-50 dark:bg-green-950/20 border-2 border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-base font-semibold text-foreground mb-1">
                      ✓ Ready to Verify
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Click the button below. This usually takes 1-2 seconds.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="default"
                  size="lg"
                  onClick={startVerification}
                  className="w-full h-14 text-base font-semibold shadow-md hover:shadow-lg transition-shadow"
                  disabled={isRateLimited}
                >
                  {buttonText}
                </Button>
              </>
            )}
          </div>
        ) : isVerified ? (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-950/30 border-2 border-green-200 dark:border-green-800">
              <Check className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div className="text-left">
                <p className="text-base font-semibold text-green-700 dark:text-green-300">
                  Verification Complete!
                </p>
                <p className="text-sm text-green-600 dark:text-green-400">
                  You can now proceed with your booking
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-base text-muted-foreground">
              Click refresh to start verification
            </p>
          </div>
        )}

        {error && !isVerified && (
          <div className="p-4 bg-destructive/10 dark:bg-destructive/20 border-2 border-destructive/30 dark:border-destructive/40 rounded-lg">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-base font-semibold text-destructive mb-1">Verification Error</h4>
                <p className="text-base text-destructive/90 leading-relaxed">{error}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleRefresh}
              className="w-full h-11 text-base font-medium border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AltchaCaptcha;
