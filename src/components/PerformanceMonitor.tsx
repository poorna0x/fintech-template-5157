import { useEffect } from 'react';

// Declare global types for better TypeScript support
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

const PerformanceMonitor = () => {
  useEffect(() => {
    // Monitor Core Web Vitals
    import('web-vitals').then((webVitals) => {
      const { onCLS, onINP, onFCP, onLCP, onTTFB } = webVitals;
      
      onCLS((metric) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('CLS:', metric);
        }
      });
      onINP((metric) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('INP:', metric);
        }
      });
      onFCP((metric) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('FCP:', metric);
        }
      });
      onLCP((metric) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('LCP:', metric);
        }
      });
      onTTFB((metric) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('TTFB:', metric);
        }
      });
    }).catch((error) => {
      console.warn('Failed to load web-vitals:', error);
    });

    // Monitor page load performance
    const handlePageLoad = () => {
      setTimeout(() => {
        try {
          const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          
          if (perfData) {
            const metrics = {
              // DNS lookup time
              dns: perfData.domainLookupEnd - perfData.domainLookupStart,
              // TCP connection time
              tcp: perfData.connectEnd - perfData.connectStart,
              // Request time
              request: perfData.responseEnd - perfData.requestStart,
              // Response time
              response: perfData.responseEnd - perfData.responseStart,
              // DOM processing time
              domProcessing: perfData.domComplete - perfData.domContentLoadedEventStart,
              // Total page load time
              totalLoad: perfData.loadEventEnd - perfData.fetchStart,
            };

            // Log performance metrics in development
            if (process.env.NODE_ENV === 'development') {
              console.log('Performance Metrics:', metrics);
            }

            // Send to analytics in production
            if (process.env.NODE_ENV === 'production' && window.gtag) {
              window.gtag('event', 'page_performance', {
                event_category: 'Performance',
                event_label: 'Page Load',
                value: Math.round(metrics.totalLoad),
                custom_map: {
                  dns_time: Math.round(metrics.dns),
                  tcp_time: Math.round(metrics.tcp),
                  request_time: Math.round(metrics.request),
                  response_time: Math.round(metrics.response),
                  dom_processing_time: Math.round(metrics.domProcessing),
                }
              });
            }
          }
        } catch (error) {
          console.warn('Failed to get performance metrics:', error);
        }
      }, 0);
    };

    // Add event listener for page load
    if (document.readyState === 'complete') {
      handlePageLoad();
    } else {
      window.addEventListener('load', handlePageLoad);
    }

    // Monitor memory usage
    let memoryInterval: NodeJS.Timeout | null = null;
    
    if ('memory' in performance) {
      const logMemoryUsage = () => {
        try {
          const memory = (performance as any).memory;
          if (memory) {
            const memoryInfo = {
              used: Math.round(memory.usedJSHeapSize / 1048576), // MB
              total: Math.round(memory.totalJSHeapSize / 1048576), // MB
              limit: Math.round(memory.jsHeapSizeLimit / 1048576), // MB
            };

            if (process.env.NODE_ENV === 'development') {
              console.log('Memory Usage:', memoryInfo);
            }

            // Alert if memory usage is high
            if (memoryInfo.used > memoryInfo.limit * 0.8) {
              console.warn('High memory usage detected:', memoryInfo);
            }
          }
        } catch (error) {
          console.warn('Failed to get memory usage:', error);
        }
      };

      // Log memory usage every 30 seconds
      memoryInterval = setInterval(logMemoryUsage, 30000);
    }

    // Cleanup function
    return () => {
      if (memoryInterval) {
        clearInterval(memoryInterval);
      }
      window.removeEventListener('load', handlePageLoad);
    };
  }, []);

  return null; // This component doesn't render anything
};

export default PerformanceMonitor;
