import React, { useEffect, useRef, useState } from 'react';
import { useSecurity } from '@/contexts/SecurityContext';

// Extend HTML elements to include altcha-widget
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'altcha-widget': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          challengeurl?: string;
          verifyurl?: string;
          auto?: 'off' | 'onfocus' | 'onload' | 'onsubmit';
          name?: string;
          id?: string;
          language?: string;
          hidefooter?: boolean;
          hidelogo?: boolean;
          maxnumber?: number;
          workers?: number;
        },
        HTMLElement
      >;
    }
  }
}

interface AltchaWidgetProps {
  onVerify: (isValid: boolean, payload?: string) => void;
  onAutoSubmit?: () => void;
  className?: string;
  autoStart?: boolean; // If false, requires manual activation
  buttonText?: string; // For backward compatibility (not used with official widget)
  hidden?: boolean; // Run in background
}

const AltchaWidget: React.FC<AltchaWidgetProps> = ({
  onVerify,
  onAutoSubmit,
  className = '',
  autoStart = true,
  hidden = false,
}) => {
  const widgetRef = useRef<HTMLElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { difficultyLevel, isRateLimited } = useSecurity();
  const isVerifyingRef = useRef(false); // Prevent duplicate verification requests

  // Calculate complexity based on difficulty (similar to our custom implementation)
  // Lower base complexity for faster verification (1-2 seconds typical)
  const getComplexity = () => {
    const baseComplexity = 12; // Reduced from 14 for faster verification
    const additionalComplexity = (difficultyLevel - 1) * 0.5; // Smaller increments
    return Math.min(Math.floor(baseComplexity + additionalComplexity), 14); // Max 14 instead of 18
  };

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) return;

    // Configure the widget
    const apiUrl = import.meta.env.DEV
      ? 'http://localhost:8888/.netlify/functions/altcha-verify'
      : '/.netlify/functions/altcha-verify';

    const widgetElement = widget as any; // Type assertion for web component

    // Wait for widget to load before configuring
    const handleLoad = () => {
      setIsLoading(false);
      setError(null);
      
      // Small delay to ensure widget is fully ready
      setTimeout(() => {
        try {
          // Configure widget programmatically - match official ALTCHA styling
          widgetElement.configure({
            challengeurl: `${apiUrl}?complexity=${getComplexity()}`,
            auto: autoStart ? 'onload' : 'off',
            workers: Math.min(navigator.hardwareConcurrency || 4, 8),
            hidefooter: false, // Show footer to match official
            hidelogo: false, // Show logo to match official
          });
        } catch (err) {
          console.error('Widget configuration error:', err);
          setError('Failed to configure verification');
          onVerify(false);
        }
      }, 100);
    };

    // Verify payload with server
    const verifyWithServer = async (payload: string) => {
      // Prevent duplicate verification requests
      if (isVerifyingRef.current) {
        console.log('Verification already in progress, skipping duplicate request');
        return;
      }
      
      try {
        isVerifyingRef.current = true;
        setIsLoading(true);
        setError(null);
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.verified) {
          setIsLoading(false);
          setError(null);
          onVerify(true, payload);
          // Auto-submit if callback provided
          if (onAutoSubmit) {
            setTimeout(() => {
              onAutoSubmit();
            }, 300);
          }
        } else {
          setIsLoading(false);
          setError(result.error || 'Verification failed. Please try again.');
          onVerify(false);
        }
      } catch (error: any) {
        console.error('Server verification error:', error);
        setIsLoading(false);
        setError(error.message || 'Verification failed. Please try again.');
        onVerify(false);
      } finally {
        isVerifyingRef.current = false;
      }
    };

    // Listen for state changes
    const handleStateChange = (e: CustomEvent) => {
      const state = e.detail?.state;
      const payload = e.detail?.payload;

      if (state === 'verified' && payload) {
        // Widget verified client-side, now verify with server
        verifyWithServer(payload);
      } else if (state === 'error') {
        setIsLoading(false);
        setError(e.detail?.error || 'Verification failed. Please try again.');
        onVerify(false);
      } else if (state === 'expired') {
        setIsLoading(false);
        setError('Verification expired. Please try again.');
        onVerify(false);
      } else if (state === 'verifying') {
        setIsLoading(true);
        setError(null);
      } else if (state === 'unverified') {
        setIsLoading(false);
        onVerify(false);
      }
    };

    // Listen for verified event (verification complete)
    const handleVerified = (e: CustomEvent) => {
      const payload = e.detail?.payload;
      if (payload) {
        // Verify with server
        verifyWithServer(payload);
      }
    };

    // Check if widget is already loaded
    if (widgetElement.getConfiguration) {
      // Widget already loaded, configure immediately
      handleLoad();
    } else {
      // Wait for load event
      widget.addEventListener('load', handleLoad);
    }
    
    widget.addEventListener('statechange', handleStateChange as EventListener);
    widget.addEventListener('verified', handleVerified as EventListener);

    return () => {
      widget.removeEventListener('load', handleLoad);
      widget.removeEventListener('statechange', handleStateChange as EventListener);
      widget.removeEventListener('verified', handleVerified as EventListener);
    };
  }, [autoStart, onVerify, onAutoSubmit, difficultyLevel]);

  if (hidden) {
    return (
      <div className="hidden">
        <altcha-widget
          ref={widgetRef}
          id="altcha-widget-hidden"
        />
      </div>
    );
  }

  if (isRateLimited) {
    return (
      <div className={`flex flex-col items-center justify-center w-full ${className}`}>
        <div className="text-center p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg max-w-md">
          <p className="text-sm text-orange-700 dark:text-orange-300">
            Too many attempts. Please wait before trying again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center w-full ${className}`}>
      {/* ALTCHA Widget - Centered, using official styling exactly */}
      <div className="flex justify-center items-center w-full">
        <altcha-widget
          ref={widgetRef}
          id="altcha-widget"
          style={{
            display: 'block',
          }}
        />
      </div>
    </div>
  );
};

export default AltchaWidget;
