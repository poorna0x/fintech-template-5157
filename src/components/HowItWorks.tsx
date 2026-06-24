import React from 'react';
import { CalendarCheck, Truck, Wrench, ShieldCheck } from 'lucide-react';

const steps = [
  {
    icon: CalendarCheck,
    title: 'Book in 60 seconds',
    description: 'Pick your service online or call us. No account needed.',
  },
  {
    icon: Truck,
    title: 'Technician arrives',
    description: 'A certified, verified technician reaches you the same day.',
  },
  {
    icon: Wrench,
    title: 'Service done right',
    description: 'Transparent pricing, genuine parts, and a quality check.',
  },
];

const HowItWorks = () => {
  return (
    <section className="py-16 px-4 md:px-12 water-soft">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* Image */}
          <div className="relative order-2 lg:order-1">
            <div className="rounded-3xl overflow-hidden shadow-xl border border-sky-100 dark:border-sky-500/15">
              <img
                src="/ro-technician-640.webp"
                srcSet="/ro-technician-640.webp 640w, /ro-technician.webp 1100w"
                sizes="(max-width: 1024px) 100vw, 50vw"
                alt="Certified Hydrogen RO technician servicing a water purifier at a customer's home in Bengaluru"
                width={1100}
                height={733}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 lg:left-6 lg:translate-x-0 bg-white dark:bg-card rounded-2xl shadow-xl border border-border px-5 py-3 flex items-center gap-3 whitespace-nowrap">
              <ShieldCheck className="w-6 h-6 text-sky-700 dark:text-sky-400" />
              <div className="text-left leading-tight">
                <div className="text-sm font-bold text-foreground">Verified &amp; insured</div>
                <div className="text-xs text-muted-foreground">Background-checked experts</div>
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="order-1 lg:order-2">
            <span className="inline-block text-sm font-semibold text-sky-700 dark:text-sky-400 mb-3">
              How it works
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
              Clean water in 3 simple steps
            </h2>

            <div className="space-y-6">
              {steps.map((step, index) => (
                <div key={step.title} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-2xl bg-sky-700 text-white flex items-center justify-center shadow-lg shadow-sky-700/20">
                      <step.icon className="w-6 h-6" />
                    </div>
                    {index < steps.length - 1 && (
                      <div className="w-px flex-1 bg-sky-200 dark:bg-sky-500/20 my-2" />
                    )}
                  </div>
                  <div className="pb-2">
                    <h3 className="text-lg font-semibold text-foreground">
                      <span className="text-sky-700 dark:text-sky-400 mr-2">{index + 1}.</span>
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground mt-1">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
