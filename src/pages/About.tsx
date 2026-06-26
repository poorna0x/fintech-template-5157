import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Clock, DollarSign, Users, Award, Heart } from 'lucide-react';

import { buildPublicLocalBusinessJsonLd, getBrandSeoProfile } from '@/lib/publicSiteSeo';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';

const About = () => {
  const brand = getBrandSeoProfile(getPublicSiteKey());

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "name": `About ${brand.brandName}`,
          "description": `Learn about ${brand.brandName}, your trusted partner for RO water purifier services in Bengaluru, Karnataka`,
          "mainEntity": {
            ...buildPublicLocalBusinessJsonLd(),
            description: `Professional RO water purifier installation, repair, and maintenance services in Bengaluru, Karnataka`,
            foundingDate: "2019",
            numberOfEmployees: "15-20",
            aggregateRating: {
              "@type": "AggregateRating",
              "ratingValue": "5",
              "reviewCount": "2300",
              "bestRating": "5",
              "worstRating": "1"
            },
            hasOfferCatalog: {
              "@type": "OfferCatalog",
              "name": "RO Water Purifier Services",
              "itemListElement": [
                { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "RO Installation" } },
                { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "RO Repair" } },
                { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Filter Replacement" } },
              ]
            }
          }
        })}
      </script>

      <Header />

      <main className="flex-1">
        <PageHero 
          title={`About ${brand.brandName} Leading RO Service Provider`}
          description={`${brand.brandName} is your trusted partner for clean water solutions in Bengaluru, Karnataka. We've been serving the community with professional RO water purifier services since 2019.`}
        />

        {/* Our Mission & Story */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              <Card className="border-sky-100 dark:border-sky-500/15">
                <CardContent className="p-8">
                  <h2 className="text-2xl font-semibold mb-4 text-foreground">Our Mission</h2>
                  <p className="text-muted-foreground">
                    To provide clean, safe drinking water to every home in Bengaluru through professional 
                    RO water purifier installation, repair, and maintenance services.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-sky-100 dark:border-sky-500/15">
                <CardContent className="p-8">
                  <h2 className="text-2xl font-semibold mb-4 text-foreground">Our Story</h2>
                  <p className="text-muted-foreground">
                    Founded in 2019, {brand.brandName} started as a small team of certified technicians with a 
                    passion for water purification technology. Over the years, we've grown to become one 
                    of the most trusted RO service providers in Bengaluru, serving over 3000+ satisfied customers.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Our Values */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                Our Values
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="border-sky-100 dark:border-sky-500/15 text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Heart className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Customer First
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    We prioritize customer satisfaction above everything else
                  </p>
                </CardContent>
              </Card>

              <Card className="border-sky-100 dark:border-sky-500/15 text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Quality Assurance
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Only genuine parts and certified technicians
                  </p>
                </CardContent>
              </Card>

              <Card className="border-sky-100 dark:border-sky-500/15 text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Timely Service
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Punctual service delivery with same-day availability
                  </p>
                </CardContent>
              </Card>

              <Card className="border-sky-100 dark:border-sky-500/15 text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Award className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Excellence
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Striving for excellence in every service we provide
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Our Team & Certifications */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              <Card className="border-sky-100 dark:border-sky-500/15">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mb-6">
                    <Users className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h2 className="text-2xl font-semibold mb-4 text-foreground">Our Team</h2>
                  <p className="text-muted-foreground">
                    Our team consists of certified and experienced technicians who are dedicated to 
                    providing the best RO water purifier services in Bengaluru. All our technicians 
                    undergo regular training to stay updated with the latest technology and techniques.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-sky-100 dark:border-sky-500/15">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center mb-6">
                    <Award className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h2 className="text-2xl font-semibold mb-4 text-foreground">Certifications & Awards</h2>
                  <div className="space-y-2 text-muted-foreground">
                    <p>• Certified Technicians - All technicians are certified and trained</p>
                    <p>• Customer Choice - Most trusted RO service provider in Bengaluru</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-16 px-2 md:px-12 bg-background">
          <div className="max-w-4xl mx-auto">
            <Card className="border-sky-100 dark:border-sky-500/15">
              <CardContent className="p-8">
                <div className="text-center">
                  <h3 className="text-2xl font-semibold mb-6 text-foreground">Contact Us</h3>
                  <div className="space-y-3 text-foreground">
                    <p>Phone: {brand.phones.join(', ')}</p>
                    <p>Email: {brand.email}</p>
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

export default About;
