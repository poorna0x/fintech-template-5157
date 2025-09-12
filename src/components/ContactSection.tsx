import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';

const ContactSection = () => {
  return (
    <section id="contact" className="py-16 px-6 md:px-12 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Contact Us
          </h2>
          <p className="text-lg text-muted-foreground">
            Get in touch for all your water treatment needs
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
                    <h3 className="font-semibold text-foreground">Phone</h3>
                    <p className="text-muted-foreground">+1 (555) 123-4567</p>
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
                    <h3 className="font-semibold text-foreground">Email</h3>
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
                    <h3 className="font-semibold text-foreground">Service Area</h3>
                    <p className="text-muted-foreground">Greater Metropolitan Area & Suburbs</p>
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
                    <h3 className="font-semibold text-foreground">Business Hours</h3>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Mon-Fri: 8AM - 8PM</p>
                      <p>Saturday: 9AM - 6PM</p>
                      <p>Sunday: Emergency Only</p>
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
                      <h3 className="font-semibold text-foreground">Service Coverage Map</h3>
                      <p className="text-muted-foreground text-sm">
                        We serve the entire metropolitan area
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* Quick Links */}
        <div className="mt-12 text-center">
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="outline">Emergency Service</Button>
            <Button variant="outline">Service Areas</Button>
            <Button variant="outline">Warranty Info</Button>
            <Button variant="outline">Customer Portal</Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;