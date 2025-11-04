import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Lock, Database, Eye, Users, Phone, Mail, MapPin, Calendar } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const PrivacyPolicy = () => {
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
                <Lock className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl font-bold text-foreground mb-4">
                Privacy Policy
              </h1>
              <p className="text-lg text-muted-foreground">
                How we collect, use, and protect your information
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
                    At Hydrogen RO Water Purifier Services, we are committed to protecting your privacy and personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our services.
                  </p>
                </CardContent>
              </Card>

              {/* Information We Collect */}
              <Card>
                <CardHeader>
                  <CardTitle>Information We Collect</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      Personal Information
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                      <li>Name and contact information (phone, email, address)</li>
                      <li>Service history and preferences</li>
                      <li>Payment information (processed securely)</li>
                      <li>Location data for service delivery</li>
                      <li>Communication records and feedback</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Database className="w-4 h-4 text-primary" />
                      Technical Information
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                      <li>Device information and browser type</li>
                      <li>IP address and location data</li>
                      <li>Website usage patterns and analytics</li>
                      <li>Cookies and similar tracking technologies</li>
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
                  <p>We use your information to:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Provide and improve our water purifier services</li>
                    <li>Schedule appointments and service calls</li>
                    <li>Process payments and manage accounts</li>
                    <li>Send service reminders and updates</li>
                    <li>Respond to inquiries and provide customer support</li>
                    <li>Analyze service patterns and improve offerings</li>
                    <li>Comply with legal obligations</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Information Sharing */}
              <Card>
                <CardHeader>
                  <CardTitle>Information Sharing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>We may share your information with:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li><strong>Service Technicians:</strong> To perform scheduled services</li>
                    <li><strong>Payment Processors:</strong> To process payments securely</li>
                    <li><strong>Legal Authorities:</strong> When required by law</li>
                    <li><strong>Business Partners:</strong> With your explicit consent</li>
                  </ul>
                  <p className="mt-3">
                    We do not sell, rent, or trade your personal information to third parties for marketing purposes.
                  </p>
                </CardContent>
              </Card>

              {/* Data Security */}
              <Card>
                <CardHeader>
                  <CardTitle>Data Security</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>We implement appropriate security measures:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Encryption of sensitive data in transit and at rest</li>
                    <li>Secure servers and regular security updates</li>
                    <li>Access controls and authentication protocols</li>
                    <li>Regular security audits and assessments</li>
                    <li>Employee training on data protection</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Data Retention */}
              <Card>
                <CardHeader>
                  <CardTitle>Data Retention</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    We retain your personal information for as long as necessary to provide services, comply with legal obligations, resolve disputes, and enforce our agreements. Service records are typically retained for 7 years for legal and business purposes.
                  </p>
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
                    <li>Access your personal information</li>
                    <li>Correct inaccurate or incomplete data</li>
                    <li>Request deletion of your information</li>
                    <li>Object to processing of your data</li>
                    <li>Data portability and transfer</li>
                    <li>Withdraw consent at any time</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Cookies and Tracking */}
              <Card>
                <CardHeader>
                  <CardTitle>Cookies and Tracking</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>We use cookies and similar technologies to:</p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Remember your preferences and settings</li>
                    <li>Analyze website traffic and usage patterns</li>
                    <li>Improve website functionality and user experience</li>
                    <li>Provide personalized content and recommendations</li>
                  </ul>
                  <p className="mt-3">
                    You can control cookie settings through your browser preferences.
                  </p>
                </CardContent>
              </Card>

              {/* Third-Party Services */}
              <Card>
                <CardHeader>
                  <CardTitle>Third-Party Services</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Our website may contain links to third-party websites or services. We are not responsible for the privacy practices of these external sites. We encourage you to review their privacy policies before providing any personal information.
                  </p>
                </CardContent>
              </Card>

              {/* Children's Privacy */}
              <Card>
                <CardHeader>
                  <CardTitle>Children's Privacy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Our services are not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13. If we become aware that we have collected such information, we will take steps to delete it promptly.
                  </p>
                </CardContent>
              </Card>

              {/* Changes to Privacy Policy */}
              <Card>
                <CardHeader>
                  <CardTitle>Changes to Privacy Policy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on our website and updating the "Last updated" date. Your continued use of our services constitutes acceptance of the updated policy.
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
                      <span>privacy@hydrogenro.com</span>
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
                    <p><strong>Response Time:</strong> We respond to privacy inquiries within 30 days</p>
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

export default PrivacyPolicy;