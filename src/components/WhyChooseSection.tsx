import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Award, Clock, DollarSign, CheckCircle } from 'lucide-react';
import { getBrandSeoProfile } from '@/lib/publicSiteSeo';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';

const WhyChooseSection = () => {
  const brand = getBrandSeoProfile(getPublicSiteKey());
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
    <section id="why-choose" className="py-16 px-4 md:px-12 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block text-sm font-semibold text-sky-700 dark:text-sky-400 mb-3">
            Why {brand.brandName}
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Why 3000+ homes trust us
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Reliable water care, done right the first time.
          </p>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {reasons.map((reason, index) => (
            <Card key={index} className="text-center border-sky-100 dark:border-sky-500/15 hover:border-sky-300 dark:hover:border-sky-500/40 hover:shadow-lg hover:shadow-sky-900/5 transition-all duration-300">
              <CardContent className="p-5 md:p-6">
                <div className="w-14 h-14 md:w-16 md:h-16 bg-sky-100 dark:bg-sky-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <reason.icon className="w-7 h-7 md:w-8 md:h-8 text-sky-700 dark:text-sky-400" />
                </div>
                <h3 className="text-base md:text-lg font-semibold text-foreground mb-2">
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