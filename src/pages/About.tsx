import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const About = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* SEO Meta Tags - These will be handled by the main index.html */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "name": "About Hydrogen RO",
          "description": "Learn about Hydrogen RO, your trusted partner for RO water purifier services in Bengaluru, Karnataka",
          "mainEntity": {
            "@type": "LocalBusiness",
            "name": "Hydrogen RO",
            "description": "Professional RO water purifier installation, repair, and maintenance services in Bengaluru, Karnataka",
            "foundingDate": "2019",
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
            "numberOfEmployees": "15-20",
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.8",
              "reviewCount": "127",
              "bestRating": "5",
              "worstRating": "1"
            },
            "hasOfferCatalog": {
              "@type": "OfferCatalog",
              "name": "RO Water Purifier Services",
              "itemListElement": [
                {
                  "@type": "Offer",
                  "itemOffered": {
                    "@type": "Service",
                    "name": "RO Installation"
                  }
                },
                {
                  "@type": "Offer",
                  "itemOffered": {
                    "@type": "Service",
                    "name": "RO Repair"
                  }
                },
                {
                  "@type": "Offer",
                  "itemOffered": {
                    "@type": "Service",
                    "name": "Filter Replacement"
                  }
                }
              ]
            }
          }
        })}
      </script>

      <Header />

      <main className="flex-1 container mx-auto px-4 py-20 max-w-4xl">
        <h1 className="text-4xl font-bold mb-6 text-foreground">
          About Hydrogen RO - Water Purifier Services
        </h1>
        
        <p className="text-lg text-muted-foreground mb-8">
          Hydrogen RO is your trusted partner for clean water solutions in Bengaluru, Karnataka. 
          We've been serving the community with professional RO water purifier services since 2019.
        </p>

        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Our Mission</h2>
          <p className="text-foreground mb-4">
            To provide clean, safe drinking water to every home in Bengaluru through professional 
            RO water purifier installation, repair, and maintenance services.
          </p>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Our Story</h2>
          <p className="text-foreground mb-4">
            Founded in 2019, Hydrogen RO started as a small team of certified technicians with a 
            passion for water purification technology. Over the years, we've grown to become one 
            of the most trusted RO service providers in Bengaluru, serving over 3000+ satisfied 
            customers across all areas of the city.
          </p>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Our Values</h2>
          <ul className="space-y-2 text-foreground">
            <li>• Customer First - We prioritize customer satisfaction above everything else</li>
            <li>• Quality Assurance - Only genuine parts and certified technicians</li>
            <li>• Timely Service - Punctual service delivery with same-day availability</li>
            <li>• Excellence - Striving for excellence in every service we provide</li>
          </ul>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Our Team</h2>
          <p className="text-foreground mb-4">
            Our team consists of certified and experienced technicians who are dedicated to 
            providing the best RO water purifier services in Bengaluru. All our technicians 
            undergo regular training to stay updated with the latest technology and techniques.
          </p>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Certifications & Awards</h2>
          <ul className="space-y-2 text-foreground">
            <li>• ISO Certified - Quality management system certification</li>
            <li>• Certified Technicians - All technicians are certified and trained</li>
            <li>• Customer Choice - Most trusted RO service provider in Bengaluru</li>
          </ul>
        </div>

        <div className="bg-muted p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-3 text-foreground">Contact Us</h3>
          <p className="text-foreground mb-2">Phone: +91-8884944288, +91-9886944288</p>
          <p className="text-foreground">Email: info@hydrogenro.com</p>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default About;
