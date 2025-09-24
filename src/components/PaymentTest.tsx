import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { initializePaymentGateway } from '@/config/cashfree';
import { PaymentOrder, PaymentResponse } from '@/types/payment';

const PaymentTest: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [paymentResponse, setPaymentResponse] = useState<PaymentResponse | null>(null);
  
  const [formData, setFormData] = useState({
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    customerPhone: '+91-9876543210',
    amount: 15000,
    paymentMethod: 'upi'
  });

  const handlePayment = async () => {
    setIsProcessing(true);
    setPaymentStatus('processing');

    try {
      // Initialize Cashfree
      const cashfreeService = initializePaymentGateway();
      if (!cashfreeService) {
        throw new Error('Failed to initialize payment gateway');
      }

      // Create payment order
      const orderData: PaymentOrder = {
        orderId: `TEST_${Date.now()}`,
        orderAmount: formData.amount,
        orderCurrency: 'INR',
        orderNote: `Test payment for ₹${formData.amount}`,
        customerDetails: {
          customerId: 'test_customer_001',
          customerName: formData.customerName,
          customerEmail: formData.customerEmail,
          customerPhone: formData.customerPhone,
        },
        orderMeta: {
          paymentMethods: formData.paymentMethod,
        }
      };

      console.log('Creating payment order:', orderData);
      
      const response = await cashfreeService.createOrder(orderData);
      
      if (response.status === 'SUCCESS') {
        setPaymentResponse(response);
        setPaymentStatus('success');
        toast.success(`Payment initiated successfully! Order ID: ${response.orderId}`);
      } else {
        setPaymentStatus('failed');
        toast.error(response.message || 'Payment failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus('failed');
      toast.error('Payment processing failed: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusIcon = () => {
    switch (paymentStatus) {
      case 'processing':
        return <Loader2 className="w-6 h-6 animate-spin text-blue-600" />;
      case 'success':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'failed':
        return <XCircle className="w-6 h-6 text-red-600" />;
      default:
        return <CreditCard className="w-6 h-6 text-gray-600" />;
    }
  };

  const getStatusText = () => {
    switch (paymentStatus) {
      case 'processing':
        return 'Processing Payment...';
      case 'success':
        return 'Payment Initiated Successfully!';
      case 'failed':
        return 'Payment Failed';
      default:
        return 'Ready to Test Payment';
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Cashfree Payment Gateway Test - ₹15,000
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Test Form */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  value={formData.customerName}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerEmail: e.target.value }))}
                  placeholder="Enter email"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerPhone: e.target.value }))}
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="Enter amount"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value) => setFormData(prev => ({ ...prev, paymentMethod: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cc">Credit Card</SelectItem>
                  <SelectItem value="dc">Debit Card</SelectItem>
                  <SelectItem value="netbanking">Net Banking</SelectItem>
                  <SelectItem value="wallet">Wallets</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Payment Status */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-center gap-3 p-4">
              {getStatusIcon()}
              <span className="text-lg font-medium">{getStatusText()}</span>
            </div>
            
            {paymentResponse && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">Payment Response:</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Order ID:</span> {paymentResponse.orderId}
                  </div>
                  <div>
                    <span className="font-medium">Amount:</span> ₹{paymentResponse.amount}
                  </div>
                  <div>
                    <span className="font-medium">Status:</span> {paymentResponse.status}
                  </div>
                  {paymentResponse.paymentId && (
                    <div>
                      <span className="font-medium">Payment ID:</span> {paymentResponse.paymentId}
                    </div>
                  )}
                  {paymentResponse.message && (
                    <div>
                      <span className="font-medium">Message:</span> {paymentResponse.message}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Test Button */}
          <div className="flex justify-center">
            <Button
              onClick={handlePayment}
              disabled={isProcessing || paymentStatus === 'success'}
              className="bg-blue-600 hover:bg-blue-700 min-w-[200px]"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing Payment...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Test Payment Gateway
                </>
              )}
            </Button>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Test Instructions:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• This is a test environment - no real money will be charged</li>
              <li>• Use test credentials provided by Cashfree</li>
              <li>• Default amount is set to ₹15,000 as requested</li>
              <li>• Check browser console for detailed logs</li>
              <li>• Verify payment response in the response section above</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentTest;
