// Cashfree Payment Gateway Configuration
export const CASHFREE_CONFIG = {
  // Production credentials
  appId: import.meta.env.VITE_CASHFREE_APP_ID || 'test_app_id',
  secretKey: import.meta.env.VITE_CASHFREE_SECRET_KEY || 'test_secret_key',
  environment: (import.meta.env.VITE_CASHFREE_ENVIRONMENT as 'sandbox' | 'production') || 'production',
  
  // URLs - Update for production
  returnUrl: import.meta.env.VITE_CASHFREE_RETURN_URL || 'https://yourdomain.com/payment/success',
  notifyUrl: import.meta.env.VITE_CASHFREE_NOTIFY_URL || 'https://yourdomain.com/payment/webhook',
  
  // Default payment settings
  currency: 'INR',
  defaultAmount: 15000, // ₹15,000 as requested
  
  // Payment methods
  supportedMethods: [
    'upi',
    'cc', // Credit Card
    'dc', // Debit Card
    'netbanking',
    'wallet',
    'paylater',
    'emi'
  ],
  
  // Test credentials for sandbox
  testCredentials: {
    appId: 'test_app_id',
    secretKey: 'test_secret_key',
    environment: 'sandbox' as const
  }
};

// Initialize Cashfree with configuration
export const initializePaymentGateway = async () => {
  try {
    const { initializeCashfree } = await import('@/lib/cashfree');
    
    return initializeCashfree({
      appId: CASHFREE_CONFIG.appId,
      secretKey: CASHFREE_CONFIG.secretKey,
      environment: CASHFREE_CONFIG.environment,
      returnUrl: CASHFREE_CONFIG.returnUrl,
      notifyUrl: CASHFREE_CONFIG.notifyUrl,
    });
  } catch (error) {
    console.error('Failed to initialize Cashfree:', error);
    return null;
  }
};
