import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  CreditCard, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Smartphone,
  Building2,
  Wallet,
  Loader2,
  ExternalLink,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { getCashfreeService, initializeCashfree } from '@/lib/cashfree';
import { PaymentOrder, PaymentResponse } from '@/types/payment';
import { CASHFREE_CONFIG } from '@/config/cashfree';

const CustomerPayment: React.FC = () => {
  const [paymentData, setPaymentData] = useState({
    customerName: 'Customer',
    customerEmail: 'customer@example.com',
    customerPhone: '+91-9876543210',
    serviceType: 'RO Service',
    jobNumber: 'RO-' + Date.now(),
    amount: 15000,
    status: 'pending'
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'success' | 'failed'>('pending');
  const [paymentResponse, setPaymentResponse] = useState<PaymentResponse | null>(null);
  const [paymentUrl, setPaymentUrl] = useState('');
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Auto-generate payment data - no forms needed
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Use URL parameters if provided, otherwise use defaults
    setPaymentData({
      customerName: urlParams.get('name') || 'Customer',
      customerEmail: urlParams.get('email') || 'customer@example.com',
      customerPhone: urlParams.get('phone') || '+91-9876543210',
      serviceType: urlParams.get('service') || 'RO Service',
      jobNumber: urlParams.get('job') || 'RO-' + Date.now(),
      amount: 15000,
      status: 'pending'
    });
    
    // Always skip the form - go directly to payment
    setShowCustomerForm(false);

    // Initialize Cashfree payment gateway
    const initPaymentGateway = async () => {
      try {
        await initializeCashfree(CASHFREE_CONFIG);
        console.log('Cashfree payment gateway initialized successfully');
        setIsInitializing(false);
      } catch (error) {
        console.error('Failed to initialize Cashfree:', error);
        toast.error('Payment gateway initialization failed');
        setIsInitializing(false);
      }
    };

    initPaymentGateway();
  }, []);

  const paymentMethods = [
    { id: 'upi', name: 'UPI', icon: Smartphone, description: 'Pay using UPI ID' },
    { id: 'cc', name: 'Credit Card', icon: CreditCard, description: 'Pay using credit card' },
    { id: 'dc', name: 'Debit Card', icon: CreditCard, description: 'Pay using debit card' },
    { id: 'netbanking', name: 'Net Banking', icon: Building2, description: 'Pay using net banking' },
    { id: 'wallet', name: 'Wallets', icon: Wallet, description: 'Pay using digital wallets' },
  ];

  const handlePayment = async (method: string) => {
    setIsProcessing(true);
    setPaymentStatus('processing');

    try {
      const cashfreeService = getCashfreeService();
      
      const orderData: PaymentOrder = {
        orderId: `RO_${paymentData.jobNumber}_${Date.now()}`,
        orderAmount: paymentData.amount,
        orderCurrency: 'INR',
        orderNote: `Payment for ${paymentData.serviceType} - ${paymentData.jobNumber}`,
        customerDetails: {
          customerId: `CUST_${Date.now()}`,
          customerName: paymentData.customerName,
          customerEmail: paymentData.customerEmail,
          customerPhone: paymentData.customerPhone,
        },
        orderMeta: {
          paymentMethods: method,
        }
      };

      console.log('Creating payment order:', orderData);
      console.log('Cashfree service initialized:', !!cashfreeService);
      
      const response = await cashfreeService.createOrder(orderData);
      console.log('Payment response:', response);
      setPaymentResponse(response);
      
        if (response.status === 'SUCCESS') {
          // Use payment link from response
          const paymentUrl = response.paymentLink || `https://sandbox.cashfree.com/pg/checkout/${response.paymentId}`;
          setPaymentUrl(paymentUrl);

          // Open Cashfree payment page in new tab
          window.open(paymentUrl, '_blank');

          toast.success('Redirecting to payment gateway...');
          setPaymentStatus('success');

          // Update payment data
          setPaymentData(prev => ({ ...prev, status: 'paid' }));
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

  const copyPaymentUrl = () => {
    if (paymentUrl) {
      navigator.clipboard.writeText(paymentUrl);
      toast.success('Payment link copied to clipboard!');
    }
  };

  const getStatusIcon = () => {
    switch (paymentStatus) {
      case 'processing':
        return <Loader2 className="w-8 h-8 animate-spin text-blue-600" />;
      case 'success':
        return <CheckCircle className="w-8 h-8 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-8 h-8 text-red-600" />;
      default:
        return <Clock className="w-8 h-8 text-yellow-600" />;
    }
  };

  const getStatusText = () => {
    switch (paymentStatus) {
      case 'processing':
        return 'Processing Payment...';
      case 'success':
        return 'Payment Successful!';
      case 'failed':
        return 'Payment Failed';
      default:
        return 'Ready to Pay';
    }
  };

  const getStatusColor = () => {
    switch (paymentStatus) {
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  // Show loading screen while initializing
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Initializing Payment Gateway</h2>
          <p className="text-gray-600">Please wait while we set up your payment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Pay ₹15,000 - RO Service
          </h1>
          <p className="text-gray-600">
            Quick and secure payment through Cashfree gateway
          </p>
        </div>

        {/* Payment Status */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-4 p-6">
              {getStatusIcon()}
              <div className="text-center">
                <h3 className="text-xl font-semibold mb-2">{getStatusText()}</h3>
                <Badge className={`${getStatusColor()} border-0`}>
                  {paymentStatus.toUpperCase()}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Details */}
        <Card className="mb-8 border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-center">Payment Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-4xl font-bold text-green-600 mb-2">
                ₹15,000
              </div>
              <p className="text-gray-600 mb-4">RO Service Payment</p>
              <div className="bg-white p-4 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Service:</span>
                    <p className="font-medium">{paymentData.serviceType}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Job Number:</span>
                    <p className="font-medium">{paymentData.jobNumber}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        {paymentStatus === 'pending' && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-center text-blue-900">Choose Payment Method</CardTitle>
              <p className="text-center text-blue-700">Select your preferred payment method to pay ₹15,000</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  return (
                    <Button
                      key={method.id}
                      onClick={() => handlePayment(method.id)}
                      disabled={isProcessing}
                      className="h-auto p-6 flex items-center gap-4 justify-start bg-white hover:bg-gray-50 border-2 hover:border-blue-300"
                      variant="outline"
                    >
                      <Icon className="w-6 h-6 text-blue-600" />
                      <div className="text-left">
                        <p className="font-semibold text-lg">{method.name}</p>
                        <p className="text-sm text-gray-600">{method.description}</p>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment URL Display */}
        {paymentUrl && (
          <Card className="mb-8 border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ExternalLink className="w-5 h-5" />
                Payment Gateway
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-blue-800">
                  You will be redirected to Cashfree payment gateway to complete your payment of ₹15,000.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={paymentUrl}
                    readOnly
                    className="bg-white"
                  />
                  <Button
                    onClick={copyPaymentUrl}
                    variant="outline"
                    size="sm"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  onClick={() => window.open(paymentUrl, '_blank')}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Payment Gateway
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success Message */}
        {paymentStatus === 'success' && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="text-center">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-green-900 mb-2">
                  Payment Gateway Redirected!
                </h3>
                <p className="text-green-700 mb-4">
                  You have been redirected to Cashfree payment gateway. Complete your payment of ₹15,000 there.
                </p>
                {paymentResponse && (
                  <div className="bg-white p-4 rounded-lg text-left">
                    <h4 className="font-medium text-gray-900 mb-2">Payment Details:</h4>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div><strong>Order ID:</strong> {paymentResponse.orderId}</div>
                      <div><strong>Amount:</strong> ₹{paymentResponse.amount}</div>
                      <div><strong>Status:</strong> {paymentResponse.status}</div>
                      {paymentResponse.paymentId && (
                        <div><strong>Payment ID:</strong> {paymentResponse.paymentId}</div>
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-4">
                  <Button
                    onClick={() => window.open(paymentUrl, '_blank')}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Payment Gateway
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Failed Message */}
        {paymentStatus === 'failed' && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-red-900 mb-2">
                  Payment Failed
                </h3>
                <p className="text-red-700 mb-4">
                  There was an issue processing your payment. Please try again.
                </p>
                <Button
                  onClick={() => setPaymentStatus('pending')}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Processing Message */}
        {paymentStatus === 'processing' && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="text-center">
                <Loader2 className="w-16 h-16 text-blue-600 mx-auto mb-4 animate-spin" />
                <h3 className="text-xl font-semibold text-blue-900 mb-2">
                  Processing Payment...
                </h3>
                <p className="text-blue-700">
                  Please wait while we process your payment of ₹15,000.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CustomerPayment;
