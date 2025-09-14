import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Phone, Mail, MapPin, Calendar, AlertTriangle } from 'lucide-react';

const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl font-bold text-foreground mb-4">
                Terms of Service
              </h1>
              <p className="text-lg text-muted-foreground">
                Terms and conditions for RO water purifier services
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
                  <CardTitle>Agreement to Terms</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Welcome to Hydrogen RO. These Terms of Service ("Terms") govern your use of our RO water purifier installation, repair, and maintenance services. By booking our services, you agree to be bound by these Terms.
                  </p>
                  <p>
                    If you do not agree to these Terms, please do not use our services.
                  </p>
                </CardContent>
              </Card>

              {/* Services */}
              <Card>
                <CardHeader>
                  <CardTitle>Our Services</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>We provide the following RO water purifier services in Bengaluru:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>RO system installation and setup</li>
                    <li>RO system repair and maintenance</li>
                    <li>Filter replacement and cleaning</li>
                    <li>Water quality testing</li>
                    <li>Emergency repair services</li>
                    <li>Annual maintenance contracts</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Booking and Scheduling */}
              <Card>
                <CardHeader>
                  <CardTitle>Booking and Scheduling</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>All service bookings must be made through our official channels</li>
                    <li>Service appointments are subject to technician availability</li>
                    <li>We will confirm your appointment via phone or email</li>
                    <li>Same-day service is available based on availability</li>
                    <li>Emergency services may have different pricing</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Pricing and Payment */}
              <Card>
                <CardHeader>
                  <CardTitle>Pricing and Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Service charges are based on the type of service required</li>
                    <li>Additional charges may apply for parts and materials</li>
                    <li>Payment is due upon completion of service</li>
                    <li>We accept cash, UPI, and digital payments</li>
                    <li>Prices are subject to change without prior notice</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Customer Responsibilities */}
              <Card>
                <CardHeader>
                  <CardTitle>Customer Responsibilities</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Provide accurate contact information and service address</li>
                    <li>Ensure access to the RO system for our technicians</li>
                    <li>Inform us of any specific requirements or concerns</li>
                    <li>Make payment as agreed upon service completion</li>
                    <li>Follow maintenance recommendations provided by our technicians</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Warranty and Guarantee */}
              <Card>
                <CardHeader>
                  <CardTitle>Warranty and Guarantee</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>We provide warranty on our installation and repair work</li>
                    <li>Warranty period varies based on the type of service</li>
                    <li>Warranty covers workmanship, not pre-existing issues</li>
                    <li>Regular maintenance is required to maintain warranty</li>
                    <li>Warranty terms will be provided at the time of service</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Cancellation and Rescheduling */}
              <Card>
                <CardHeader>
                  <CardTitle>Cancellation and Rescheduling</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>You may cancel or reschedule your appointment with 2 hours notice</li>
                    <li>No cancellation charges for advance notice</li>
                    <li>Late cancellations may incur a service charge</li>
                    <li>We may reschedule due to weather or emergency conditions</li>
                    <li>Contact us immediately if you need to change your appointment</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Limitation of Liability */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    Limitation of Liability
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Our liability is limited to the cost of the service provided. We are not responsible for:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Pre-existing damage to your RO system</li>
                    <li>Damage caused by misuse or neglect</li>
                    <li>Indirect or consequential damages</li>
                    <li>Water quality issues beyond our control</li>
                    <li>Third-party damages or claims</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    For questions about these Terms of Service or our services, please contact us:
                  </p>
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

              {/* Updates */}
              <Card>
                <CardHeader>
                  <CardTitle>Terms Updates</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>
                    We reserve the right to update these Terms of Service at any time. Changes will be effective immediately upon posting. Your continued use of our services after changes constitutes acceptance of the new Terms.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default TermsOfService;
