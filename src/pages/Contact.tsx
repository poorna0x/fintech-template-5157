import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

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

      <main className="flex-1 container mx-auto px-4 py-20 max-w-4xl">
        <h1 className="text-4xl font-bold mb-6 text-foreground">
          Contact Hydrogen RO
        </h1>
        
        <p className="text-lg text-muted-foreground mb-8">
          Get in touch with us for professional RO water purifier services in Bengaluru. 
          We're here to help 24/7!
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Contact Information</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">Phone</h3>
                <p className="text-foreground">+91-8884944288</p>
                <p className="text-sm text-muted-foreground">Call us for immediate assistance</p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Email</h3>
                <p className="text-foreground">info@hydrogenro.com</p>
                <p className="text-sm text-muted-foreground">Send us an email anytime</p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Working Hours</h3>
                <p className="text-foreground">24/7 Emergency Service</p>
                <p className="text-sm text-muted-foreground">Mon-Sun: 8:00 AM - 8:00 PM</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Service Areas</h2>
            <p className="text-foreground mb-4">
              We provide RO water purifier services across all areas of Bengaluru including:
            </p>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div>Whitefield</div>
              <div>Electronic City</div>
              <div>Koramangala</div>
              <div>HSR Layout</div>
              <div>Indiranagar</div>
              <div>Marathahalli</div>
              <div>BTM Layout</div>
              <div>Jayanagar</div>
              <div>Malleshwaram</div>
              <div>Rajajinagar</div>
              <div>Bannerghatta</div>
              <div>Hebbal</div>
            </div>
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-foreground">Emergency Service</h2>
          <p className="text-foreground mb-4">
            Need urgent RO repair? We provide 24/7 emergency service across Bengaluru.
          </p>
          <div className="bg-red-50 dark:bg-red-950 p-6 rounded-lg border-l-4 border-red-500">
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">Emergency Contact</h3>
            <p className="text-red-700 dark:text-red-300 font-medium">+91-8884944288</p>
            <p className="text-sm text-red-600 dark:text-red-400">Available 24/7 for emergency RO repairs</p>
          </div>
        </div>

        <div className="bg-muted p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-3 text-foreground">Quick Contact</h3>
          <p className="text-foreground mb-4">
            For non-emergency services, you can reach us during business hours or send us an email.
          </p>
          <div className="space-y-2">
            <p className="text-foreground">📞 Call: +91-8884944288</p>
            <p className="text-foreground">✉️ Email: info@hydrogenro.com</p>
            <p className="text-foreground">💬 WhatsApp: +91-8884944288</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
