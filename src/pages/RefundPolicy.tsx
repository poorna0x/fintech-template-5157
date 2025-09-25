import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Calendar, Shield, Clock, CheckCircle, XCircle, Phone, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const RefundPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-6 h-6 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Refund Policy</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <div className="text-center mb-4">
              <h1 className="text-3xl font-bold text-blue-600 mb-2">POORNA</h1>
              <div className="w-16 h-1 bg-blue-600 mx-auto rounded"></div>
            </div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Refund and Cancellation Policy
            </CardTitle>
            <p className="text-sm text-gray-600">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Introduction */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                At Hydrogen RO Water Purifier Services, we strive to provide excellent service and customer satisfaction. This Refund Policy outlines the terms and conditions for refunds, cancellations, and returns for our water purifier services and products.
              </p>
            </section>

            {/* Service Refunds */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Service Refunds</h2>
              <div className="space-y-4">
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-green-900 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Full Refund Eligible
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-green-800 ml-6">
                    <li>Service not performed due to technician unavailability</li>
                    <li>Service cancelled by us with less than 24 hours notice</li>
                    <li>Service performed incorrectly due to our error</li>
                    <li>Equipment damage caused by our negligence</li>
                    <li>Service not completed as per agreed specifications</li>
                  </ul>
                </div>
                
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-yellow-900 mb-2 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Partial Refund Eligible
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-yellow-800 ml-6">
                    <li>Service cancelled by customer with 24+ hours notice (90% refund)</li>
                    <li>Service partially completed due to unforeseen circumstances (proportional refund)</li>
                    <li>Customer not satisfied with service quality (case-by-case evaluation)</li>
                  </ul>
                </div>

                <div className="bg-red-50 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-red-900 mb-2 flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    No Refund Eligible
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-red-800 ml-6">
                    <li>Service cancelled by customer with less than 24 hours notice</li>
                    <li>Customer not available at scheduled time (no-show)</li>
                    <li>Service completed successfully as per agreement</li>
                    <li>Damage caused by customer misuse or negligence</li>
                    <li>Service performed but customer changed mind after completion</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Product Refunds */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Product Refunds</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">New Products</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>7-day return policy for unopened products</li>
                    <li>Products must be in original packaging with all accessories</li>
                    <li>Return shipping costs borne by customer unless product is defective</li>
                    <li>Refund processed within 5-7 business days after return verification</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Defective Products</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>30-day warranty for manufacturing defects</li>
                    <li>Free replacement or full refund for defective items</li>
                    <li>Return shipping costs covered by us</li>
                    <li>Product must be returned within warranty period</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Refund Process */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Refund Process</h2>
              <div className="space-y-3">
                <p className="text-gray-700">To request a refund:</p>
                <ol className="list-decimal list-inside space-y-2 text-gray-700 ml-4">
                  <li>Contact our customer service within 48 hours of service completion</li>
                  <li>Provide your service reference number and reason for refund</li>
                  <li>Our team will review your request within 2 business days</li>
                  <li>If approved, refund will be processed within 5-7 business days</li>
                  <li>Refund will be credited to your original payment method</li>
                </ol>
              </div>
            </section>

            {/* Cancellation Policy */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Cancellation Policy</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Service Cancellation</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li><strong>24+ hours notice:</strong> Free cancellation, full refund</li>
                    <li><strong>12-24 hours notice:</strong> 50% cancellation fee</li>
                    <li><strong>Less than 12 hours notice:</strong> 100% cancellation fee</li>
                    <li><strong>No-show:</strong> Full service charge applies</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Emergency Services</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>Emergency service cancellations incur 25% fee</li>
                    <li>Technician already dispatched: 50% fee applies</li>
                    <li>Service in progress: No cancellation allowed</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Warranty Terms */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Warranty Terms</h2>
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="text-lg font-medium text-blue-900 mb-2">Installation Warranty</h3>
                    <ul className="list-disc list-inside space-y-1 text-blue-800 text-sm">
                      <li>1 year on installation work</li>
                      <li>Free re-installation if needed</li>
                      <li>Parts warranty as per manufacturer</li>
                    </ul>
                  </div>
                  
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="text-lg font-medium text-green-900 mb-2">Service Warranty</h3>
                    <ul className="list-disc list-inside space-y-1 text-green-800 text-sm">
                      <li>30 days on repair work</li>
                      <li>Free re-service if issue persists</li>
                      <li>Parts warranty as per manufacturer</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Dispute Resolution */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Dispute Resolution</h2>
              <div className="space-y-3">
                <p className="text-gray-700">If you disagree with our refund decision:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>Contact our customer service manager for review</li>
                  <li>Provide detailed documentation and evidence</li>
                  <li>We will conduct a thorough investigation</li>
                  <li>Final decision will be communicated within 7 business days</li>
                  <li>External mediation available if needed</li>
                </ul>
              </div>
            </section>

            {/* Payment Methods */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Payment Methods</h2>
              <div className="space-y-3">
                <p className="text-gray-700">Refunds will be processed through:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>Original payment method (preferred)</li>
                  <li>Bank transfer for cash payments</li>
                  <li>UPI refund for UPI payments</li>
                  <li>Cheque for large amounts (if requested)</li>
                </ul>
              </div>
            </section>

            {/* Special Circumstances */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Special Circumstances</h2>
              <div className="space-y-3">
                <p className="text-gray-700">We understand that special situations may arise:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>Medical emergencies: Flexible cancellation policy</li>
                  <li>Natural disasters: Full refund or rescheduling</li>
                  <li>Technical issues on our end: Full refund</li>
                  <li>Customer hardship cases: Case-by-case evaluation</li>
                </ul>
              </div>
            </section>

            {/* Contact Information */}
            <section className="bg-blue-50 p-6 rounded-lg">
              <h2 className="text-xl font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-600" />
                Contact Us for Refunds
              </h2>
              <div className="space-y-2 text-gray-700">
                <p><strong>Refund Department:</strong> refunds@hydrogenro.com</p>
                <p><strong>Phone:</strong> +91-9876543210</p>
                <p><strong>WhatsApp:</strong> +91-9876543210</p>
                <p><strong>Business Hours:</strong> Monday - Sunday, 8:00 AM - 8:00 PM</p>
                <p><strong>Response Time:</strong> Within 24 hours for refund inquiries</p>
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RefundPolicy;
