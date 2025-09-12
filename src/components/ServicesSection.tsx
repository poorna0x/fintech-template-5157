import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wrench, Filter, RefreshCw, Settings } from 'lucide-react';

const ServicesSection = () => {
  const services = [
    {
      icon: Filter,
      title: "RO Installation & Repair in Bengaluru",
      description: "Keep your RO running perfectly with professional installation and expert repair services across Bangalore, Karnataka.",
      features: ["New RO system setup in Bengaluru", "RO repair & troubleshooting", "Performance optimization"]
    },
    {
      icon: Wrench,
      title: "Water Softener Service Bangalore",
      description: "Ensure soft water for home & office with comprehensive softener maintenance and repair services in Bengaluru.",
      features: ["Water softener installation in Bangalore", "Salt level management", "System calibration"]
    },
    {
      icon: RefreshCw,
      title: "RO Filter Replacement Bengaluru",
      description: "Healthy water starts with clean filters. Regular replacement keeps your water pure across Bangalore, Karnataka.",
      features: ["RO pre-filter replacement", "RO membrane changing", "Carbon filter service"]
    },
    {
      icon: Settings,
      title: "RO Maintenance Packages Bengaluru",
      description: "Regular check-ups for peace of mind with comprehensive maintenance plans across Bangalore, Karnataka.",
      features: ["Quarterly RO inspections", "Preventive maintenance", "Priority service in Bengaluru"]
    }
  ];

  return (
    <section id="services" className="py-16 px-6 md:px-12 bg-muted/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            RO Water Purifier Services in Bengaluru
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Comprehensive water treatment solutions for homes and offices across Bangalore, Karnataka. Expert RO installation, repair, and maintenance services.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {services.map((service, index) => (
            <Card key={index} className="cosmic-card hover:shadow-lg transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <service.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-foreground mb-3">
                      {service.title}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {service.description}
                    </p>
                    <ul className="space-y-2 mb-4">
                      {service.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Button variant="outline" className="w-full">
                      Learn More
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;