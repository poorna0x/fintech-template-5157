import { PaymentOrder, PaymentResponse, PaymentStatus, RefundRequest, RefundResponse, CashfreeConfig } from '@/types/payment';

class CashfreeRealService {
  private cashfree: any;
  private config: CashfreeConfig;

  constructor(config: CashfreeConfig) {
    this.config = config;
    this.initializeCashfree();
  }

  private async initializeCashfree() {
    try {
      console.log('Initializing real Cashfree SDK...');
      
      // Import the real Cashfree SDK
      const { Cashfree } = await import('cashfree-pg-sdk-javascript');
      
      // Initialize with production credentials
      this.cashfree = new Cashfree({
        appId: this.config.appId,
        secretKey: this.config.secretKey,
        environment: this.config.environment,
      });

      console.log('Real Cashfree SDK initialized successfully');
    } catch (error) {
      console.error('Failed to initialize real Cashfree SDK:', error);
      throw new Error('Real Cashfree initialization failed');
    }
  }

  /**
   * Create a payment order using real Cashfree API
   */
  async createOrder(orderData: PaymentOrder): Promise<PaymentResponse> {
    try {
      console.log('Real Cashfree: Creating order for:', orderData.orderId);
      
      const order = {
        order_id: orderData.orderId,
        order_amount: orderData.orderAmount,
        order_currency: orderData.orderCurrency,
        order_note: orderData.orderNote || '',
        customer_details: {
          customer_id: orderData.customerDetails.customerId,
          customer_name: orderData.customerDetails.customerName,
          customer_email: orderData.customerDetails.customerEmail,
          customer_phone: orderData.customerDetails.customerPhone,
        },
        order_meta: {
          return_url: this.config.returnUrl,
          notify_url: this.config.notifyUrl,
          payment_methods: orderData.orderMeta?.paymentMethods || 'cc,dc,upi,netbanking,wallet,paylater,emi',
        },
      };

      console.log('Real Cashfree: Calling real API...');
      const response = await this.cashfree.pg.orders.create(order);
      console.log('Real Cashfree: API response received:', response);
      
      return {
        status: response.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
        orderId: response.order_id,
        amount: response.order_amount,
        currency: response.order_currency,
        paymentId: response.payment_id,
        paymentLink: response.payment_url,
        message: response.message || 'Order created successfully',
      };
    } catch (error) {
      console.error('Real Cashfree: Error creating order:', error);
      return {
        status: 'FAILED',
        orderId: orderData.orderId,
        amount: orderData.orderAmount,
        currency: orderData.orderCurrency,
        message: error instanceof Error ? error.message : 'Failed to create order',
      };
    }
  }

  /**
   * Get payment status using real API
   */
  async getPaymentStatus(orderId: string): Promise<PaymentStatus> {
    try {
      const response = await this.cashfree.pg.orders.payments(orderId);
      
      if (response && response.length > 0) {
        const payment = response[0];
        return {
          orderId: orderId,
          paymentId: payment.cf_payment_id,
          status: this.mapPaymentStatus(payment.payment_status),
          amount: payment.payment_amount,
          currency: payment.payment_currency,
          paymentMethod: payment.payment_method,
          paymentTime: payment.payment_time,
          failureReason: payment.payment_message,
        };
      }

      return {
        orderId: orderId,
        status: 'PENDING',
        amount: 0,
        currency: 'INR',
      };
    } catch (error) {
      console.error('Error getting payment status:', error);
      return {
        orderId: orderId,
        status: 'FAILED',
        amount: 0,
        currency: 'INR',
        failureReason: error instanceof Error ? error.message : 'Failed to get payment status',
      };
    }
  }

  /**
   * Process refund using real API
   */
  async processRefund(refundData: RefundRequest): Promise<RefundResponse> {
    try {
      const refund = {
        order_id: refundData.orderId,
        cf_payment_id: refundData.paymentId,
        refund_amount: refundData.refundAmount,
        refund_note: refundData.refundNote || 'Refund for order',
        refund_id: refundData.refundId || `refund_${Date.now()}`,
      };

      const response = await this.cashfree.pg.refunds.create(refund);
      
      return {
        status: 'SUCCESS',
        refundId: response.cf_refund_id,
        orderId: refundData.orderId,
        paymentId: refundData.paymentId,
        refundAmount: refundData.refundAmount,
        refundNote: refundData.refundNote,
        refundTime: response.refund_time,
        message: 'Refund processed successfully',
      };
    } catch (error) {
      console.error('Error processing refund:', error);
      return {
        status: 'FAILED',
        refundId: refundData.refundId || '',
        orderId: refundData.orderId,
        paymentId: refundData.paymentId,
        refundAmount: refundData.refundAmount,
        refundNote: refundData.refundNote,
        message: error instanceof Error ? error.message : 'Failed to process refund',
      };
    }
  }

  /**
   * Verify payment signature
   */
  verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    try {
      return this.cashfree.pg.orders.verifySignature({
        orderId,
        paymentId,
        signature,
      });
    } catch (error) {
      console.error('Error verifying signature:', error);
      return false;
    }
  }

  /**
   * Map Cashfree payment status to our status
   */
  private mapPaymentStatus(status: string): 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED' {
    switch (status?.toLowerCase()) {
      case 'success':
        return 'SUCCESS';
      case 'failed':
        return 'FAILED';
      case 'cancelled':
        return 'CANCELLED';
      case 'expired':
        return 'EXPIRED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string): Promise<any> {
    try {
      return await this.cashfree.pg.orders.fetch(orderId);
    } catch (error) {
      console.error('Error fetching order details:', error);
      throw error;
    }
  }
}

// Create singleton instance
let cashfreeRealService: CashfreeRealService | null = null;

export const initializeCashfreeReal = (config: CashfreeConfig): CashfreeRealService => {
  if (!cashfreeRealService) {
    cashfreeRealService = new CashfreeRealService(config);
  }
  return cashfreeRealService;
};

export const getCashfreeRealService = (): CashfreeRealService => {
  if (!cashfreeRealService) {
    throw new Error('Real Cashfree service not initialized. Call initializeCashfreeReal first.');
  }
  return cashfreeRealService;
};

export default CashfreeRealService;