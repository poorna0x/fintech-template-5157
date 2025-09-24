// Payment API Endpoints
const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Cashfree configuration
const CASHFREE_CONFIG = {
  appId: process.env.CASHFREE_APP_ID || 'test_app_id',
  secretKey: process.env.CASHFREE_SECRET_KEY || 'test_secret_key',
  environment: process.env.CASHFREE_ENVIRONMENT || 'sandbox',
  baseUrl: process.env.CASHFREE_ENVIRONMENT === 'sandbox' 
    ? 'https://sandbox.cashfree.com/pg' 
    : 'https://api.cashfree.com/pg'
};

// Helper function to make Cashfree API calls
async function makeCashfreeRequest(endpoint, method = 'GET', data = null) {
  const url = `${CASHFREE_CONFIG.baseUrl}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    'x-api-version': '2023-08-01',
    'x-client-id': CASHFREE_CONFIG.appId,
    'x-client-secret': CASHFREE_CONFIG.secretKey,
  };

  const config = {
    method,
    headers,
  };

  if (data && method !== 'GET') {
    config.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, config);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `HTTP error! status: ${response.status}`);
    }

    return result;
  } catch (error) {
    console.error('Cashfree API Error:', error);
    throw error;
  }
}

// Create payment order
app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { orderData } = req.body;
    
    const orderPayload = {
      order_id: orderData.orderId,
      order_amount: orderData.orderAmount,
      order_currency: orderData.orderCurrency || 'INR',
      order_note: orderData.orderNote || '',
      customer_details: {
        customer_id: orderData.customerDetails.customerId,
        customer_name: orderData.customerDetails.customerName,
        customer_email: orderData.customerDetails.customerEmail,
        customer_phone: orderData.customerDetails.customerPhone,
      },
      order_meta: {
        return_url: process.env.CASHFREE_RETURN_URL || 'http://localhost:8082/payment/success',
        notify_url: process.env.CASHFREE_NOTIFY_URL || 'http://localhost:8082/payment/webhook',
        payment_methods: orderData.orderMeta?.paymentMethods || 'cc,dc,upi,netbanking,wallet,paylater,emi',
      },
    };

    const response = await makeCashfreeRequest('/orders', 'POST', orderPayload);
    
    res.json({
      success: true,
      data: {
        status: 'SUCCESS',
        orderId: response.order_id,
        amount: response.order_amount,
        currency: response.order_currency,
        paymentId: response.payment_id,
        paymentUrl: response.payment_url,
        message: 'Order created successfully',
      }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create order'
    });
  }
});

// Get payment status
app.get('/api/payment/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const response = await makeCashfreeRequest(`/orders/${orderId}/payments`);
    
    if (response && response.length > 0) {
      const payment = response[0];
      res.json({
        success: true,
        data: {
          orderId: orderId,
          paymentId: payment.cf_payment_id,
          status: payment.payment_status,
          amount: payment.payment_amount,
          currency: payment.payment_currency,
          paymentMethod: payment.payment_method,
          paymentTime: payment.payment_time,
          failureReason: payment.payment_message,
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          orderId: orderId,
          status: 'PENDING',
          amount: 0,
          currency: 'INR',
        }
      });
    }
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get payment status'
    });
  }
});

// Process refund
app.post('/api/payment/refund', async (req, res) => {
  try {
    const { refundData } = req.body;
    
    const refundPayload = {
      order_id: refundData.orderId,
      cf_payment_id: refundData.paymentId,
      refund_amount: refundData.refundAmount,
      refund_note: refundData.refundNote || 'Refund for order',
      refund_id: refundData.refundId || `refund_${Date.now()}`,
    };

    const response = await makeCashfreeRequest('/refunds', 'POST', refundPayload);
    
    res.json({
      success: true,
      data: {
        status: 'SUCCESS',
        refundId: response.cf_refund_id,
        orderId: refundData.orderId,
        paymentId: refundData.paymentId,
        refundAmount: refundData.refundAmount,
        refundNote: refundData.refundNote,
        refundTime: response.refund_time,
        message: 'Refund processed successfully',
      }
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process refund'
    });
  }
});

// Payment webhook handler
app.post('/api/payment/webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    console.log('Payment webhook received:', webhookData);
    
    // Verify webhook signature here
    // const signature = req.headers['x-webhook-signature'];
    // const isValid = verifyWebhookSignature(webhookData, signature);
    
    // Process webhook data
    if (webhookData.type === 'PAYMENT_SUCCESS') {
      // Update payment status in database
      console.log('Payment successful:', webhookData.data);
    } else if (webhookData.type === 'PAYMENT_FAILED') {
      // Handle failed payment
      console.log('Payment failed:', webhookData.data);
    }
    
    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process webhook'
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Payment API is running',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Payment API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
