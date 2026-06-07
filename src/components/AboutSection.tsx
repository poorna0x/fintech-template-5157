import React from 'react';
import { Shield, Clock, DollarSign } from 'lucide-react';

const AboutSection = () => {
  return (
    <section id="about" className="py-16 px-4 md:px-12 water-soft">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block text-sm font-semibold text-sky-600 dark:text-sky-400 mb-3">
            About us
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Bengaluru's trusted RO experts
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Clean, safe drinking water for every home and office — backed by certified technicians and honest pricing.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Shield, title: 'Certified technicians', desc: 'Trained, verified experts for all RO brands.' },
            { icon: Clock, title: 'Same-day service', desc: 'Quick response across all of Bengaluru.' },
            { icon: DollarSign, title: 'Transparent pricing', desc: 'No hidden fees. Pay only for what you need.' },
          ].map((item) => (
            <div key={item.title} className="text-center space-y-3 rounded-2xl bg-white/60 dark:bg-card/50 border border-sky-100 dark:border-sky-500/15 p-6">
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/15 rounded-2xl flex items-center justify-center mx-auto">
                <item.icon className="w-8 h-8 text-sky-600 dark:text-sky-400" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
              <p className="text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AboutSection;