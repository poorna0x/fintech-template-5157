import React, { useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Phone, Mail, MapPin, Calendar } from 'lucide-react';

const PrivacyPolicy: React.FC = () => {
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
                Privacy Policy
              </h1>
              <p className="text-lg text-muted-foreground">
                How we collect, use, and protect your personal information
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
                    At Hydrogen RO, we are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our RO water purifier services.
                  </p>
                  <p>
                    By using our services or providing your information, you consent to the collection and use of information in accordance with this policy.
                  </p>
                </CardContent>
              </Card>

              {/* Information We Collect */}
              <Card>
                <CardHeader>
                  <CardTitle>Information We Collect</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Personal Information:</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Full name and contact details (phone number, email address)</li>
                      <li>Service address and location coordinates</li>
                      <li>RO system details (brand, model, service requirements)</li>
                      <li>Service scheduling preferences</li>
                      <li>Images of your RO system (if provided)</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Technical Information:</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>IP address and browser information</li>
                      <li>Device information and operating system</li>
                      <li>Website usage data and analytics</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* How We Use Information */}
              <Card>
                <CardHeader>
                  <CardTitle>How We Use Your Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>To schedule and provide RO installation, repair, and maintenance services</li>
                    <li>To communicate with you about your service appointments</li>
                    <li>To send service confirmations and updates</li>
                    <li>To process payments and maintain service records</li>
                    <li>To improve our services and customer experience</li>
                    <li>To comply with legal obligations and resolve disputes</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Information Sharing */}
              <Card>
                <CardHeader>
                  <CardTitle>Information Sharing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>With our certified technicians to provide services</li>
                    <li>With service partners (only when necessary for service delivery)</li>
                    <li>When required by law or legal process</li>
                    <li>To protect our rights, property, or safety</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Data Security */}
              <Card>
                <CardHeader>
                  <CardTitle>Data Security</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. This includes:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Secure data transmission using SSL encryption</li>
                    <li>Regular security updates and monitoring</li>
                    <li>Limited access to personal information</li>
                    <li>Secure storage of customer data</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Your Rights */}
              <Card>
                <CardHeader>
                  <CardTitle>Your Rights</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>You have the right to:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Access and review your personal information</li>
                    <li>Request correction of inaccurate information</li>
                    <li>Request deletion of your personal information</li>
                    <li>Opt-out of marketing communications</li>
                    <li>Withdraw consent for data processing</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Contact Us</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    If you have any questions about this Privacy Policy or wish to exercise your rights, please contact us:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-primary" />
                      <span>+91-8884944288</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-primary" />
                      <span>mail@hydrogenro.com</span>
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
                  <CardTitle>Policy Updates</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>
                    We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. We encourage you to review this Privacy Policy periodically for any changes.
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

export default PrivacyPolicy;
