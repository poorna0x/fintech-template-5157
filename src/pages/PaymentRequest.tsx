import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  CreditCard, 
  Smartphone, 
  Building2, 
  Wallet, 
  CheckCircle,
  Copy,
  Send,
  MessageCircle,
  Phone,
  Mail
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPhoneForWhatsApp } from '@/lib/utils';

const PaymentRequest: React.FC = () => {
  const [customerDetails, setCustomerDetails] = useState({
    name: '',
    email: '',
    phone: '',
    serviceType: 'RO Service',
    jobNumber: '',
    notes: ''
  });

  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [paymentLink, setPaymentLink] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const paymentMethods = [
    { id: 'upi', name: 'UPI', icon: Smartphone, description: 'Pay using UPI ID' },
    { id: 'cc', name: 'Credit Card', icon: CreditCard, description: 'Pay using credit card' },
    { id: 'dc', name: 'Debit Card', icon: CreditCard, description: 'Pay using debit card' },
    { id: 'netbanking', name: 'Net Banking', icon: Building2, description: 'Pay using net banking' },
    { id: 'wallet', name: 'Wallets', icon: Wallet, description: 'Pay using digital wallets' },
  ];

  const generatePaymentLink = async () => {
    if (!customerDetails.name || !customerDetails.email || !customerDetails.phone) {
      toast.error('Please fill in all customer details');
      return;
    }

    setIsGenerating(true);
    
    try {
      // Generate payment link with customer details
      const baseUrl = window.location.origin;
      const paymentLink = `${baseUrl}/pay?name=${encodeURIComponent(customerDetails.name)}&email=${encodeURIComponent(customerDetails.email)}&phone=${encodeURIComponent(customerDetails.phone)}&service=${encodeURIComponent(customerDetails.serviceType)}&job=${encodeURIComponent(customerDetails.jobNumber)}`;
      
      setPaymentLink(paymentLink);
      toast.success('Payment link generated successfully!');
    } catch (error) {
      toast.error('Failed to generate payment link');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyPaymentLink = () => {
    navigator.clipboard.writeText(paymentLink);
    toast.success('Payment link copied to clipboard!');
  };

  const sendWhatsAppMessage = () => {
    const message = `Hi ${customerDetails.name},

Your RO service payment is ready!

💰 Amount: ₹15,000
🔧 Service: ${customerDetails.serviceType}
📋 Job Number: ${customerDetails.jobNumber || 'RO-' + Date.now()}

Please pay using this secure link:
${paymentLink}

This link will take you directly to our payment gateway where you can pay ₹15,000 using UPI, Cards, Net Banking, or Wallets.

Thank you for choosing our services!`;
    
    const formattedPhone = formatPhoneForWhatsApp(customerDetails.phone);
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const sendSMS = () => {
    const message = `RO Service Payment - ₹15,000. Pay here: ${paymentLink}`;
    const smsUrl = `sms:${customerDetails.phone}?body=${encodeURIComponent(message)}`;
    window.open(smsUrl);
  };

  const sendEmail = () => {
    const subject = 'RO Service Payment - ₹15,000';
    const body = `Hi ${customerDetails.name},

Your RO service payment is ready!

Amount: ₹15,000
Service: ${customerDetails.serviceType}
Job Number: ${customerDetails.jobNumber || 'RO-' + Date.now()}

Please pay using this link:
${paymentLink}

Thank you for choosing our services!`;
    
    const emailUrl = `mailto:${customerDetails.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(emailUrl);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Request Payment - ₹15,000
          </h1>
          <p className="text-gray-600">
            Generate payment links and send to customers
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Customer Details Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Customer Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Customer Name *</Label>
                  <Input
                    id="name"
                    value={customerDetails.name}
                    onChange={(e) => setCustomerDetails(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter customer name"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={customerDetails.email}
                    onChange={(e) => setCustomerDetails(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter email"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    value={customerDetails.phone}
                    onChange={(e) => setCustomerDetails(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Enter phone number"
                  />
                </div>
                <div>
                  <Label htmlFor="jobNumber">Job Number</Label>
                  <Input
                    id="jobNumber"
                    value={customerDetails.jobNumber}
                    onChange={(e) => setCustomerDetails(prev => ({ ...prev, jobNumber: e.target.value }))}
                    placeholder="RO-2024-001"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="serviceType">Service Type</Label>
                <Input
                  id="serviceType"
                  value={customerDetails.serviceType}
                  onChange={(e) => setCustomerDetails(prev => ({ ...prev, serviceType: e.target.value }))}
                  placeholder="RO Service"
                />
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={customerDetails.notes}
                  onChange={(e) => setCustomerDetails(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes for customer"
                  rows={3}
                />
              </div>

              <Button 
                onClick={generatePaymentLink}
                disabled={isGenerating}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isGenerating ? 'Generating...' : 'Generate Payment Link'}
              </Button>
            </CardContent>
          </Card>

          {/* Payment Link & Sharing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Send Payment Request
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {paymentLink ? (
                <div className="space-y-4">
                  <div>
                    <Label>Payment Link</Label>
                    <div className="flex gap-2">
                      <Input
                        value={paymentLink}
                        readOnly
                        className="bg-gray-100"
                      />
                      <Button
                        onClick={copyPaymentLink}
                        variant="outline"
                        size="sm"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Send via:</h4>
                    
                    <Button
                      onClick={sendWhatsAppMessage}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Send WhatsApp Message
                    </Button>

                    <Button
                      onClick={sendSMS}
                      variant="outline"
                      className="w-full"
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      Send SMS
                    </Button>

                    <Button
                      onClick={sendEmail}
                      variant="outline"
                      className="w-full"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Send Email
                    </Button>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Payment Details:</h4>
                    <div className="space-y-1 text-sm text-blue-800">
                      <div><strong>Amount:</strong> ₹15,000</div>
                      <div><strong>Customer:</strong> {customerDetails.name}</div>
                      <div><strong>Service:</strong> {customerDetails.serviceType}</div>
                      <div><strong>Job:</strong> {customerDetails.jobNumber || 'RO-' + Date.now()}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CreditCard className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>Generate a payment link to send to your customer</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payment Methods */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Accepted Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <div
                    key={method.id}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                  >
                    <Icon className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium text-sm">{method.name}</p>
                      <p className="text-xs text-gray-500">{method.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PaymentRequest;
