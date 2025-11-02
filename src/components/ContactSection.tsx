import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle, MapPin, Clock, Mail } from 'lucide-react';

const ContactSection = () => {
  const [showCallOptions, setShowCallOptions] = useState(false);

  const handleCall = (number: string) => {
    window.open(`tel:${number}`, '_self');
    setShowCallOptions(false);
  };

  const handleWhatsApp = () => {
    window.open('https://wa.me/918884944288', '_blank', 'noopener,noreferrer');
  };

  const handleEmail = () => {
    window.open('mailto:mail@hydrogenro.com', '_self');
  };

  return (
    <section id="contact" className="py-16 px-2 md:px-12 bg-background">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Contact Hydrogen RO - Best RO Service in Bengaluru
          </h2>
          <p className="text-lg text-muted-foreground">
            Get in touch for all your RO water purifier needs across Bangalore, Karnataka. Expert technicians ready to serve you.
          </p>
        </div>
        
        {/* Main Contact Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 items-stretch">
          {/* Call Button */}
          <Card className="cosmic-card h-full">
            <CardContent className="p-8 text-center flex flex-col h-full">
              <div className="w-16 h-16 bg-gray-100 dark:bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="w-8 h-8 text-gray-600 dark:text-black" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Call Us</h3>
              <p className="text-muted-foreground mb-4">Speak directly with our RO experts</p>
              
              {!showCallOptions ? (
                <Button 
                  onClick={() => setShowCallOptions(true)}
                  className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black mt-auto"
                >
                  Call
                </Button>
              ) : (
                <div className="space-y-3 mt-auto">
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
            </CardContent>
          </Card>

          {/* WhatsApp Button */}
          <Card className="cosmic-card h-full">
            <CardContent className="p-8 text-center flex flex-col h-full">
              <div className="w-16 h-16 bg-gray-100 dark:bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-600 dark:text-black" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                </svg>
              </div>
              <h3 className="font-semibold text-foreground mb-2">WhatsApp</h3>
              <p className="text-muted-foreground mb-4">Quick chat for instant support</p>
              <Button 
                onClick={handleWhatsApp}
                className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black mt-auto"
              >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                </svg>
                Message Us
              </Button>
            </CardContent>
          </Card>

          {/* Email Button */}
          <Card className="cosmic-card h-full">
            <CardContent className="p-8 text-center flex flex-col h-full">
              <div className="w-16 h-16 bg-gray-100 dark:bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-gray-600 dark:text-black" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Email Us</h3>
              <p className="text-muted-foreground mb-4">Send us your queries and requirements</p>
              <Button 
                onClick={handleEmail}
                className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black mt-auto"
              >
                <Mail className="w-5 h-5 mr-2" />
                mail@hydrogenro.com
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* SEO Content - Hidden but accessible */}
        <div className="seo-hidden">
          <h3>RO Service Areas in Bengaluru</h3>
          <p>We serve all areas of Bangalore, Karnataka including Whitefield (560066), Electronic City (560100), Koramangala (560034), Indiranagar (560038), HSR Layout (560102), Marathahalli (560037), BTM Layout (560076), Jayanagar (560011), Malleshwaram (560003), Rajajinagar (560010), and all pincodes from 560001 to 560110</p>
          
          <h3>RO Service Hours in Bengaluru</h3>
          <p>Mon-Fri: 8AM - 8PM, Saturday: 9AM - 6PM, Sunday: Emergency RO Service Only, 24/7 Emergency RO Repair Available</p>
          
          <h3>Contact Information</h3>
          <p>Phone: +91-8884944288, +91-9886944288, Email: mail@hydrogenro.com, WhatsApp: +91-8884944288</p>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;