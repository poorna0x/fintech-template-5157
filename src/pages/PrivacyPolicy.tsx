import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Database, Users, Phone, Mail, MapPin, Calendar } from 'lucide-react';
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
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>
                    At Hydrogen RO Water Purifier Services, we are committed to protecting your privacy. This
                    Privacy Policy describes how we handle personal data when you use our website, book services,
                    or interact with us offline or by phone, SMS, or messaging apps.
                  </p>
                  <p>
                    By using our services, you acknowledge this policy. Our{' '}
                    <Link to="/terms-of-service" className="text-primary underline hover:no-underline">
                      Terms of Service
                    </Link>
                    ,{' '}
                    <Link to="/cookie-policy" className="text-primary underline hover:no-underline">
                      Cookie Policy
                    </Link>
                    , and{' '}
                    <Link to="/disclaimer" className="text-primary underline hover:no-underline">
                      Disclaimer
                    </Link>{' '}
                    apply together with this policy.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Who we are and where this applies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>
                    Hydrogen RO operates field water-purifier services with a place of business in Bengaluru,
                    Karnataka, India. This policy applies to personal data processed in connection with those
                    services and this website.
                  </p>
                  <p>
                    We design this notice to reflect common expectations under India&apos;s privacy framework,
                    including the Digital Personal Data Protection Act, 2023 (DPDP Act), where it applies. It does
                    not replace legal advice; please consult a qualified lawyer for your specific situation.
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
                  <CardTitle>Processors, service providers, and sharing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>
                    We use trusted providers to run our business. They may process personal data only as needed to
                    deliver their service to us, under appropriate safeguards:
                  </p>
                  <ul className="list-disc list-inside space-y-2">
                    <li>
                      <strong>Cloud database and auth (e.g. Supabase):</strong> storing customer, job, and account
                      data; hosting may be in regions chosen in our project settings.
                    </li>
                    <li>
                      <strong>Email and notifications:</strong> sending booking confirmations and service-related
                      messages.
                    </li>
                    <li>
                      <strong>Maps and location:</strong> address lookup, routing, or map embeds (e.g. Google Maps)
                      when you use those features.
                    </li>
                    <li>
                      <strong>Analytics:</strong> Google Analytics (GA4) or similar, to understand site traffic—see
                      our{' '}
                      <Link to="/cookie-policy" className="text-primary underline hover:no-underline">
                        Cookie Policy
                      </Link>
                      .
                    </li>
                    <li>
                      <strong>Media / CDN:</strong> hosting photos you upload for service jobs where we use such a
                      service.
                    </li>
                    <li>
                      <strong>Security / anti-abuse:</strong> challenge widgets (e.g. Altcha) to reduce spam
                      bookings.
                    </li>
                    <li>
                      <strong>Payment processors:</strong> when you pay digitally, the processor handles card/UPI
                      data according to its own terms and PCI practices—we do not store full card numbers on our
                      servers.
                    </li>
                    <li>
                      <strong>Field technicians and staff:</strong> name, phone, address, and job details needed to
                      perform the visit.
                    </li>
                    <li>
                      <strong>Legal and safety:</strong> regulators, courts, or law enforcement when required by
                      applicable law, or to protect rights, safety, and fraud prevention.
                    </li>
                  </ul>
                  <p className="mt-3">
                    We do not sell or rent your personal data to data brokers. Marketing use beyond service-related
                    communication will be based on consent where required.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cross-border transfers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>
                    Some providers may process data outside India depending on their infrastructure. Where required,
                    we rely on lawful mechanisms such as your consent for certain transfers, standard contractual
                    terms offered by providers, or other valid grounds under applicable law.
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
                  <CardTitle>Your choices and rights</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>Depending on applicable law, you may have the right to:</p>
                  <ul className="list-disc list-inside space-y-2">
                    <li>Request access to personal data we hold about you</li>
                    <li>Request correction of inaccurate or incomplete data</li>
                    <li>Request deletion or erasure where legally applicable</li>
                    <li>Withdraw consent for processing that is consent-based (e.g. certain marketing)</li>
                    <li>Object to or restrict certain types of processing, where the law allows</li>
                    <li>Seek redress through our grievance channel below, and applicable regulatory routes</li>
                  </ul>
                  <p>
                    We may need to verify your identity before fulfilling requests. Some requests cannot be honored
                    if we must retain data for legal, accounting, or dispute-resolution reasons.
                  </p>
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
                  <CardTitle>Children&apos;s privacy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>
                    Our booking and service flows are intended for adults or guardians arranging service for a
                    household. We do not knowingly collect personal data from children without appropriate
                    authority. If you believe a child&apos;s data was submitted improperly, contact us and we will
                    take appropriate steps.
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
                  <CardTitle>Contact and grievance redressal</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    For privacy questions, access/correction/deletion requests, or complaints, contact us using the
                    details below. We will acknowledge and work to resolve genuine requests within a reasonable
                    time (typically within 30 days for non-urgent inquiries), subject to legal exceptions.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Phone className="w-5 h-5 text-primary shrink-0" />
                      <span>+91-8884944288</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Mail className="w-5 h-5 text-primary shrink-0" />
                      <span>privacy@hydrogenro.com</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <MapPin className="w-5 h-5 text-primary shrink-0" />
                      <span>Bengaluru, Karnataka, India</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Calendar className="w-5 h-5 text-primary shrink-0" />
                      <span>Mon-Sun: 8:00 AM - 8:00 PM</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You may also have the right to escalate to the Data Protection Board of India or other
                    regulators as provided under law from time to time.
                  </p>
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