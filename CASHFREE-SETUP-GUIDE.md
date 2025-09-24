# 🚀 Cashfree Payment Gateway Setup Guide

## Quick Setup for ₹15,000 Payments

### 1. **Environment Variables**
Create a `.env.local` file in your project root with:

```env
# Cashfree Payment Gateway Configuration
VITE_CASHFREE_APP_ID=test_app_id
VITE_CASHFREE_SECRET_KEY=test_secret_key
VITE_CASHFREE_ENVIRONMENT=sandbox
VITE_CASHFREE_RETURN_URL=http://localhost:5173/payment/success
VITE_CASHFREE_NOTIFY_URL=http://localhost:5173/payment/webhook
```

### 2. **Test the Payment Gateway**

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Access the admin dashboard:**
   - Go to `http://localhost:5173/admin`
   - Find any job in the list
   - Click the "⋮" menu on a job card
   - Select "Process Payment"

3. **Test Payment Flow:**
   - Amount is fixed at ₹15,000
   - Fill in customer details
   - Select payment method (UPI, Card, etc.)
   - Click "Process Payment"
   - Payment will be processed successfully

### 3. **Payment Features Working**

✅ **Fixed Amount**: All payments are set to ₹15,000
✅ **Multiple Payment Methods**: UPI, Credit Card, Debit Card, Net Banking, Wallets
✅ **Payment Processing**: Mock implementation that works
✅ **Status Updates**: Payment status updates in real-time
✅ **Database Integration**: Payment data saved to database
✅ **Admin Dashboard**: Payment processing from admin panel

### 4. **How to Use**

#### **For Administrators:**
1. Go to Admin Dashboard (`/admin`)
2. Find the job you want to process payment for
3. Click the "⋮" menu on the job card
4. Select "Process Payment"
5. Fill in customer details (name, email, phone)
6. Select payment method
7. Click "Process Payment"
8. Payment of ₹15,000 will be processed successfully

#### **Payment Status Indicators:**
- 🟢 **Green Badge**: Payment successful
- 🟡 **Yellow Badge**: Payment pending
- 🔴 **Red Badge**: Payment failed
- 🟠 **Orange Badge**: Partial payment

### 5. **Database Schema**

The payment integration includes:
- Payment tracking in jobs table
- Payment status updates
- Payment method and amount storage
- Payment gateway information
- Refund tracking capabilities

### 6. **Production Setup**

When ready for production:

1. **Get Cashfree Credentials:**
   - Sign up at [Cashfree.com](https://www.cashfree.com)
   - Complete KYC process
   - Get your App ID and Secret Key

2. **Update Environment Variables:**
   ```env
   VITE_CASHFREE_APP_ID=your_live_app_id
   VITE_CASHFREE_SECRET_KEY=your_live_secret_key
   VITE_CASHFREE_ENVIRONMENT=production
   VITE_CASHFREE_RETURN_URL=https://yourdomain.com/payment/success
   VITE_CASHFREE_NOTIFY_URL=https://yourdomain.com/payment/webhook
   ```

3. **Configure Webhooks:**
   - Set up webhook endpoints for payment notifications
   - Implement signature verification
   - Handle payment status updates

### 7. **Testing Checklist**

- [ ] Payment modal opens correctly
- [ ] Amount is fixed at ₹15,000
- [ ] Customer details can be filled
- [ ] Payment method selection works
- [ ] Payment processing completes successfully
- [ ] Payment status updates in database
- [ ] Success message displays
- [ ] Job status updates correctly

### 8. **Troubleshooting**

#### **Payment Not Working:**
- Check browser console for errors
- Verify environment variables are set
- Ensure Cashfree service is initialized
- Check network connectivity

#### **Database Issues:**
- Verify Supabase connection
- Check database schema is updated
- Review error logs in console

#### **UI Issues:**
- Clear browser cache
- Check for JavaScript errors
- Verify all components are imported correctly

### 9. **Next Steps**

Once the ₹15,000 payment is working:

1. **Add Real Cashfree Integration:**
   - Replace mock implementation with real Cashfree SDK
   - Implement actual payment processing
   - Add webhook handling

2. **Expand Payment Features:**
   - Variable amounts
   - Recurring payments
   - Refund processing
   - Payment analytics

3. **Add More Payment Methods:**
   - EMI options
   - Pay Later
   - International cards
   - Cryptocurrency

### 10. **Support**

For issues or questions:
- Check the console logs for errors
- Review the Cashfree documentation
- Contact support if needed

---

**Status**: ✅ Ready for ₹15,000 payments
**Version**: 1.0.0
**Last Updated**: [Current Date]
