import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Wrench, Filter, RefreshCw, Settings, CheckCircle, Clock, Shield, Phone } from 'lucide-react';

const ServicesSection = () => {
  const navigate = useNavigate();

  const handleBookService = () => {
    navigate('/book');
  };

  const services = [
    {
      icon: Filter,
      title: "RO Installation & Repair",
      description: "Complete RO water purifier installation, re-installation, and expert repair services across Bangalore, Karnataka.",
      features: ["New RO installation", "RO re-installation", "Complete system repair", "Performance optimization"],
      details: {
        includes: [
          "Complete RO system installation & setup",
          "RO re-installation & relocation",
          "Water quality testing & calibration",
          "System programming & user training",
          "Pipe connections & electrical setup",
          "UV lamp installation & maintenance",
          "Pump & motor repair/replacement",
          "Leakage repair & pipe fixing",
          "Free maintenance for 3 months"
        ],
        benefits: [
          "Certified installation technicians",
          "Same-day installation available",
          "Genuine spare parts & warranty",
          "24/7 emergency repair support",
          "All brands service supported",
          "Professional installation guarantee"
        ]
      }
    },
    {
      icon: Wrench,
      title: "Water Softener Service",
      description: "Complete water softener installation, re-installation, resin level management, and maintenance services in Bengaluru.",
      features: ["Softener installation", "Re-installation", "Resin level management", "Salt level monitoring"],
      details: {
        includes: [
          "Water softener installation & setup",
          "Softener re-installation & relocation",
          "Resin level checking & replacement",
          "Salt level monitoring & refilling",
          "System programming & calibration",
          "Water hardness testing & analysis",
          "Bypass valve installation & repair",
          "Drain line setup & maintenance",
          "Control valve repair & replacement"
        ],
        benefits: [
          "Reduces water hardness effectively",
          "Protects appliances from scaling",
          "Softer skin and hair benefits",
          "Energy savings on heating",
          "Extended appliance lifespan",
          "Professional resin management"
        ]
      }
    },
    {
      icon: RefreshCw,
      title: "RO Filter Replacement",
      description: "Complete filter replacement service for all RO water purifier filters - pre-filters, membranes, carbon filters, and more.",
      features: ["All filter types", "Pre-filter replacement", "RO membrane changing", "Carbon & post-filters"],
      details: {
        includes: [
          "Pre-filter (PP, sediment) replacement",
          "RO membrane replacement & cleaning",
          "Carbon filter (pre & post) replacement",
          "UV lamp replacement & maintenance",
          "Mineral filter replacement",
          "Alkaline filter replacement",
          "System sanitization & cleaning",
          "Water flow testing & optimization",
          "Filter life monitoring & reminders"
        ],
        benefits: [
          "Improved water quality & purity",
          "Better taste and odor removal",
          "Extended RO system lifespan",
          "Cost-effective filter maintenance",
          "Genuine filter parts guarantee",
          "Professional filter installation"
        ]
      }
    },
    {
      icon: Settings,
      title: "RO Maintenance Packages",
      description: "Comprehensive maintenance packages with different service levels - basic, premium, and full filter service packages.",
      features: ["Basic maintenance", "Premium packages", "Full filter service", "Annual contracts"],
      details: {
        includes: [
          "Basic Package: Quarterly inspection & cleaning",
          "Premium Package: Bi-monthly service + filter replacement",
          "Full Filter Service: Complete filter replacement package",
          "Annual Contract: Year-round maintenance & support",
          "System performance optimization",
          "Water quality testing & analysis",
          "Priority booking & emergency support",
          "Filter life monitoring & reminders",
          "Comprehensive system health check"
        ],
        benefits: [
          "Prevents major breakdowns & costly repairs",
          "Maintains optimal water quality year-round",
          "Cost-effective maintenance plans",
          "Extended warranty coverage",
          "Priority customer support",
          "Flexible package options"
        ]
      }
    }
  ];

  return (
    <section id="services" className="py-16 px-2 md:px-12 bg-muted/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            RO Water Purifier Services in Bengaluru
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-4">
            Comprehensive water treatment solutions for homes and offices across Bangalore, Karnataka. Expert RO installation, repair, and maintenance services.
          </p>
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium">
            <span className="w-2 h-2 bg-primary rounded-full"></span>
            Service prices range from ₹400 to ₹15,000
          </div>
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
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xl font-semibold text-foreground">
                        {service.title}
                      </h3>
                      <div className="text-sm text-primary font-medium bg-primary/10 px-2 py-1 rounded">
                        ₹400-15K
                      </div>
                    </div>
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
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto w-[calc(100%-2rem)] md:w-full rounded-lg">
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
                          
                          {/* Price Range */}
                          <div className="bg-primary/5 rounded-lg p-4 text-center">
                            <div className="text-sm text-muted-foreground mb-1">Service Price Range</div>
                            <div className="text-2xl font-bold text-primary">₹400 - ₹15,000</div>
                            <div className="text-xs text-muted-foreground mt-1">*Final price depends on service type and requirements</div>
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
                              <Button 
                                onClick={handleBookService}
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                              >
                                Book Now
                              </Button>
                              <Button variant="outline" className="flex items-center gap-2">
                                <Phone className="w-4 h-4" />
                                Call: +91-8884944288
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