import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Wrench, Filter, RefreshCw, Settings, CheckCircle, Clock, Shield, Phone } from 'lucide-react';

const ServicesSection = () => {
  const services = [
    {
      icon: Filter,
      title: "RO Installation & Repair",
      description: "Keep your RO running perfectly with professional installation and expert repair services across Bangalore, Karnataka.",
      features: ["New RO system setup", "RO repair & troubleshooting", "Performance optimization"],
      details: {
        pricing: "Starting from ₹2,500",
        duration: "2-4 hours",
        warranty: "1 year warranty",
        includes: [
          "Complete RO system installation",
          "Water quality testing",
          "System calibration",
          "User training",
          "Free maintenance for 3 months"
        ],
        benefits: [
          "Certified technicians",
          "Same-day service available",
          "Genuine spare parts",
          "24/7 emergency support"
        ]
      }
    },
    {
      icon: Wrench,
      title: "Water Softener Service",
      description: "Ensure soft water for home & office with comprehensive softener maintenance and repair services in Bengaluru.",
      features: ["Water softener installation", "Salt level management", "System calibration"],
      details: {
        pricing: "Starting from ₹3,500",
        duration: "3-5 hours",
        warranty: "2 year warranty",
        includes: [
          "Water softener installation",
          "Salt tank setup",
          "System programming",
          "Water hardness testing",
          "Maintenance schedule setup"
        ],
        benefits: [
          "Reduces water hardness",
          "Protects appliances",
          "Softer skin and hair",
          "Energy savings"
        ]
      }
    },
    {
      icon: RefreshCw,
      title: "RO Filter Replacement",
      description: "Healthy water starts with clean filters. Regular replacement keeps your water pure across Bangalore, Karnataka.",
      features: ["RO pre-filter replacement", "RO membrane changing", "Carbon filter service"],
      details: {
        pricing: "Starting from ₹800",
        duration: "30-60 minutes",
        warranty: "6 months warranty",
        includes: [
          "Filter replacement",
          "System sanitization",
          "Water flow testing",
          "Filter life monitoring",
          "Next service reminder"
        ],
        benefits: [
          "Improved water quality",
          "Better taste and odor",
          "Extended system life",
          "Cost-effective maintenance"
        ]
      }
    },
    {
      icon: Settings,
      title: "RO Maintenance Packages",
      description: "Regular check-ups for peace of mind with comprehensive maintenance plans across Bangalore, Karnataka.",
      features: ["Quarterly RO inspections", "Preventive maintenance", "Priority service support"],
      details: {
        pricing: "Starting from ₹1,200/quarter",
        duration: "1-2 hours per visit",
        warranty: "Service guarantee",
        includes: [
          "Quarterly system inspection",
          "Filter cleaning and replacement",
          "Performance optimization",
          "Water quality testing",
          "Priority booking"
        ],
        benefits: [
          "Prevents major breakdowns",
          "Optimal water quality",
          "Extended warranty",
          "Priority customer support"
        ]
      }
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
                    
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">
                          Learn More
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-3 text-2xl">
                            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                              <service.icon className="w-5 h-5 text-primary" />
                            </div>
                            {service.title}
                          </DialogTitle>
                        </DialogHeader>
                        
                        <div className="space-y-6">
                          <p className="text-muted-foreground text-lg">
                            {service.description}
                          </p>
                          
                          {/* Service Details Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-muted/50 rounded-lg p-4 text-center">
                              <div className="text-2xl font-bold text-primary mb-1">
                                {service.details.pricing}
                              </div>
                              <div className="text-sm text-muted-foreground">Starting Price</div>
                            </div>
                            <div className="bg-muted/50 rounded-lg p-4 text-center">
                              <div className="text-2xl font-bold text-primary mb-1">
                                {service.details.duration}
                              </div>
                              <div className="text-sm text-muted-foreground">Service Duration</div>
                            </div>
                            <div className="bg-muted/50 rounded-lg p-4 text-center">
                              <div className="text-2xl font-bold text-primary mb-1">
                                {service.details.warranty}
                              </div>
                              <div className="text-sm text-muted-foreground">Warranty</div>
                            </div>
                          </div>
                          
                          {/* What's Included */}
                          <div>
                            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                              <CheckCircle className="w-5 h-5 text-primary" />
                              What's Included
                            </h4>
                            <ul className="space-y-2">
                              {service.details.includes.map((item, itemIndex) => (
                                <li key={itemIndex} className="flex items-center gap-2 text-muted-foreground">
                                  <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                          
                          {/* Benefits */}
                          <div>
                            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                              <Shield className="w-5 h-5 text-primary" />
                              Benefits
                            </h4>
                            <ul className="space-y-2">
                              {service.details.benefits.map((benefit, benefitIndex) => (
                                <li key={benefitIndex} className="flex items-center gap-2 text-muted-foreground">
                                  <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                                  {benefit}
                                </li>
                              ))}
                            </ul>
                          </div>
                          
                          {/* Call to Action */}
                          <div className="bg-primary/5 rounded-lg p-6 text-center">
                            <h4 className="text-lg font-semibold text-foreground mb-2">
                              Ready to Book This Service?
                            </h4>
                            <p className="text-muted-foreground mb-4">
                              Get a free quote and schedule your service today
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                                Book Now
                              </Button>
                              <Button variant="outline" className="flex items-center gap-2">
                                <Phone className="w-4 h-4" />
                                Call: +91-9876543210
                              </Button>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
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