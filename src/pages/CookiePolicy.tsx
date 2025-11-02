import React, { useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cookie, Settings, BarChart, Shield, Phone, Mail, MapPin, Calendar } from 'lucide-react';

const CookiePolicy: React.FC = () => {
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
                <Cookie className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl font-bold text-foreground mb-4">
                Cookie Policy
              </h1>
              <p className="text-lg text-muted-foreground">
                How we use cookies and similar technologies
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
                  <CardTitle>What Are Cookies?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Cookies are small text files that are stored on your device when you visit our website. They help us provide you with a better experience by remembering your preferences and understanding how you use our site.
                  </p>
                  <p>
                    This Cookie Policy explains how Hydrogen RO uses cookies and similar technologies on our website.
                  </p>
                </CardContent>
              </Card>

              {/* Types of Cookies */}
              <Card>
                <CardHeader>
                  <CardTitle>Types of Cookies We Use</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Essential Cookies */}
                  <div>
                    <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-green-500" />
                      Essential Cookies
                    </h4>
                    <p className="text-muted-foreground mb-2">
                      These cookies are necessary for the website to function properly and cannot be disabled.
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                      <li>Session management and security</li>
                      <li>Form data and booking information</li>
                      <li>User authentication and preferences</li>
                    </ul>
                  </div>

                  {/* Analytics Cookies */}
                  <div>
                    <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <BarChart className="w-4 h-4 text-blue-500" />
                      Analytics Cookies
                    </h4>
                    <p className="text-muted-foreground mb-2">
                      These cookies help us understand how visitors use our website to improve our services.
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                      <li>Page views and user interactions</li>
                      <li>Website performance and loading times</li>
                      <li>Popular services and content</li>
                    </ul>
                  </div>

                  {/* Functional Cookies */}
                  <div>
                    <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Settings className="w-4 h-4 text-purple-500" />
                      Functional Cookies
                    </h4>
                    <p className="text-muted-foreground mb-2">
                      These cookies enhance your experience by remembering your preferences.
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                      <li>Language and region preferences</li>
                      <li>Theme settings (light/dark mode)</li>
                      <li>Form data and booking history</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Third-Party Cookies */}
              <Card>
                <CardHeader>
                  <CardTitle>Third-Party Cookies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    We may use third-party services that set their own cookies:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li><strong>Google Analytics:</strong> Website traffic and user behavior analysis</li>
                    <li><strong>Maps Services:</strong> Location services for service area mapping</li>
                    <li><strong>Payment Processors:</strong> Secure payment processing</li>
                    <li><strong>Social Media:</strong> Social sharing and integration features</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Cookie Management */}
              <Card>
                <CardHeader>
                  <CardTitle>Managing Your Cookie Preferences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    You can control and manage cookies in several ways:
                  </p>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-foreground mb-2">Browser Settings</h4>
                      <p className="text-muted-foreground text-sm">
                        Most web browsers allow you to control cookies through their settings. You can:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm mt-2">
                        <li>Block all cookies</li>
                        <li>Allow only first-party cookies</li>
                        <li>Delete existing cookies</li>
                        <li>Set preferences for specific websites</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-foreground mb-2">Opt-Out Options</h4>
                      <p className="text-muted-foreground text-sm">
                        You can opt out of specific cookie types:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm mt-2">
                        <li>Google Analytics: Use the Google Analytics Opt-out Browser Add-on</li>
                        <li>Advertising cookies: Visit the Digital Advertising Alliance website</li>
                        <li>Social media cookies: Adjust settings on respective platforms</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Impact of Disabling Cookies */}
              <Card>
                <CardHeader>
                  <CardTitle>Impact of Disabling Cookies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    If you disable cookies, some features of our website may not work properly:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Booking forms may not save your progress</li>
                    <li>Your preferences may not be remembered</li>
                    <li>Some interactive features may be unavailable</li>
                    <li>Website performance may be affected</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Data Retention */}
              <Card>
                <CardHeader>
                  <CardTitle>Cookie Data Retention</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Different cookies have different lifespans:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li><strong>Session Cookies:</strong> Deleted when you close your browser</li>
                    <li><strong>Persistent Cookies:</strong> Remain for a set period (typically 30 days to 2 years)</li>
                    <li><strong>Essential Cookies:</strong> Retained as long as necessary for functionality</li>
                    <li><strong>Analytics Cookies:</strong> Typically retained for 26 months</li>
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
                    If you have questions about our use of cookies or this Cookie Policy, please contact us:
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
                    We may update this Cookie Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. We will notify you of any material changes by posting the updated policy on our website.
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

export default CookiePolicy;
