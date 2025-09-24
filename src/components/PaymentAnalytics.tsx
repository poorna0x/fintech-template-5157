import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  DollarSign, 
  CreditCard, 
  Users,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { PaymentAnalytics } from '@/types/payment';

interface PaymentAnalyticsProps {
  analytics: PaymentAnalytics;
  isLoading?: boolean;
}

const PaymentAnalyticsComponent: React.FC<PaymentAnalyticsProps> = ({
  analytics,
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-full"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const successRate = analytics.totalOrders > 0 
    ? ((analytics.successfulPayments / analytics.totalOrders) * 100).toFixed(1)
    : '0';

  const stats = [
    {
      title: 'Total Orders',
      value: analytics.totalOrders.toLocaleString(),
      icon: CreditCard,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      change: '+12%'
    },
    {
      title: 'Successful Payments',
      value: analytics.successfulPayments.toLocaleString(),
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      change: `+${successRate}%`
    },
    {
      title: 'Total Amount',
      value: `₹${analytics.totalAmount.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      change: '+8%'
    },
    {
      title: 'Average Order Value',
      value: `₹${analytics.averageOrderValue.toLocaleString()}`,
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      change: '+5%'
    }
  ];

  const paymentMethods = Object.entries(analytics.paymentMethodBreakdown).map(([method, data]) => ({
    method: method.toUpperCase(),
    count: data.count,
    amount: data.amount,
    percentage: analytics.totalAmount > 0 ? ((data.amount / analytics.totalAmount) * 100).toFixed(1) : '0'
  }));

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-full ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">{stat.change}</span> from last month
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Payment Methods Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {paymentMethods.map((method, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline">{method.method}</Badge>
                    <span className="text-sm text-gray-600">
                      {method.count} payments
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">₹{method.amount.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">{method.percentage}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Payment Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Successful</span>
                </div>
                <div className="text-right">
                  <div className="font-medium">{analytics.successfulPayments}</div>
                  <div className="text-xs text-gray-500">
                    {((analytics.successfulPayments / analytics.totalOrders) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm">Failed</span>
                </div>
                <div className="text-right">
                  <div className="font-medium">{analytics.failedPayments}</div>
                  <div className="text-xs text-gray-500">
                    {((analytics.failedPayments / analytics.totalOrders) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm">Pending</span>
                </div>
                <div className="text-right">
                  <div className="font-medium">{analytics.pendingPayments}</div>
                  <div className="text-xs text-gray-500">
                    {((analytics.pendingPayments / analytics.totalOrders) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Stats Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Payment Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics.dailyStats.slice(-7).map((day, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  {new Date(day.date).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-sm text-gray-600">
                    {day.orders} orders
                  </div>
                  <div className="text-sm font-medium">
                    ₹{day.amount.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentAnalyticsComponent;
