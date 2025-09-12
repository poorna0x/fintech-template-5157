import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wrench, Filter, RefreshCw, Settings } from 'lucide-react';

const ServicesSection = () => {
  const services = [
    {
      icon: Filter,
      title: "RO Installation & Repair",
      description: "Keep your RO running perfectly with professional installation and expert repair services.",
      features: ["New RO system setup", "Repair & troubleshooting", "Performance optimization"]
    },
    {
      icon: Wrench,
      title: "Water Softener Service",
      description: "Ensure soft water for home & office with comprehensive softener maintenance and repair.",
      features: ["Softener installation", "Salt level management", "System calibration"]
    },
    {
      icon: RefreshCw,
      title: "Filter Replacement",
      description: "Healthy water starts with clean filters. Regular replacement keeps your water pure.",
      features: ["Pre-filter replacement", "Membrane changing", "Carbon filter service"]
    },
    {
      icon: Settings,
      title: "Maintenance Packages",
      description: "Regular check-ups for peace of mind with comprehensive maintenance plans.",
      features: ["Quarterly inspections", "Preventive maintenance", "Priority service"]
    }
  ];

  return (
    <section id="services" className="py-16 px-6 md:px-12 bg-muted/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Our Services
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Comprehensive water treatment solutions for homes and offices
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