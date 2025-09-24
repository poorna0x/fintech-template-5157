import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Receipt,
  CreditCard
} from 'lucide-react';
import { JobWithPayment } from '@/types/payment';

interface PaymentStatusProps {
  job: JobWithPayment;
  onRefresh?: () => void;
  onViewDetails?: () => void;
  onProcessPayment?: () => void;
  onProcessRefund?: () => void;
}

const PaymentStatus: React.FC<PaymentStatusProps> = ({
  job,
  onRefresh,
  onViewDetails,
  onProcessPayment,
  onProcessRefund
}) => {
  const getPaymentStatusConfig = () => {
    switch (job.paymentStatus) {
      case 'PAID':
        return {
          icon: CheckCircle,
          color: 'bg-green-100 text-green-800',
          text: 'Paid',
          description: 'Payment completed successfully'
        };
      case 'PENDING':
        return {
          icon: Clock,
          color: 'bg-yellow-100 text-yellow-800',
          text: 'Pending',
          description: 'Payment is pending'
        };
      case 'PARTIAL':
        return {
          icon: AlertCircle,
          color: 'bg-orange-100 text-orange-800',
          text: 'Partial',
          description: 'Partial payment received'
        };
      case 'REFUNDED':
        return {
          icon: XCircle,
          color: 'bg-red-100 text-red-800',
          text: 'Refunded',
          description: 'Payment has been refunded'
        };
      default:
        return {
          icon: Clock,
          color: 'bg-gray-100 text-gray-800',
          text: 'Unknown',
          description: 'Payment status unknown'
        };
    }
  };

  const getPaymentMethodIcon = (method?: string) => {
    switch (method) {
      case 'CASHFREE':
      case 'CARD':
      case 'UPI':
        return CreditCard;
      default:
        return Receipt;
    }
  };

  const statusConfig = getPaymentStatusConfig();
  const StatusIcon = statusConfig.icon;
  const PaymentMethodIcon = getPaymentMethodIcon(job.paymentMethod);

  const canProcessPayment = job.paymentStatus === 'PENDING' || job.paymentStatus === 'PARTIAL';
  const canProcessRefund = job.paymentStatus === 'PAID' && job.paymentAmount && job.paymentAmount > 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <PaymentMethodIcon className="w-5 h-5" />
            Payment Status
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={`${statusConfig.color} border-0`}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusConfig.text}
            </Badge>
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-600">Amount</p>
            <p className="text-lg font-semibold">
              ₹{job.paymentAmount || job.actualCost || job.estimatedCost}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Payment Method</p>
            <p className="text-sm">
              {job.paymentMethod || 'Not specified'}
            </p>
          </div>
        </div>

        {job.paymentId && (
          <div>
            <p className="text-sm font-medium text-gray-600">Payment ID</p>
            <p className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
              {job.paymentId}
            </p>
          </div>
        )}

        {job.paymentTime && (
          <div>
            <p className="text-sm font-medium text-gray-600">Payment Time</p>
            <p className="text-sm">
              {new Date(job.paymentTime).toLocaleString()}
            </p>
          </div>
        )}

        {job.refundAmount && job.refundAmount > 0 && (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Refund Amount</p>
                <p className="text-lg font-semibold text-red-600">
                  ₹{job.refundAmount}
                </p>
              </div>
              {job.refundStatus && (
                <Badge 
                  className={
                    job.refundStatus === 'SUCCESS' 
                      ? 'bg-green-100 text-green-800' 
                      : job.refundStatus === 'PENDING'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }
                >
                  {job.refundStatus}
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="border-t pt-4">
          <p className="text-sm text-gray-600 mb-3">{statusConfig.description}</p>
          
          <div className="flex flex-wrap gap-2">
            {canProcessPayment && onProcessPayment && (
              <Button
                onClick={onProcessPayment}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Process Payment
              </Button>
            )}
            
            {canProcessRefund && onProcessRefund && (
              <Button
                onClick={onProcessRefund}
                variant="outline"
                size="sm"
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                Process Refund
              </Button>
            )}
            
            {onViewDetails && (
              <Button
                onClick={onViewDetails}
                variant="outline"
                size="sm"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Details
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentStatus;
