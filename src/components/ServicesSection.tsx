import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Wrench, Filter, RefreshCw, Settings, CheckCircle, Clock, Shield, Phone, AlertCircle, Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const ServicesSection = () => {
  const navigate = useNavigate();

  const handleBookService = () => {
    navigate('/book');
  };

  const services = [
    {
      icon: Filter,
      title: "RO Installation & Repair",
      description: "New installation, re-installation and expert repair for all RO brands.",
      features: ["New RO installation", "RO re-installation", "Complete system repair", "Performance optimization"],
      pricing: "Installation: ₹499 | Service: ₹399",
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
        ],
        terms: [
          "Installation (₹499) does not include plumbing items or any extra RO things, and assembly",
          "Service charge (₹399) is service charge only, not including filters cost"
        ]
      }
    },
    {
      icon: Wrench,
      title: "Water Softener — New Installation & Service",
      description: "New softener installation for homes and apartments, plus salt, resin and repair.",
      features: ["New water softener installation", "Re-installation", "Resin & salt service", "Apartment / home setups"],
      pricing: "Starting from ₹499",
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
        ],
        terms: [
          "Starting from ₹499 is visiting charge, not including resin"
        ]
      },
      href: '/water-softener',
    },
    {
      icon: Building2,
      title: "Commercial RO — 25 to 1000 LPH",
      description: "25, 50, 500 and 1000 LPH plants for offices, restaurants, hotels and factories. Based in Bengaluru, up to 250 km.",
      features: ["25 & 50 LPH office / restaurant plants", "500 & 1000 LPH hotel / factory plants", "New installation & commissioning", "Service, repair and AMC"],
      pricing: "Site visit + AMC from Bengaluru",
      details: {
        includes: [
          "25 LPH commercial RO for small offices, clinics and pantries",
          "50 LPH commercial RO for restaurants, larger offices and schools",
          "500 LPH commercial RO for hotels, hostels and mid-size factories",
          "1000 LPH commercial RO for large commercial, hospital and factory sites",
          "Site survey and capacity recommendation before you buy",
          "Plant supply, plumbing, electricals and commissioning",
          "TDS check and operator briefing",
          "Membrane / filter service and breakdown repair",
          "Commercial AMC — Bengaluru and up to 250 km"
        ],
        benefits: [
          "Same team for site visit, install and after-sales",
          "Cover up to 250 km from Bengaluru",
          "Sized for real occupancy, not a catalogue guess",
          "AMC you can call for breakdowns",
          "Home RO, commercial plants and softeners from one company"
        ],
        terms: [
          "Plant price depends on capacity, raw-water TDS and site plumbing — we quote after a visit"
        ]
      },
      href: '/commercial-ro-service',
    },
    {
      icon: RefreshCw,
      title: "RO Filter Replacement",
      description: "Genuine pre-filters, membranes, carbon and post-filters for every brand.",
      features: ["All filter types", "Pre-filter replacement", "RO membrane changing", "Carbon & post-filters"],
      pricing: "Starting from ₹1799",
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
        ],
        terms: [
          "Price starting from ₹1799 does not include RO membrane"
        ]
      }
    },
    {
      icon: Settings,
      title: "RO Maintenance Packages",
      description: "Flexible plans — basic, premium and annual AMC contracts.",
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
    <section id="services" className="py-16 px-4 md:px-12 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block text-sm font-semibold text-sky-700 dark:text-sky-400 mb-3">
            Our services
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            RO Water Purifier Services in Bengaluru
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything your water purifier needs — at your doorstep.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {services.map((service, index) => (
            <Card key={index} className="h-full flex flex-col border-sky-100 dark:border-sky-500/15 hover:border-sky-300 dark:hover:border-sky-500/40 hover:shadow-lg hover:shadow-sky-900/5 transition-all duration-300">
              <CardContent className="p-6 flex-1 flex">
                <div className="flex items-stretch gap-4 w-full">
                  <div className="w-12 h-12 bg-sky-100 dark:bg-sky-500/15 rounded-xl flex items-center justify-center flex-shrink-0 self-start">
                    <service.icon className="w-6 h-6 text-sky-700 dark:text-sky-400" />
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xl font-semibold text-foreground">
                          {service.title}
                        </h3>
                      </div>
                      {service.pricing && (
                        <div className="mb-3">
                          <p className="text-sky-700 dark:text-sky-400 font-bold text-lg">
                            {service.pricing}
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-muted-foreground mb-4">
                      {service.description}
                    </p>
                    <ul className="space-y-2 mb-4">
                      {service.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="w-1.5 h-1.5 bg-sky-500 rounded-full"></div>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    
                    <div className="mt-auto space-y-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/10 cursor-pointer">
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
                          
                          {/* Pricing */}
                          {service.pricing && (
                            <div className="bg-primary/10 rounded-lg p-4 text-center">
                              <p className="text-primary font-bold text-lg">
                                {service.pricing}
                              </p>
                            </div>
                          )}
                          
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
                          
                          {/* Terms & Conditions */}
                          {service.details.terms && service.details.terms.length > 0 && (
                            <div>
                              <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-orange-500" />
                                Terms & Conditions
                              </h4>
                              <ul className="space-y-2">
                                {service.details.terms.map((term, termIndex) => (
                                  <li key={termIndex} className="flex items-start gap-2 text-muted-foreground text-sm">
                                    <div className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-1.5 flex-shrink-0"></div>
                                    <span>{term}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
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
                                className="bg-sky-700 text-white hover:bg-sky-800"
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
                    {'href' in service && service.href ? (
                      <Button asChild variant="ghost" className="w-full text-sky-700 dark:text-sky-300 cursor-pointer">
                        <Link to={service.href}>View full page</Link>
                      </Button>
                    ) : null}
                    </div>
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