import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Phone, Mail } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const TermsOfService = () => {

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Terms and Conditions
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
                Welcome to Hydrogen RO Water Purifier Services. These Terms of Service ("Terms") govern your use of our website and services. By accessing or using our services, you agree to be bound by these Terms.
              </p>
            </section>

            {/* Services */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Our Services</h2>
              <div className="space-y-3">
                <p className="text-gray-700">We provide the following services:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>RO Water Purifier Installation and Maintenance</li>
                  <li>Water Softener Installation and Service</li>
                  <li>Filter Replacement and Repair Services</li>
                  <li>Emergency Service and Support</li>
                  <li>Water Quality Testing and Consultation</li>
                </ul>
              </div>
            </section>

            {/* Service Areas */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Service Areas</h2>
              <p className="text-gray-700 leading-relaxed">
                Our services are currently available in Bengaluru, Karnataka, and surrounding areas. Service availability may vary based on location and technician availability.
              </p>
            </section>

            {/* Booking and Scheduling */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Booking and Scheduling</h2>
              <div className="space-y-3">
                <p className="text-gray-700">When booking our services:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>All bookings are subject to technician availability</li>
                  <li>We will confirm your appointment within 24 hours</li>
                  <li>Same-day service may be available for emergency repairs</li>
                  <li>Rescheduling requires at least 24 hours notice</li>
                  <li>No-show appointments may incur a cancellation fee</li>
                </ul>
              </div>
            </section>

            {/* Pricing and Payment */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Pricing and Payment</h2>
              <div className="space-y-3">
                <p className="text-gray-700">Payment terms:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>All prices are in Indian Rupees (INR)</li>
                  <li>Payment is due upon completion of service</li>
                  <li>We accept cash, UPI, and card payments</li>
                  <li>Additional charges may apply for emergency services</li>
                  <li>Service terms vary by product and service type</li>
                </ul>
              </div>
            </section>


            {/* Customer Responsibilities */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Customer Responsibilities</h2>
              <div className="space-y-3">
                <p className="text-gray-700">As our customer, you agree to:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>Provide accurate contact and address information</li>
                  <li>Ensure safe access to service areas</li>
                  <li>Follow maintenance recommendations</li>
                  <li>Report issues promptly for service coverage</li>
                  <li>Treat our technicians with respect and courtesy</li>
                </ul>
              </div>
            </section>

            {/* Limitation of Liability */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Limitation of Liability</h2>
              <p className="text-gray-700 leading-relaxed">
                Hydrogen RO shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of our services. Our total liability shall not exceed the amount paid for the specific service.
              </p>
            </section>

            {/* Privacy */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                Your privacy is important to us. Please review our Privacy Policy to understand how we collect, use, and protect your information.
              </p>
            </section>

            {/* Changes to Terms */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Changes to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting. Continued use of our services constitutes acceptance of the modified Terms.
              </p>
            </section>

            {/* Contact Information */}
            <section className="bg-blue-50 p-6 rounded-lg">
              <h2 className="text-xl font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-600" />
                Contact Us
              </h2>
              <div className="space-y-2 text-gray-700">
                <p><strong>Phone:</strong> +91-8884944288</p>
                <p><strong>Email:</strong> support@hydrogenro.com</p>
                <p><strong>Address:</strong> Bengaluru, Karnataka, India</p>
                <p><strong>Business Hours:</strong> Monday - Sunday, 8:00 AM - 8:00 PM</p>
              </div>
            </section>
          </CardContent>
        </Card>
        
        {/* Features */}
        <div className="mt-8 text-center text-sm text-muted-foreground space-y-1">
          <div>Same-day service available</div>
          <div>All brands service supported</div>
          <div>Genuine spare parts</div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default TermsOfService;