import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';

const ContactSection = () => {
  return (
    <section id="contact" className="py-16 px-2 md:px-12 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Contact Hydrogen RO - Best RO Service in Bengaluru
          </h2>
          <p className="text-lg text-muted-foreground">
            Get in touch for all your RO water purifier needs across Bangalore, Karnataka. Expert technicians ready to serve you.
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Contact Information */}
          <div className="space-y-6">
            <Card className="cosmic-card">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Phone className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">RO Service Phone</h3>
                    <p className="text-muted-foreground">+91-8884944288</p>
                  </div>
                </div>
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                  Call Now
                </Button>
              </CardContent>
            </Card>
            
            <Card className="cosmic-card">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Mail className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">RO Service Email</h3>
                    <p className="text-muted-foreground">info@hydrogenro.com</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full">
                  Send Email
                </Button>
              </CardContent>
            </Card>
            
            <Card className="cosmic-card">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">RO Service Areas in Bengaluru</h3>
                    <p className="text-muted-foreground">All areas of Bangalore, Karnataka including Whitefield (560066), Electronic City (560100), Koramangala (560034), Indiranagar (560038), HSR Layout (560102), Marathahalli (560037), BTM Layout (560076), Jayanagar (560011), Malleshwaram (560003), Rajajinagar (560010), and all pincodes from 560001 to 560110</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="cosmic-card">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">RO Service Hours in Bengaluru</h3>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Mon-Fri: 8AM - 8PM</p>
                      <p>Saturday: 9AM - 6PM</p>
                      <p>Sunday: Emergency RO Service Only</p>
                      <p className="text-primary font-medium">24/7 Emergency RO Repair Available</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Map Placeholder */}
          <div className="space-y-6">
            <Card className="cosmic-card h-full">
              <CardContent className="p-0 h-full min-h-[400px]">
                <div className="w-full h-full bg-muted/50 rounded-lg flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <MapPin className="w-12 h-12 text-primary mx-auto" />
                    <div>
                      <h3 className="font-semibold text-foreground">RO Service Coverage in Bengaluru</h3>
                      <p className="text-muted-foreground text-sm">
                        We serve all areas of Bangalore, Karnataka including Whitefield (560066), Electronic City (560100), Koramangala (560034), Indiranagar (560038), HSR Layout (560102), Marathahalli (560037), BTM Layout (560076), Jayanagar (560011), Malleshwaram (560003), Rajajinagar (560010), and all pincodes from 560001 to 560110
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        
      </div>
    </section>
  );
};

export default ContactSection;