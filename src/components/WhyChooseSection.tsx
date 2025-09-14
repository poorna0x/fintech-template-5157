import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Award, Clock, DollarSign, CheckCircle } from 'lucide-react';

const WhyChooseSection = () => {
  const reasons = [
    {
      icon: Award,
      title: "Experienced Technicians",
      description: "Certified professionals with years of experience in water treatment systems."
    },
    {
      icon: DollarSign,
      title: "Affordable & Transparent Pricing",
      description: "Competitive rates with no hidden fees. You know exactly what you're paying for."
    },
    {
      icon: CheckCircle,
      title: "100% Satisfaction Guarantee",
      description: "We stand behind our work with a complete satisfaction guarantee on all services."
    },
    {
      icon: Clock,
      title: "Quick Response",
      description: "Same-day service available with emergency support when you need it most."
    }
  ];

  return (
    <section className="py-16 px-2 md:px-12 bg-muted/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Why Choose Hydrogen RO?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Trusted by 3000+ customers for reliable water treatment solutions
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {reasons.map((reason, index) => (
            <Card key={index} className="cosmic-card text-center hover:shadow-lg transition-all duration-300">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <reason.icon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  {reason.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {reason.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyChooseSection;