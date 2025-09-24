import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const PaymentTestSimple: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string>('');

  const testPayment = async () => {
    setIsLoading(true);
    setResult('');

    try {
      console.log('🧪 Starting simple payment test...');
      
      // Test 1: Check if Cashfree service can be imported
      console.log('📦 Testing import...');
      const { getCashfreeService, initializeCashfree } = await import('@/lib/cashfree');
      console.log('✅ Import successful');

      // Test 2: Check if service can be initialized
      console.log('🔧 Testing initialization...');
      const { CASHFREE_CONFIG } = await import('@/config/cashfree');
      console.log('✅ Config loaded:', CASHFREE_CONFIG);

      // Test 3: Initialize service
      console.log('🚀 Initializing service...');
      const service = initializeCashfree(CASHFREE_CONFIG);
      console.log('✅ Service initialized:', !!service);

      // Test 4: Test createOrder
      console.log('💳 Testing createOrder...');
      const orderData = {
        orderId: 'TEST_ORDER_123',
        orderAmount: 15000,
        orderCurrency: 'INR',
        orderNote: 'Test payment',
        customerDetails: {
          customerId: 'TEST_CUSTOMER',
          customerName: 'Test User',
          customerEmail: 'test@example.com',
          customerPhone: '9876543210',
        },
        orderMeta: {
          paymentMethods: 'upi',
        }
      };

      console.log('📋 Order data:', orderData);
      const response = await service.createOrder(orderData);
      console.log('✅ Order created:', response);

      setResult('✅ All tests passed! Payment system is working correctly.');
    } catch (error) {
      console.error('❌ Test failed:', error);
      setResult(`❌ Test failed: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>🧪 Simple Payment Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            This is a simple test to check if the payment system is working without any complex UI.
          </p>
          
          <Button 
            onClick={testPayment} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Testing...' : 'Run Payment Test'}
          </Button>

          {result && (
            <div className={`p-4 rounded-lg ${
              result.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              <pre className="whitespace-pre-wrap">{result}</pre>
            </div>
          )}

          <div className="text-sm text-gray-500">
            <p>Check the browser console for detailed logs.</p>
            <p>This test will help us identify where the API error is coming from.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentTestSimple;
