// Payment Types for Cashfree Integration

export interface PaymentConfig {
  appId: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
}

export interface PaymentOrder {
  orderId: string;
  orderAmount: number;
  orderCurrency: string;
  orderNote?: string;
  customerDetails: {
    customerId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
  };
  orderMeta?: {
    returnUrl?: string;
    notifyUrl?: string;
    paymentMethods?: string;
  };
}

export interface PaymentResponse {
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';
  paymentId?: string;
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
  paymentTime?: string;
  signature?: string;
  message?: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: 'CARD' | 'UPI' | 'NETBANKING' | 'WALLET' | 'EMI' | 'PAYLATER';
  icon?: string;
  enabled: boolean;
}

export interface PaymentStatus {
  orderId: string;
  paymentId?: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  amount: number;
  currency: string;
  paymentMethod?: string;
  paymentTime?: string;
  failureReason?: string;
  refundAmount?: number;
  refundStatus?: 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED';
}

export interface RefundRequest {
  orderId: string;
  paymentId: string;
  refundAmount: number;
  refundNote?: string;
  refundId?: string;
}

export interface RefundResponse {
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  refundId: string;
  orderId: string;
  paymentId: string;
  refundAmount: number;
  refundNote?: string;
  refundTime?: string;
  message?: string;
}

// Extended Job interface with payment details
export interface JobWithPayment {
  id: string;
  jobNumber: string;
  customerId: string;
  customer?: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
  };
  serviceType: string;
  serviceSubType: string;
  brand: string;
  model: string;
  estimatedCost: number;
  actualCost?: number;
  paymentStatus: 'PENDING' | 'PAID' | 'PARTIAL' | 'REFUNDED';
  paymentMethod?: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'CASHFREE';
  paymentAmount?: number;
  paymentId?: string;
  paymentTime?: string;
  refundAmount?: number;
  refundStatus?: 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

// Payment gateway configuration
export interface CashfreeConfig {
  appId: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
  returnUrl: string;
  notifyUrl: string;
}

// Payment form data
export interface PaymentFormData {
  orderId: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderNote?: string;
  paymentMethod?: string;
}

// Payment webhook data
export interface PaymentWebhook {
  type: 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_CANCELLED' | 'PAYMENT_EXPIRED';
  data: {
    order: {
      orderId: string;
      orderAmount: number;
      orderCurrency: string;
      orderTime: string;
      orderStatus: string;
      paymentTime: string;
      customerDetails: {
        customerId: string;
        customerName: string;
        customerEmail: string;
        customerPhone: string;
      };
    };
    payment: {
      paymentId: string;
      paymentAmount: number;
      paymentCurrency: string;
      paymentStatus: string;
      paymentMethod: string;
      paymentTime: string;
      paymentSignature: string;
    };
  };
  eventTime: string;
}

// Payment analytics
export interface PaymentAnalytics {
  totalOrders: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  totalAmount: number;
  averageOrderValue: number;
  paymentMethodBreakdown: {
    [key: string]: {
      count: number;
      amount: number;
    };
  };
  dailyStats: {
    date: string;
    orders: number;
    amount: number;
  }[];
}
