export type TrendPoint = {
  day: string;
  label: string;
  visitors: number;
  phone_clicks: number;
  booking_clicks: number;
  booking_submits: number;
};

export type ChartMetricKey = 'visitors' | 'phone_clicks' | 'booking_submits';
