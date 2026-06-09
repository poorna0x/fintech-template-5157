
import React, { Suspense, lazy } from 'react';
import Header from '@/components/Header';
import HeroSection from '@/components/HeroSection';
import AboutSection from '@/components/AboutSection';
import ServicesSection from '@/components/ServicesSection';
import HowItWorks from '@/components/HowItWorks';
import ServiceAreasSection from '@/components/ServiceAreasSection';
import PincodeServiceSection from '@/components/PincodeServiceSection';
import BookingRedirect from '@/components/BookingRedirect';
import WhyChooseSection from '@/components/WhyChooseSection';
import ContactSection from '@/components/ContactSection';
import Footer from '@/components/Footer';

// Lazy load heavy components
const Testimonials = lazy(() => import('@/components/Testimonials'));

// Loading component for testimonials
const TestimonialsLoading = () => (
  <div className="py-16 bg-background">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mx-auto mb-4"></div>
          <div className="h-4 bg-muted rounded w-1/2 mx-auto"></div>
        </div>
      </div>
    </div>
  </div>
);

const Index = () => {
  // Note: Comprehensive crawler-facing SEO copy and structured data live as
  // static markup in index.html (served before JS runs, which is better for
  // crawlers). The previous client-rendered `.seo-hidden` duplicate was removed
  // to keep it out of the entry chunk that loads on every route.

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main>
        <HeroSection />
        <ServicesSection />
        <HowItWorks />
        <WhyChooseSection />
        <AboutSection />
        <ServiceAreasSection />
        <PincodeServiceSection />
        <Suspense fallback={<TestimonialsLoading />}>
          <Testimonials />
        </Suspense>
        <BookingRedirect />
        <ContactSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
