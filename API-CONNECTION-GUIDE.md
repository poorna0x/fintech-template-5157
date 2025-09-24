# 🔌 API Connection Guide for ₹15,000 Payments

## 🚀 **Quick Start - Test Current Setup**

### **1. Test the Mock Implementation (Already Working)**
```bash
# Server is already running on http://localhost:8082/
# Go to: http://localhost:8082/admin
# Click on any job → "⋮" menu → "Process Payment"
# Amount is fixed at ₹15,000 - it will work!
```

## 🔧 **Real API Integration Setup**

### **Step 1: Get Cashfree Credentials**

1. **Sign up at Cashfree:**
   - Go to [https://www.cashfree.com](https://www.cashfree.com)
   - Create merchant account
   - Complete KYC process

2. **Get API Credentials:**
   - Login to Cashfree Dashboard
   - Go to "Developers" → "API Keys"
   - Copy your **App ID** and **Secret Key**

### **Step 2: Set Up Environment Variables**

Create `.env.local` file in your project root:
```env
# Cashfree Configuration
VITE_CASHFREE_APP_ID=your_actual_app_id_here
VITE_CASHFREE_SECRET_KEY=your_actual_secret_key_here
VITE_CASHFREE_ENVIRONMENT=sandbox
VITE_CASHFREE_RETURN_URL=http://localhost:8082/payment/success
VITE_CASHFREE_NOTIFY_URL=http://localhost:8082/payment/webhook

# API Server Configuration
VITE_API_BASE_URL=http://localhost:3001/api
```

### **Step 3: Set Up Payment API Server**

```bash
# Navigate to API directory
cd api

# Install dependencies
npm install

# Create .env file for API server
echo "CASHFREE_APP_ID=your_actual_app_id_here" > .env
echo "CASHFREE_SECRET_KEY=your_actual_secret_key_here" >> .env
echo "CASHFREE_ENVIRONMENT=sandbox" >> .env
echo "CASHFREE_RETURN_URL=http://localhost:8082/payment/success" >> .env
echo "CASHFREE_NOTIFY_URL=http://localhost:8082/payment/webhook" >> .env

# Start API server
npm start
```

### **Step 4: Update Frontend to Use Real API**

Replace the mock service with real API calls:

```typescript
// In src/lib/cashfree.ts, replace the mock implementation with:

import { PaymentOrder, PaymentResponse } from '@/types/payment';

class CashfreeService {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
  }

  async createOrder(orderData: PaymentOrder): Promise<PaymentResponse> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/payment/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderData }),
      });

      const result = await response.json();
      
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error creating order:', error);
      return {
        status: 'FAILED',
        orderId: orderData.orderId,
        amount: orderData.orderAmount,
        currency: orderData.orderCurrency,
        message: error instanceof Error ? error.message : 'Failed to create order',
      };
    }
  }

  // ... other methods
}
```

## 🧪 **Testing the Real API**

### **1. Test API Server**
```bash
# Check if API is running
curl http://localhost:3001/api/health

# Expected response:
# {"success": true, "message": "Payment API is running", "timestamp": "..."}
```

### **2. Test Payment Creation**
```bash
curl -X POST http://localhost:3001/api/payment/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "orderData": {
      "orderId": "TEST_12345",
      "orderAmount": 15000,
      "orderCurrency": "INR",
      "orderNote": "Test payment for ₹15,000",
      "customerDetails": {
        "customerId": "CUST_001",
        "customerName": "Test Customer",
        "customerEmail": "test@example.com",
        "customerPhone": "+91-9876543210"
      }
    }
  }'
```

### **3. Test Payment Status**
```bash
curl http://localhost:3001/api/payment/status/TEST_12345
```

## 🔄 **Complete Integration Flow**

### **Frontend → API → Cashfree Flow:**

1. **User clicks "Process Payment"** in admin dashboard
2. **Frontend sends request** to your API server
3. **API server calls Cashfree** to create payment order
4. **Cashfree returns payment URL** and order details
5. **Frontend redirects user** to Cashfree payment page
6. **User completes payment** on Cashfree
7. **Cashfree sends webhook** to your API server
8. **API server updates database** with payment status
9. **Frontend shows success** message

## 📱 **Payment Methods Supported**

- ✅ **UPI**: All UPI apps (PhonePe, Google Pay, Paytm, etc.)
- ✅ **Credit Cards**: Visa, Mastercard, RuPay
- ✅ **Debit Cards**: All major banks
- ✅ **Net Banking**: 50+ banks
- ✅ **Wallets**: Paytm, Mobikwik, Freecharge, etc.
- ✅ **Pay Later**: LazyPay, Simpl, etc.
- ✅ **EMI**: Credit card EMI options

## 🔒 **Security Features**

- **API Key Authentication**: Secure API access
- **Webhook Signature Verification**: Verify Cashfree webhooks
- **HTTPS Only**: All API calls over secure connection
- **Input Validation**: Validate all payment data
- **Error Handling**: Comprehensive error management

## 🚨 **Troubleshooting**

### **Common Issues:**

1. **API Server Not Starting:**
   ```bash
   # Check if port 3001 is available
   lsof -i :3001
   # Kill process if needed
   kill -9 <PID>
   ```

2. **Cashfree API Errors:**
   - Check API credentials
   - Verify environment (sandbox vs production)
   - Check API version compatibility

3. **Payment Not Processing:**
   - Check browser console for errors
   - Verify API server is running
   - Check network connectivity

4. **Webhook Not Receiving:**
   - Use ngrok for local webhook testing
   - Check webhook URL accessibility
   - Verify signature validation

## 🎯 **Production Deployment**

### **1. Update Environment Variables:**
```env
VITE_CASHFREE_ENVIRONMENT=production
VITE_CASHFREE_RETURN_URL=https://yourdomain.com/payment/success
VITE_CASHFREE_NOTIFY_URL=https://yourdomain.com/payment/webhook
VITE_API_BASE_URL=https://yourdomain.com/api
```

### **2. Deploy API Server:**
- Deploy to Vercel, Netlify, or your preferred platform
- Set up environment variables
- Configure webhook endpoints

### **3. Update Frontend:**
- Build and deploy frontend
- Update API base URL
- Test payment flow

## 📊 **Monitoring & Analytics**

### **Payment Analytics Available:**
- Total payments processed
- Success/failure rates
- Payment method breakdown
- Revenue tracking
- Customer payment history

### **Logging:**
- All API calls logged
- Payment status changes tracked
- Error events recorded
- Performance metrics monitored

## 🎉 **Ready to Go!**

Your payment system is now ready for ₹15,000 payments with:
- ✅ Mock implementation (working now)
- ✅ Real API integration (ready to deploy)
- ✅ Multiple payment methods
- ✅ Secure processing
- ✅ Real-time updates
- ✅ Comprehensive analytics

**Start with the mock implementation, then upgrade to real API when ready!** 🚀
