import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Phone, Mail, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const Disclaimer = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl font-bold text-foreground mb-4">Disclaimer</h1>
              <p className="text-lg text-muted-foreground">
                General limitations on website and service information
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Last updated:{' '}
                {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>

            <div className="space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>Not professional or legal advice</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>
                    Content on this website (including blogs, FAQs, and marketing descriptions) is for general
                    information only. It is not water-quality, medical, legal, or financial advice. For health or
                    water-safety questions, consult a qualified professional.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>No guarantee of website accuracy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>
                    We aim to keep pricing, availability, and service descriptions accurate, but they may change
                    without notice. Final scope and charges are confirmed at the time of service or in your
                    quotation / invoice.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Third-party products and links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>
                    References to RO brands, spare parts, or external websites are for convenience. We do not
                    control third-party sites or manufacturer policies. Use of linked sites is at your own risk.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Service outcomes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>
                    Service results depend on equipment condition, water chemistry, usage, and other factors. We
                    perform work professionally; specific outcomes are addressed in our{' '}
                    <Link to="/terms-of-service" className="text-primary underline hover:no-underline">
                      Terms of Service
                    </Link>{' '}
                    and applicable warranties on parts or workmanship as stated on your job documentation.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Related documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    <Link to="/privacy-policy" className="text-primary underline hover:no-underline">
                      Privacy Policy
                    </Link>
                    {' · '}
                    <Link to="/terms-of-service" className="text-primary underline hover:no-underline">
                      Terms of Service
                    </Link>
                    {' · '}
                    <Link to="/refund-policy" className="text-primary underline hover:no-underline">
                      Refund Policy
                    </Link>
                    {' · '}
                    <Link to="/cookie-policy" className="text-primary underline hover:no-underline">
                      Cookie Policy
                    </Link>
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-primary shrink-0" />
                      <span>+91-8884944288</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-primary shrink-0" />
                      <span>mail@hydrogenro.com</span>
                    </div>
                    <div className="flex items-center gap-3 md:col-span-2">
                      <MapPin className="w-5 h-5 text-primary shrink-0" />
                      <span>Bengaluru, Karnataka, India</span>
                    </div>
                  </div>
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

export default Disclaimer;
