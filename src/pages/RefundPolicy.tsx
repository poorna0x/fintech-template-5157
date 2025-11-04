import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Shield, Clock, CheckCircle, XCircle, Phone, Mail, MapPin, Calendar } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const RefundPolicy = () => {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <RefreshCw className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl font-bold text-foreground mb-4">
                Refund Policy
              </h1>
              <p className="text-lg text-muted-foreground">
                Our refund terms and conditions
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>

            {/* Content */}
            <div className="space-y-8">
              {/* Introduction */}
              <Card>
                <CardHeader>
                  <CardTitle>Introduction</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    At Hydrogen RO Water Purifier Services, we strive to provide excellent service and customer satisfaction. This Refund Policy outlines the terms and conditions for refunds for our water purifier services.
                  </p>
                </CardContent>
              </Card>

              {/* Service Refunds */}
              <Card>
                <CardHeader>
                  <CardTitle>Service Refunds</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-green-500/10 dark:bg-green-500/20 border border-green-500/30 dark:border-green-500/30 p-4 rounded-lg">
                    <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      Full Refund Eligible
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                      <li>Service not performed due to technician unavailability</li>
                      <li>Service cancelled by us with less than 24 hours notice</li>
                      <li>Service performed incorrectly due to our error</li>
                      <li>Equipment damage caused by our negligence</li>
                      <li>Service not completed as per agreed specifications</li>
                    </ul>
                  </div>
                  
                  <div className="bg-yellow-500/10 dark:bg-yellow-500/20 border border-yellow-500/30 dark:border-yellow-500/30 p-4 rounded-lg">
                    <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-yellow-500" />
                      Partial Refund Eligible
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                      <li>Service cancelled by customer with 24+ hours notice (90% refund)</li>
                      <li>Service partially completed due to unforeseen circumstances (proportional refund)</li>
                      <li>Customer not satisfied with service quality (case-by-case evaluation)</li>
                    </ul>
                  </div>

                  <div className="bg-red-500/10 dark:bg-red-500/20 border border-red-500/30 dark:border-red-500/30 p-4 rounded-lg">
                    <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-red-500" />
                      No Refund Eligible
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                      <li>Service cancelled by customer with less than 24 hours notice</li>
                      <li>Customer not available at scheduled time (no-show)</li>
                      <li>Service completed successfully as per agreement</li>
                      <li>Damage caused by customer misuse or negligence</li>
                      <li>Service performed but customer changed mind after completion</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Refund Process */}
              <Card>
                <CardHeader>
                  <CardTitle>Refund Process</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>To request a refund:</p>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>Contact our customer service within 48 hours of service completion</li>
                    <li>Provide your service reference number and reason for refund</li>
                    <li>Our team will review your request within 2 business days</li>
                    <li>If approved, refund will be processed within 5-7 business days</li>
                    <li>Refund will be credited to your original payment method</li>
                  </ol>
                  
                  <div className="bg-primary/10 dark:bg-primary/20 border border-primary/30 dark:border-primary/30 p-4 rounded-lg mt-4">
                    <h4 className="font-semibold text-foreground mb-2">Refund Timeline</h4>
                    <div className="space-y-2 text-muted-foreground text-sm">
                      <p><strong>Processing Time:</strong> 5-7 business days from approval</p>
                      <p><strong>Bank Reflection:</strong> Within 1 week (7 days) the refund will reflect in your bank account</p>
                      <p><strong>UPI Refunds:</strong> May reflect within 2-3 business days</p>
                      <p><strong>Card Refunds:</strong> May take 7-10 business days depending on your bank</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cancellation Policy */}
              <Card>
                <CardHeader>
                  <CardTitle>Cancellation Policy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Service Cancellation</h4>
                    <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                      <li><strong>24+ hours notice:</strong> Free cancellation, full refund</li>
                      <li><strong>12-24 hours notice:</strong> 50% cancellation fee</li>
                      <li><strong>Less than 12 hours notice:</strong> 100% cancellation fee</li>
                      <li><strong>No-show:</strong> Full service charge applies</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Emergency Services</h4>
                    <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                      <li>Emergency service cancellations incur 25% fee</li>
                      <li>Technician already dispatched: 50% fee applies</li>
                      <li>Service in progress: No cancellation allowed</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Methods */}
              <Card>
                <CardHeader>
                  <CardTitle>Payment Methods</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>Refunds will be processed through:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Original payment method (preferred)</li>
                    <li>Bank transfer for cash payments</li>
                    <li>UPI refund for UPI payments</li>
                    <li>Cheque for large amounts (if requested)</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Dispute Resolution */}
              <Card>
                <CardHeader>
                  <CardTitle>Dispute Resolution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>If you disagree with our refund decision:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Contact our customer service manager for review</li>
                    <li>Provide detailed documentation and evidence</li>
                    <li>We will conduct a thorough investigation</li>
                    <li>Final decision will be communicated within 7 business days</li>
                    <li>External mediation available if needed</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Special Circumstances */}
              <Card>
                <CardHeader>
                  <CardTitle>Special Circumstances</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>We understand that special situations may arise:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Medical emergencies: Flexible cancellation policy</li>
                    <li>Natural disasters: Full refund or rescheduling</li>
                    <li>Technical issues on our end: Full refund</li>
                    <li>Customer hardship cases: Case-by-case evaluation</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Contact Us for Refunds</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-primary" />
                      <span>+91-8884944288</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-primary" />
                      <span>refunds@hydrogenro.com</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-primary" />
                      <span>Bengaluru, Karnataka, India</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-primary" />
                      <span>Mon-Sun: 8:00 AM - 8:00 PM</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p><strong>Response Time:</strong> Within 24 hours for refund inquiries</p>
                    <p><strong>Refund Status:</strong> You can track your refund status by calling us or sending a WhatsApp message</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        
        {/* Features */}
        <div className="mt-8 text-center text-sm text-muted-foreground space-y-1">
          <div>Same-day service available</div>
          <div>All brands service supported</div>
          <div>Genuine spare parts</div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default RefundPolicy;
