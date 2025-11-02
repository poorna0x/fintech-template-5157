import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Card, CardContent } from '@/components/ui/card';
import { Phone, Mail, MapPin, Clock, AlertCircle, MessageSquare } from 'lucide-react';

const Contact = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* SEO Meta Tags - These will be handled by the main index.html */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ContactPage",
          "name": "Contact Hydrogen RO",
          "description": "Contact Hydrogen RO for RO water purifier installation, repair, and maintenance services in Bengaluru",
          "mainEntity": {
            "@type": "LocalBusiness",
            "name": "Hydrogen RO",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "MG Road",
              "addressLocality": "Bengaluru",
              "addressRegion": "Karnataka",
              "postalCode": "560001",
              "addressCountry": "IN"
            },
            "telephone": "+91-8884944288",
            "email": "info@hydrogenro.com",
            "url": "https://hydrogenro.com",
            "openingHours": "Mo-Su 08:00-20:00",
            "areaServed": {
              "@type": "City",
              "name": "Bengaluru"
            }
          }
        })}
      </script>

      <Header />

      <main className="flex-1">
        <PageHero 
          title="Contact Hydrogen RO"
          description="Get in touch with us for professional RO water purifier services in Bengaluru. We're here to help 24/7!"
        />

        {/* Contact Information Cards */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="cosmic-card hover:shadow-lg transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                    <Phone className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-4 text-foreground">Phone</h3>
                  <p className="text-foreground mb-2">+91-8884944288</p>
                  <p className="text-foreground mb-4">+91-9886944288</p>
                  <p className="text-sm text-muted-foreground">Call us for immediate assistance</p>
                </CardContent>
              </Card>

              <Card className="cosmic-card hover:shadow-lg transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                    <Mail className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-4 text-foreground">Email</h3>
                  <p className="text-foreground mb-4">info@hydrogenro.com</p>
                  <p className="text-sm text-muted-foreground">Send us an email anytime</p>
                </CardContent>
              </Card>

              <Card className="cosmic-card hover:shadow-lg transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                    <Clock className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-4 text-foreground">Working Hours</h3>
                  <p className="text-foreground mb-2">24/7 Emergency Service</p>
                  <p className="text-sm text-muted-foreground">Mon-Sun: 8:00 AM - 8:00 PM</p>
                </CardContent>
              </Card>

              <Card className="cosmic-card hover:shadow-lg transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                    <MapPin className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-4 text-foreground">Service Areas</h3>
                  <p className="text-sm text-muted-foreground">
                    We provide RO services across all areas of Bengaluru and parts of Kolar and Ramanagar districts.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Emergency Service */}
        <section className="py-16 px-2 md:px-12 bg-muted/30">
          <div className="max-w-4xl mx-auto">
            <Card className="cosmic-card">
              <CardContent className="p-8">
                <div className="flex items-start gap-6">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-950 rounded-xl flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold mb-4 text-foreground">Emergency Service</h3>
                    <p className="text-foreground mb-4">
                      Need urgent RO repair? We provide 24/7 emergency service across Bengaluru.
                    </p>
                    <p className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Emergency Contact</p>
                    <p className="text-foreground font-medium">+91-8884944288</p>
                    <p className="text-sm text-muted-foreground">Available 24/7 for emergency RO repairs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Quick Contact */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-4xl mx-auto">
            <Card className="cosmic-card">
              <CardContent className="p-8">
                <h3 className="text-2xl font-semibold mb-6 text-center text-foreground">Quick Contact</h3>
                <p className="text-center text-muted-foreground mb-6">
                  For non-emergency services, you can reach us during business hours or send us an email.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div>
                    <Phone className="w-6 h-6 mx-auto mb-2 text-primary" />
                    <p className="text-foreground">Call</p>
                    <p className="text-sm text-muted-foreground">+91-8884944288</p>
                  </div>
                  <div>
                    <Mail className="w-6 h-6 mx-auto mb-2 text-primary" />
                    <p className="text-foreground">Email</p>
                    <p className="text-sm text-muted-foreground">info@hydrogenro.com</p>
                  </div>
                  <div>
                    <MessageSquare className="w-6 h-6 mx-auto mb-2 text-primary" />
                    <p className="text-foreground">WhatsApp</p>
                    <p className="text-sm text-muted-foreground">+91-8884944288</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
