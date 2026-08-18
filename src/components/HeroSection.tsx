import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Star, ShieldCheck, Clock, Phone, Droplets, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { openPublicPhoneCall } from '@/lib/publicPhone';

const HeroSection = () => {
  const [copyVisible, setCopyVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setCopyVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const handleBookService = () => {
    navigate('/book');
  };
  const handleCall = () => openPublicPhoneCall('+918884944288');

  const trustPoints = [
    'Same-day service',
    '25 to 1000 LPH plants',
    'New softener install',
    'Service from ₹399',
  ];

  return (
    <section id="home" className="water-hero relative w-full overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* Left: copy */}
          <div
            className={`space-y-6 text-center lg:text-left transition-all duration-700 ${
              copyVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            <div className="flex justify-center lg:justify-start">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 border border-sky-200/60 dark:border-sky-500/20">
                <Droplets className="w-3.5 h-3.5" />
                Trusted by 3000+ homes in Bengaluru
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-balance text-foreground leading-[1.05]">
              Best RO Water Purifier <br className="hidden md:block" />
              Services in <span className="water-text">Bengaluru</span>
            </h1>

            <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0">
              Home RO, <Link to="/commercial-ro-service" className="text-sky-700 dark:text-sky-400 font-medium hover:underline underline-offset-2">commercial 25 to 1000 LPH plants</Link>
              {' '}and{' '}
              <Link to="/water-softener" className="text-sky-700 dark:text-sky-400 font-medium hover:underline underline-offset-2">new water softener installation</Link>
              {' '}— based in Bengaluru, covering up to 250 km. Book in 60 seconds.
            </p>

            {/* Rating row */}
            <div className="flex items-center justify-center lg:justify-start gap-2 text-sm">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <span className="font-semibold text-foreground">5-star rated service</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start pt-2">
              <Button
                onClick={handleBookService}
                className="h-12 px-8 text-base font-semibold bg-sky-700 hover:bg-sky-800 text-white shadow-lg shadow-sky-700/20 transition-all"
              >
                Book Service Now
              </Button>
              <Button
                onClick={handleCall}
                variant="outline"
                className="h-12 px-8 text-base font-semibold border-sky-200 dark:border-sky-500/30 text-foreground hover:bg-sky-50 dark:hover:bg-sky-500/10 flex items-center gap-2"
              >
                <Phone className="w-4 h-4 text-sky-700" />
                +91-8884944288
              </Button>
            </div>

            {/* Trust points */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 pt-4">
              {trustPoints.map((point) => (
                <span key={point} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-sky-500" />
                  {point}
                </span>
              ))}
            </div>
          </div>

          {/* Right: photo — visible immediately for LCP (no fade-in delay) */}
          <div className="relative">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-sky-900/10 border border-white/60 dark:border-white/10">
              <img
                src="/hero-ro-purifier-640.webp"
                srcSet="/hero-ro-purifier-640.webp 640w, /hero-ro-purifier.webp 1100w"
                sizes="(max-width: 1024px) 100vw, 50vw"
                alt="RO water purifier installed in a modern Bengaluru kitchen with clean drinking water"
                width={1100}
                height={733}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Floating rating chip */}
            <div className="water-float absolute -bottom-4 -right-2 md:-right-5 bg-white dark:bg-card rounded-2xl shadow-xl border border-border px-4 py-3 flex items-center gap-3" style={{ animationDelay: '1.2s' }}>
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
                <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
              </div>
              <div className="text-left leading-tight">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">5-star rated</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Droplets, value: '3000+', label: 'Homes served' },
            { icon: ShieldCheck, value: 'Certified', label: 'Technicians' },
            { icon: Clock, value: '24/7', label: 'Emergency support' },
            { icon: CheckCircle2, value: '100%', label: 'Bengaluru coverage' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl bg-white/70 dark:bg-card/60 backdrop-blur-sm border border-sky-100 dark:border-sky-500/15 p-5 text-center"
            >
              <stat.icon className="w-6 h-6 text-sky-700 dark:text-sky-400 mx-auto mb-2" />
              <div className="text-xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
