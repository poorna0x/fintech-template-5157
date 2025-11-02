import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Calendar, Eye, Lock, Database, Users, Phone, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-600" />
              Privacy Policy
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
                At Hydrogen RO Water Purifier Services, we are committed to protecting your privacy and personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our services.
              </p>
            </section>

            {/* Information We Collect */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Personal Information</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>Name and contact information (phone, email, address)</li>
                    <li>Service history and preferences</li>
                    <li>Payment information (processed securely)</li>
                    <li>Location data for service delivery</li>
                    <li>Communication records and feedback</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Technical Information</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>Device information and browser type</li>
                    <li>IP address and location data</li>
                    <li>Website usage patterns and analytics</li>
                    <li>Cookies and similar tracking technologies</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* How We Use Information */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
              <div className="space-y-3">
                <p className="text-gray-700">We use your information to:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>Provide and improve our water purifier services</li>
                  <li>Schedule appointments and service calls</li>
                  <li>Process payments and manage accounts</li>
                  <li>Send service reminders and updates</li>
                  <li>Respond to inquiries and provide customer support</li>
                  <li>Analyze service patterns and improve offerings</li>
                  <li>Comply with legal obligations</li>
                </ul>
              </div>
            </section>

            {/* Information Sharing */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Information Sharing</h2>
              <div className="space-y-3">
                <p className="text-gray-700">We may share your information with:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li><strong>Service Technicians:</strong> To perform scheduled services</li>
                  <li><strong>Payment Processors:</strong> To process payments securely</li>
                  <li><strong>Legal Authorities:</strong> When required by law</li>
                  <li><strong>Business Partners:</strong> With your explicit consent</li>
                </ul>
                <p className="text-gray-700 mt-3">
                  We do not sell, rent, or trade your personal information to third parties for marketing purposes.
                </p>
              </div>
            </section>

            {/* Data Security */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Security</h2>
              <div className="space-y-3">
                <p className="text-gray-700">We implement appropriate security measures:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>Encryption of sensitive data in transit and at rest</li>
                  <li>Secure servers and regular security updates</li>
                  <li>Access controls and authentication protocols</li>
                  <li>Regular security audits and assessments</li>
                  <li>Employee training on data protection</li>
                </ul>
              </div>
            </section>

            {/* Data Retention */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Data Retention</h2>
              <p className="text-gray-700 leading-relaxed">
                We retain your personal information for as long as necessary to provide services, comply with legal obligations, resolve disputes, and enforce our agreements. Service records are typically retained for 7 years for legal and business purposes.
              </p>
            </section>

            {/* Your Rights */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Your Rights</h2>
              <div className="space-y-3">
                <p className="text-gray-700">You have the right to:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>Access your personal information</li>
                  <li>Correct inaccurate or incomplete data</li>
                  <li>Request deletion of your information</li>
                  <li>Object to processing of your data</li>
                  <li>Data portability and transfer</li>
                  <li>Withdraw consent at any time</li>
                </ul>
              </div>
            </section>

            {/* Cookies and Tracking */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Cookies and Tracking</h2>
              <div className="space-y-3">
                <p className="text-gray-700">We use cookies and similar technologies to:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>Remember your preferences and settings</li>
                  <li>Analyze website traffic and usage patterns</li>
                  <li>Improve website functionality and user experience</li>
                  <li>Provide personalized content and recommendations</li>
                </ul>
                <p className="text-gray-700 mt-3">
                  You can control cookie settings through your browser preferences.
                </p>
              </div>
            </section>

            {/* Third-Party Services */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Third-Party Services</h2>
              <p className="text-gray-700 leading-relaxed">
                Our website may contain links to third-party websites or services. We are not responsible for the privacy practices of these external sites. We encourage you to review their privacy policies before providing any personal information.
              </p>
            </section>

            {/* Children's Privacy */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                Our services are not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13. If we become aware that we have collected such information, we will take steps to delete it promptly.
              </p>
            </section>

            {/* Changes to Privacy Policy */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Changes to Privacy Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on our website and updating the "Last updated" date. Your continued use of our services constitutes acceptance of the updated policy.
              </p>
            </section>

            {/* Contact Information */}
            <section className="bg-blue-50 p-6 rounded-lg">
              <h2 className="text-xl font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" />
                Contact Us
              </h2>
              <div className="space-y-2 text-gray-700">
                <p><strong>Privacy Officer:</strong> privacy@hydrogenro.com</p>
                <p><strong>Phone:</strong> +91-8884944288</p>
                <p><strong>Address:</strong> Bengaluru, Karnataka, India</p>
                <p><strong>Response Time:</strong> We respond to privacy inquiries within 30 days</p>
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

export default PrivacyPolicy;