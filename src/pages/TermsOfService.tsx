import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Phone, Mail, MapPin, Calendar } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const TermsOfService = () => {
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
                <Shield className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl font-bold text-foreground mb-4">
                Terms and Conditions
              </h1>
              <p className="text-lg text-muted-foreground">
                Terms of service for our water purifier services
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
                    Welcome to Hydrogen RO Water Purifier Services. These Terms of Service ("Terms") govern your use of our website and services. By accessing or using our services, you agree to be bound by these Terms.
                  </p>
                </CardContent>
              </Card>

              {/* Services */}
              <Card>
                <CardHeader>
                  <CardTitle>Our Services</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>We provide the following services:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>RO Water Purifier Installation and Maintenance</li>
                    <li>Water Softener Installation and Service</li>
                    <li>Filter Replacement and Repair Services</li>
                    <li>Emergency Service and Support</li>
                    <li>Water Quality Testing and Consultation</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Service Areas */}
              <Card>
                <CardHeader>
                  <CardTitle>Service Areas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Our services are currently available in Bengaluru, Karnataka, and surrounding areas. Service availability may vary based on location and technician availability.
                  </p>
                </CardContent>
              </Card>

              {/* Booking and Scheduling */}
              <Card>
                <CardHeader>
                  <CardTitle>Booking and Scheduling</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>When booking our services:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>All bookings are subject to technician availability</li>
                    <li>We will confirm your appointment within 24 hours</li>
                    <li>Same-day service may be available for emergency repairs</li>
                    <li>Rescheduling requires at least 24 hours notice</li>
                    <li>No-show appointments may incur a cancellation fee</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Pricing and Payment */}
              <Card>
                <CardHeader>
                  <CardTitle>Pricing and Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>Payment terms:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>All prices are in Indian Rupees (INR)</li>
                    <li>Payment is due upon completion of service</li>
                    <li>We accept cash, UPI, and card payments</li>
                    <li>Additional charges may apply for emergency services</li>
                    <li>Service terms vary by product and service type</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Customer Responsibilities */}
              <Card>
                <CardHeader>
                  <CardTitle>Customer Responsibilities</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>As our customer, you agree to:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Provide accurate contact and address information</li>
                    <li>Ensure safe access to service areas</li>
                    <li>Follow maintenance recommendations</li>
                    <li>Report issues promptly for service coverage</li>
                    <li>Treat our technicians with respect and courtesy</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Limitation of Liability */}
              <Card>
                <CardHeader>
                  <CardTitle>Limitation of Liability</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Hydrogen RO shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of our services. Our total liability shall not exceed the amount paid for the specific service.
                  </p>
                </CardContent>
              </Card>

              {/* Privacy */}
              <Card>
                <CardHeader>
                  <CardTitle>Privacy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Your privacy is important to us. Please review our Privacy Policy to understand how we collect, use, and protect your information.
                  </p>
                </CardContent>
              </Card>

              {/* Changes to Terms */}
              <Card>
                <CardHeader>
                  <CardTitle>Changes to Terms</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting. Continued use of our services constitutes acceptance of the modified Terms.
                  </p>
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Contact Us</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-primary" />
                      <span>+91-8884944288</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-primary" />
                      <span>support@hydrogenro.com</span>
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

export default TermsOfService;