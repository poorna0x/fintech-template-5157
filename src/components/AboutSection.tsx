import React from 'react';
import { Shield, Clock, DollarSign } from 'lucide-react';

const AboutSection = () => {
  return (
    <section id="about" className="py-16 px-6 md:px-12 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            About Hydrogen RO
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Hydrogen RO is committed to providing clean, safe water through expert RO and water softener services. 
            Certified technicians, fast service, and customer satisfaction guaranteed.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Certified Technicians */}
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground">Certified Technicians</h3>
            <p className="text-muted-foreground">
              Our experienced and certified professionals ensure quality installation and repair services for all water systems.
            </p>
          </div>
          
          {/* Fast Service */}
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground">Fast Service</h3>
            <p className="text-muted-foreground">
              Same-day service available with quick response times. We understand the importance of clean water in your daily life.
            </p>
          </div>
          
          {/* Affordable Pricing */}
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto">
              <DollarSign className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground">Affordable Pricing</h3>
            <p className="text-muted-foreground">
              Transparent and competitive pricing with no hidden fees. Quality service that fits your budget.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;