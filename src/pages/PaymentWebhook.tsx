import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

const PaymentWebhook: React.FC = () => {
  const [webhookStatus, setWebhookStatus] = useState<'processing' | 'success' | 'failed'>('processing');
  const [webhookData, setWebhookData] = useState<any>(null);

  useEffect(() => {
    // This would typically handle webhook data from Cashfree
    // For now, we'll simulate a webhook response
    const simulateWebhook = async () => {
      try {
        // In a real implementation, you would:
        // 1. Verify the webhook signature
        // 2. Process the payment data
        // 3. Update your database
        // 4. Send confirmation emails
        
        console.log('Webhook received - processing payment data');
        
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        setWebhookStatus('success');
        setWebhookData({
          message: 'Webhook processed successfully',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Webhook processing failed:', error);
        setWebhookStatus('failed');
      }
    };

    simulateWebhook();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-8">
      <div className="max-w-md mx-auto px-4">
        <Card className="text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              {webhookStatus === 'processing' && <Clock className="w-16 h-16 text-blue-500 animate-spin" />}
              {webhookStatus === 'success' && <CheckCircle className="w-16 h-16 text-green-500" />}
              {webhookStatus === 'failed' && <XCircle className="w-16 h-16 text-red-500" />}
            </div>
            <CardTitle className="text-2xl font-bold">
              {webhookStatus === 'processing' && 'Processing Webhook...'}
              {webhookStatus === 'success' && 'Webhook Processed'}
              {webhookStatus === 'failed' && 'Webhook Failed'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              {webhookStatus === 'processing' && 'Please wait while we process the payment notification...'}
              {webhookStatus === 'success' && 'Payment notification has been processed successfully.'}
              {webhookStatus === 'failed' && 'Failed to process payment notification.'}
            </p>

            {webhookData && (
              <div className="bg-gray-50 p-4 rounded-lg text-left">
                <h3 className="font-semibold mb-2">Webhook Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className="font-semibold text-green-600">Success</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Timestamp:</span>
                    <span className="font-mono">{webhookData.timestamp}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Message:</span>
                    <span className="font-mono">{webhookData.message}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 text-xs text-gray-500">
              <p>This page handles payment notifications from Cashfree.</p>
              <p>In production, this would update your database and send confirmations.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PaymentWebhook;
