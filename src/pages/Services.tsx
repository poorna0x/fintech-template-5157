import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

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
              "price": "400",
              "priceCurrency": "INR",
              "availability": "https://schema.org/InStock"
            },
            {
              "@type": "Offer",
              "name": "RO Repair",
              "description": "Expert RO water purifier repair and troubleshooting",
              "price": "300",
              "priceCurrency": "INR",
              "availability": "https://schema.org/InStock"
            },
            {
              "@type": "Offer",
              "name": "Filter Replacement",
              "description": "RO filter replacement and maintenance service",
              "price": "200",
              "priceCurrency": "INR",
              "availability": "https://schema.org/InStock"
            }
          ],
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.8",
            "reviewCount": "127",
            "bestRating": "5",
            "worstRating": "1"
          }
        })}
      </script>

      <Header />

      <main className="flex-1 container mx-auto px-4 py-20 max-w-4xl">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-foreground">
          RO Water Purifier Services in Bengaluru | Best RO Repair & Installation
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground mb-8">
          Professional RO water purifier installation, repair, and maintenance services by certified technicians in Bengaluru, Karnataka. 
          Same-day service, 24/7 emergency support across all areas of Bangalore. Trusted by 3000+ customers.
        </p>

        {/* SEO Keywords Section */}
        <div className="bg-blue-50 dark:bg-blue-950 p-6 rounded-lg mb-8">
          <h2 className="text-xl font-semibold mb-4 text-foreground">Why Choose Our RO Services in Bengaluru?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-foreground">
            <div>✅ Certified RO Technicians</div>
            <div>✅ Same Day Service Available</div>
            <div>✅ All RO Brands Supported</div>
            <div>✅ 24/7 Emergency Repair</div>
            <div>✅ Genuine Spare Parts</div>
            <div>✅ 1 Year Warranty</div>
            <div>✅ Free Site Survey</div>
            <div>✅ Competitive Pricing</div>
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-foreground">Complete RO Water Purifier Services in Bengaluru</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
              <h3 className="text-lg font-semibold mb-3 text-foreground">RO Installation Services</h3>
              <ul className="space-y-2 text-foreground text-sm">
                <li>• Kent RO Installation in Bengaluru</li>
                <li>• Aquaguard RO Setup & Installation</li>
                <li>• Pureit RO Water Purifier Installation</li>
                <li>• Livpure RO Installation Service</li>
                <li>• All Brands RO Installation</li>
                <li>• Starting from ₹400 - Best Price in Bangalore</li>
              </ul>
            </div>
            <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
              <h3 className="text-lg font-semibold mb-3 text-foreground">RO Repair & Maintenance</h3>
              <ul className="space-y-2 text-foreground text-sm">
                <li>• RO Water Purifier Repair Service</li>
                <li>• Filter Replacement in Bengaluru</li>
                <li>• RO Membrane Replacement</li>
                <li>• Water Softener Service</li>
                <li>• Emergency RO Repair - 24/7</li>
                <li>• Annual Maintenance Contract (AMC)</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Why Choose Hydrogen RO?</h2>
          <ul className="space-y-2 text-foreground">
            <li>• Same-day service availability</li>
            <li>• Certified and experienced technicians</li>
            <li>• 100% satisfaction guarantee</li>
            <li>• All areas of Bengaluru covered</li>
            <li>• Genuine spare parts only</li>
            <li>• Competitive pricing</li>
          </ul>
        </div>

        <div className="bg-muted p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-3 text-foreground">Contact Us</h3>
          <p className="text-foreground mb-2">Phone: +91-8884944288, +91-9886944288</p>
          <p className="text-foreground mb-2">Email: info@hydrogenro.com</p>
          <p className="text-foreground">Available: 24/7 Emergency Service</p>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Services;
