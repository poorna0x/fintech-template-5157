import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Clock, Check } from 'lucide-react';

const ServiceAreas = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          "name": "RO Service Areas in Bengaluru",
          "description": "Professional RO water purifier services across all areas of Bengaluru, Karnataka",
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
          "offers": {
            "@type": "Offer",
            "name": "RO Service",
            "description": "Professional RO water purifier services",
            "price": "500",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock",
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
          title="Service Areas in Bengaluru"
          description="We provide professional RO water purifier services across all areas of Bengaluru. Find your area and book service today!"
          showButtons={true}
        />

        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4 text-foreground">Coverage Across Bengaluru</h2>
              <p className="text-lg text-muted-foreground">
                Professional RO services available in all major areas
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {[
                { area: 'Whitefield', pincode: '560066', time: '30 minutes' },
                { area: 'Electronic City', pincode: '560100', time: '45 minutes' },
                { area: 'Koramangala', pincode: '560034', time: '25 minutes' },
                { area: 'HSR Layout', pincode: '560102', time: '35 minutes' },
                { area: 'Indiranagar', pincode: '560038', time: '20 minutes' },
                { area: 'Marathahalli', pincode: '560037', time: '40 minutes' },
                { area: 'BTM Layout', pincode: '560076', time: '30 minutes' },
                { area: 'Jayanagar', pincode: '560011', time: '25 minutes' },
                { area: 'Malleshwaram', pincode: '560003', time: '35 minutes' },
                { area: 'Rajajinagar', pincode: '560010', time: '30 minutes' },
                { area: 'Bannerghatta', pincode: '560076', time: '50 minutes' },
                { area: 'Hebbal', pincode: '560024', time: '45 minutes' }
              ].map((location, index) => (
                <Card key={index} className="cosmic-card hover:shadow-lg transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-5 h-5 text-primary" />
            </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground mb-1">{location.area}</h3>
                        <p className="text-sm text-muted-foreground mb-2">{location.pincode}</p>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>Response: {location.time}</span>
            </div>
            </div>
            </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="cosmic-card">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold mb-6 text-center text-foreground">
                  All Bengaluru Areas Covered
                </h3>
                <p className="text-center text-muted-foreground mb-6">
                  We provide comprehensive RO services across all pincodes from 560001 to 560110, covering all areas of Bengaluru and parts of Kolar and Ramanagar districts.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Check className="w-5 h-5 text-primary" />
                      Why Choose Us?
                    </h4>
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        Quick Response - Average response time of 30 minutes
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        Certified Technicians
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        Quality Guarantee
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        Local Expertise
                      </li>
                    </ul>
            </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Check className="w-5 h-5 text-primary" />
                      Services Offered
                    </h4>
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        RO Installation
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        RO Repair & Maintenance
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        Filter Replacement
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        Emergency Repair
                      </li>
                    </ul>
            </div>
            </div>
              </CardContent>
            </Card>

            {/* Features */}
            <div className="mt-8 text-center text-sm text-muted-foreground space-y-1">
              <div>Same-day service available</div>
              <div>All brands service supported</div>
              <div>Genuine spare parts</div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ServiceAreas;
