import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Card, CardContent } from '@/components/ui/card';
import { Filter, Wrench, RefreshCw, CheckCircle, DollarSign, Clock, Shield, MapPin, Settings } from 'lucide-react';

const Services = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* SEO Meta Tags - These will be handled by the main index.html */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          "name": "RO Water Purifier Services",
          "description": "Professional RO water purifier installation, repair, and maintenance services in Bengaluru, Karnataka",
          "image": "https://hydrogenro.com/og-image.jpg",
          "provider": {
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
            "areaServed": {
              "@type": "City",
              "name": "Bengaluru"
            },
            "serviceArea": {
              "@type": "GeoCircle",
              "geoMidpoint": {
                "@type": "GeoCoordinates",
                "latitude": 12.9716,
                "longitude": 77.5946
              },
              "geoRadius": "50000"
            }
          },
          "offers": [
            {
              "@type": "Offer",
              "name": "RO Installation",
              "description": "Professional RO water purifier installation service",
              "price": "499",
              "priceCurrency": "INR",
              "availability": "https://schema.org/InStock"
            },
            {
              "@type": "Offer",
              "name": "RO Service",
              "description": "Expert RO water purifier repair and troubleshooting",
              "price": "399",
              "priceCurrency": "INR",
              "availability": "https://schema.org/InStock"
            },
            {
              "@type": "Offer",
              "name": "Filter Replacement",
              "description": "RO filter replacement and maintenance service",
              "price": "1799",
              "priceCurrency": "INR",
              "availability": "https://schema.org/InStock"
            },
            {
              "@type": "Offer",
              "name": "Water Softener",
              "description": "Water softener installation and service",
              "price": "499",
              "priceCurrency": "INR",
              "availability": "https://schema.org/InStock"
            }
          ],
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "5",
            "reviewCount": "2300",
            "bestRating": "5",
            "worstRating": "1"
          }
        })}
      </script>

      <Header />

      <main className="flex-1">
        <PageHero 
          title="RO Water Purifier Services in Bengaluru"
          description="Professional RO water purifier installation, repair, and maintenance services by certified technicians in Bengaluru, Karnataka. Same-day service, 24/7 emergency support across all areas of Bangalore."
        />

        {/* Why Choose Section */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                Why Choose Our RO Services?
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="cosmic-card text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Certified Technicians
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    All RO technicians are certified and trained professionals
                  </p>
                </CardContent>
              </Card>

              <Card className="cosmic-card text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Same Day Service
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Quick response times with same-day service available
                  </p>
                </CardContent>
              </Card>

              <Card className="cosmic-card text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    All Brands Supported
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Expert service for all major RO water purifier brands
                  </p>
                </CardContent>
              </Card>

              <Card className="cosmic-card text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <DollarSign className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Competitive Pricing
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Transparent pricing with no hidden fees
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Main Services */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                Complete RO Water Purifier Services
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <Card className="cosmic-card hover:shadow-lg transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                    <Filter className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3 text-foreground">RO Installation</h3>
                  <div className="mb-4">
                    <p className="text-primary font-bold text-lg">
                      Installation: ₹499 | Service: ₹399
                    </p>
                  </div>
                  <ul className="space-y-2 text-muted-foreground">
                    <li>• Complete RO system setup</li>
                    <li>• Water quality testing</li>
                    <li>• All brands service supported</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="cosmic-card hover:shadow-lg transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                    <Wrench className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-4 text-foreground">RO Repair & Maintenance</h3>
                  <ul className="space-y-2 text-muted-foreground">
                    <li>• Complete system repair</li>
                    <li>• Emergency 24/7 support</li>
                    <li>• All brands service supported</li>
                    <li>• Annual maintenance plans</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="cosmic-card hover:shadow-lg transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                    <RefreshCw className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3 text-foreground">Filter Replacement</h3>
                  <div className="mb-4">
                    <p className="text-primary font-bold text-lg">
                      Starting from ₹1799
                    </p>
                  </div>
                  <ul className="space-y-2 text-muted-foreground">
                    <li>• All filter types</li>
                    <li>• Pre & post filters</li>
                    <li>• RO membrane replacement</li>
                    <li>• UV lamp maintenance</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="cosmic-card hover:shadow-lg transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                    <Settings className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3 text-foreground">Water Softener</h3>
                  <div className="mb-4">
                    <p className="text-primary font-bold text-lg">
                      Starting from ₹499
                    </p>
                  </div>
                  <ul className="space-y-2 text-muted-foreground">
                    <li>• Softener installation</li>
                    <li>• Resin level management</li>
                    <li>• Salt level monitoring</li>
                    <li>• All brands service supported</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-4xl mx-auto">
            <Card className="cosmic-card">
              <CardContent className="p-8">
                <div className="text-center">
                  <h3 className="text-2xl font-semibold mb-6 text-foreground">Contact Us</h3>
                  <div className="space-y-3 text-foreground">
                    <p>Phone: +91-8884944288, +91-9886944288</p>
                    <p>Email: info@hydrogenro.com</p>
                    <p>Available: 24/7 Emergency Service</p>
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

export default Services;
