import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const PaymentSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | 'pending' | 'loading'>('loading');
  const [paymentDetails, setPaymentDetails] = useState<any>(null);

  useEffect(() => {
    // Get payment details from URL parameters
    const orderId = searchParams.get('order_id');
    const paymentId = searchParams.get('cf_payment_id');
    const status = searchParams.get('status');
    const amount = searchParams.get('amount');

    if (orderId && paymentId) {
      setPaymentDetails({
        orderId,
        paymentId,
        status,
        amount: amount ? parseInt(amount) : 15000
      });

      // Determine payment status
      if (status === 'SUCCESS') {
        setPaymentStatus('success');
        toast.success('Payment completed successfully!');
      } else if (status === 'FAILED') {
        setPaymentStatus('failed');
        toast.error('Payment failed. Please try again.');
      } else {
        setPaymentStatus('pending');
      }
    } else {
      setPaymentStatus('failed');
      toast.error('Invalid payment response');
    }
  }, [searchParams]);

  const getStatusIcon = () => {
    switch (paymentStatus) {
      case 'success':
        return <CheckCircle className="w-16 h-16 text-green-500" />;
      case 'failed':
        return <XCircle className="w-16 h-16 text-red-500" />;
      case 'pending':
        return <Clock className="w-16 h-16 text-yellow-500" />;
      default:
        return <Clock className="w-16 h-16 text-gray-500" />;
    }
  };

  const getStatusMessage = () => {
    switch (paymentStatus) {
      case 'success':
        return {
          title: 'Payment Successful!',
          message: 'Your payment of ₹15,000 has been processed successfully.',
          color: 'text-green-600'
        };
      case 'failed':
        return {
          title: 'Payment Failed',
          message: 'Your payment could not be processed. Please try again.',
          color: 'text-red-600'
        };
      case 'pending':
        return {
          title: 'Payment Pending',
          message: 'Your payment is being processed. Please wait for confirmation.',
          color: 'text-yellow-600'
        };
      default:
        return {
          title: 'Processing...',
          message: 'Please wait while we process your payment.',
          color: 'text-gray-600'
        };
    }
  };

  const statusInfo = getStatusMessage();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-8">
      <div className="max-w-md mx-auto px-4">
        <Card className="text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              {getStatusIcon()}
            </div>
            <CardTitle className={`text-2xl font-bold ${statusInfo.color}`}>
              {statusInfo.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-gray-600">
              {statusInfo.message}
            </p>

            {paymentDetails && (
              <div className="bg-gray-50 p-4 rounded-lg text-left">
                <h3 className="font-semibold mb-2">Payment Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Order ID:</span>
                    <span className="font-mono">{paymentDetails.orderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Payment ID:</span>
                    <span className="font-mono">{paymentDetails.paymentId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-semibold">₹{paymentDetails.amount?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`font-semibold ${statusInfo.color}`}>
                      {paymentDetails.status || 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {paymentStatus === 'success' && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Thank you for your payment! You will receive a confirmation email shortly.
                  </p>
                  <Button 
                    onClick={() => navigate('/')} 
                    className="w-full"
                  >
                    Return to Home
                  </Button>
                </div>
              )}

              {paymentStatus === 'failed' && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Don't worry, no amount has been deducted from your account.
                  </p>
                  <Button 
                    onClick={() => navigate('/pay')} 
                    className="w-full"
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {paymentStatus === 'pending' && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Please keep this page open. We'll update the status automatically.
                  </p>
                  <Button 
                    onClick={() => window.location.reload()} 
                    variant="outline"
                    className="w-full"
                  >
                    Refresh Status
                  </Button>
                </div>
              )}

              <Button 
                onClick={() => navigate('/')} 
                variant="outline"
                className="w-full"
              >
                Go to Home
              </Button>
            </div>

            <div className="pt-4 border-t">
              <p className="text-xs text-gray-500">
                Need help? Contact us at support@yourdomain.com
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PaymentSuccess;
