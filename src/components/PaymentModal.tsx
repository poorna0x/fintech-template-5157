import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CreditCard, 
  Smartphone, 
  Building2, 
  Wallet, 
  Clock, 
  CheckCircle, 
  XCircle,
  Loader2,
  ExternalLink,
  Receipt
} from 'lucide-react';
import { PaymentFormData, PaymentResponse, JobWithPayment } from '@/types/payment';
import { getCashfreeService } from '@/lib/cashfree';
import { toast } from 'sonner';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: JobWithPayment;
  onPaymentSuccess: (paymentData: PaymentResponse) => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  job,
  onPaymentSuccess
}) => {
  const [formData, setFormData] = useState<PaymentFormData>({
    orderId: `RO_${job.jobNumber}_${Date.now()}`,
    amount: 15000, // Fixed amount as requested
    customerName: job.customer?.fullName || '',
    customerEmail: job.customer?.email || '',
    customerPhone: job.customer?.phone || '',
    orderNote: `Payment for ${job.serviceType} - ${job.serviceSubType}`,
    paymentMethod: 'upi'
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [paymentResponse, setPaymentResponse] = useState<PaymentResponse | null>(null);

  const paymentMethods = [
    { id: 'upi', name: 'UPI', icon: Smartphone, description: 'Pay using UPI ID' },
    { id: 'cc', name: 'Credit Card', icon: CreditCard, description: 'Pay using credit card' },
    { id: 'dc', name: 'Debit Card', icon: CreditCard, description: 'Pay using debit card' },
    { id: 'netbanking', name: 'Net Banking', icon: Building2, description: 'Pay using net banking' },
    { id: 'wallet', name: 'Wallets', icon: Wallet, description: 'Pay using digital wallets' },
  ];

  useEffect(() => {
    if (isOpen) {
      setFormData({
        orderId: `RO_${job.jobNumber}_${Date.now()}`,
        amount: 15000, // Fixed amount as requested
        customerName: job.customer?.fullName || '',
        customerEmail: job.customer?.email || '',
        customerPhone: job.customer?.phone || '',
        orderNote: `Payment for ${job.serviceType} - ${job.serviceSubType}`,
        paymentMethod: 'upi'
      });
      setPaymentStatus('idle');
      setPaymentResponse(null);
    }
  }, [isOpen, job]);

  const handleInputChange = (field: keyof PaymentFormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePayment = async () => {
    if (!formData.customerName || !formData.customerEmail || !formData.customerPhone) {
      toast.error('Please fill in all customer details');
      return;
    }

    setIsProcessing(true);
    setPaymentStatus('processing');

    try {
      const cashfreeService = getCashfreeService();
      
      const orderData = {
        orderId: formData.orderId,
        orderAmount: formData.amount,
        orderCurrency: 'INR',
        orderNote: formData.orderNote,
        customerDetails: {
          customerId: job.customerId,
          customerName: formData.customerName,
          customerEmail: formData.customerEmail,
          customerPhone: formData.customerPhone,
        },
        orderMeta: {
          paymentMethods: formData.paymentMethod || 'upi',
        }
      };

      const response = await cashfreeService.createOrder(orderData);
      
      if (response.status === 'SUCCESS') {
        setPaymentResponse(response);
        setPaymentStatus('success');
        onPaymentSuccess(response);
        toast.success('Payment initiated successfully!');
      } else {
        setPaymentStatus('failed');
        toast.error(response.message || 'Payment failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus('failed');
      toast.error('Payment processing failed');
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
        return <Clock className="w-6 h-6 text-gray-600" />;
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Payment for Job {job.jobNumber}
          </DialogTitle>
          <DialogDescription>
            Complete payment for {job.serviceType} - {job.serviceSubType} service
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Job Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Service Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-600">Service Type</Label>
                  <p className="text-sm">{job.serviceType} - {job.serviceSubType}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">Equipment</Label>
                  <p className="text-sm">{job.brand} {job.model}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-lg font-semibold">Total Amount</span>
                <span className="text-2xl font-bold text-green-600">₹{formData.amount}</span>
              </div>
            </CardContent>
          </Card>

          {/* Payment Method Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment Method</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  return (
                    <button
                      key={method.id}
                      onClick={() => handleInputChange('paymentMethod', method.id)}
                      className={`p-4 border rounded-lg text-left transition-all ${
                        formData.paymentMethod === method.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-gray-600" />
                        <div>
                          <p className="font-medium">{method.name}</p>
                          <p className="text-sm text-gray-500">{method.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Customer Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Customer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customerName">Full Name *</Label>
                  <Input
                    id="customerName"
                    value={formData.customerName}
                    onChange={(e) => handleInputChange('customerName', e.target.value)}
                    placeholder="Enter customer name"
                  />
                </div>
                <div>
                  <Label htmlFor="customerEmail">Email *</Label>
                  <Input
                    id="customerEmail"
                    type="email"
                    value={formData.customerEmail}
                    onChange={(e) => handleInputChange('customerEmail', e.target.value)}
                    placeholder="Enter email address"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customerPhone">Phone *</Label>
                  <Input
                    id="customerPhone"
                    value={formData.customerPhone}
                    onChange={(e) => handleInputChange('customerPhone', e.target.value)}
                    placeholder="Enter phone number"
                  />
                </div>
                <div>
                  <Label htmlFor="amount">Amount (₹)</Label>
                  <Input
                    id="amount"
                    type="number"
                    value={formData.amount}
                    readOnly
                    className="bg-gray-100 cursor-not-allowed"
                    placeholder="Fixed amount"
                  />
                  <p className="text-xs text-gray-500 mt-1">Fixed amount for this service</p>
                </div>
              </div>
              <div>
                <Label htmlFor="orderNote">Payment Note</Label>
                <Input
                  id="orderNote"
                  value={formData.orderNote}
                  onChange={(e) => handleInputChange('orderNote', e.target.value)}
                  placeholder="Enter payment note"
                />
              </div>
            </CardContent>
          </Card>

          {/* Payment Status */}
          {paymentStatus !== 'idle' && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-center gap-3 p-4">
                  {getStatusIcon()}
                  <span className="text-lg font-medium">{getStatusText()}</span>
                </div>
                {paymentResponse && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Order ID:</span>
                        <p className="text-gray-600">{paymentResponse.orderId}</p>
                      </div>
                      {paymentResponse.paymentId && (
                        <div>
                          <span className="font-medium">Payment ID:</span>
                          <p className="text-gray-600">{paymentResponse.paymentId}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button 
            onClick={handlePayment} 
            disabled={isProcessing || paymentStatus === 'success'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Process Payment'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentModal;
