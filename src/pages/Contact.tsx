import React, { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, Mail, MapPin, Clock, AlertCircle } from 'lucide-react';

const Contact = () => {
  const [showCallOptions, setShowCallOptions] = useState(false);

  const handleCall = (number: string) => {
    window.open(`tel:${number}`, '_self');
    setShowCallOptions(false);
  };

  const handleWhatsApp = () => {
    window.open('https://wa.me/918884944288', '_blank', 'noopener,noreferrer');
  };

  const handleEmail = () => {
    window.open('mailto:info@hydrogenro.com', '_self');
  };

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
                  <p className="text-foreground mb-2">
                    <a href="tel:+918884944288" className="hover:underline cursor-pointer">+91-8884944288</a>
                  </p>
                  <p className="text-foreground mb-4">
                    <a href="tel:+919886944288" className="hover:underline cursor-pointer">+91-9886944288</a>
                  </p>
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
                <p className="text-center text-muted-foreground mb-8">
                  For non-emergency services, you can reach us during business hours or send us an email.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Call Button */}
                  <div>
                    <div className="w-16 h-16 bg-gray-100 dark:bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                      <Phone className="w-8 h-8 text-gray-600 dark:text-black" />
                    </div>
                    <h4 className="font-semibold text-foreground mb-2 text-center">Call Us</h4>
                    <p className="text-sm text-muted-foreground mb-4 text-center">Speak directly with our RO experts</p>
                    
                    {!showCallOptions ? (
                      <Button 
                        onClick={() => setShowCallOptions(true)}
                        className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                      >
                        Call
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <Button 
                          onClick={() => handleCall('+918884944288')}
                          className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                        >
                          Call: +91-8884944288
                        </Button>
                        <Button 
                          onClick={() => handleCall('+919886944288')}
                          className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                        >
                          Call: +91-9886944288
                        </Button>
                        <Button 
                          onClick={() => setShowCallOptions(false)}
                          variant="outline"
                          className="w-full"
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Email Button */}
                  <div>
                    <div className="w-16 h-16 bg-gray-100 dark:bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                      <Mail className="w-8 h-8 text-gray-600 dark:text-black" />
                    </div>
                    <h4 className="font-semibold text-foreground mb-2 text-center">Email Us</h4>
                    <p className="text-sm text-muted-foreground mb-4 text-center">Send us an email anytime</p>
                    <Button 
                      onClick={handleEmail}
                      className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Email
                    </Button>
                  </div>

                  {/* WhatsApp Button */}
                  <div>
                    <div className="w-16 h-16 bg-gray-100 dark:bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                    </div>
                    <h4 className="font-semibold text-foreground mb-2 text-center">WhatsApp</h4>
                    <p className="text-sm text-muted-foreground mb-4 text-center">Chat with us on WhatsApp</p>
                    <Button 
                      onClick={handleWhatsApp}
                      className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                    >
                      <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                      WhatsApp
                    </Button>
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
