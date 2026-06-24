
import React, { Suspense, lazy } from 'react';
import Header from '@/components/Header';
import HeroSection from '@/components/HeroSection';
import ServicesSection from '@/components/ServicesSection';
import HowItWorks from '@/components/HowItWorks';
import Footer from '@/components/Footer';

// Below-the-fold sections: lazy-loaded to shrink the homepage entry chunk.
const WhyChooseSection = lazy(() => import('@/components/WhyChooseSection'));
const AboutSection = lazy(() => import('@/components/AboutSection'));
const ServiceAreasSection = lazy(() => import('@/components/ServiceAreasSection'));
const PincodeServiceSection = lazy(() => import('@/components/PincodeServiceSection'));
const Testimonials = lazy(() => import('@/components/Testimonials'));
const BookingRedirect = lazy(() => import('@/components/BookingRedirect'));
const ContactSection = lazy(() => import('@/components/ContactSection'));

const SectionFallback = ({ minHeight = '12rem' }: { minHeight?: string }) => (
  <div aria-hidden="true" style={{ minHeight }} />
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
        <Suspense fallback={<SectionFallback minHeight="28rem" />}>
          <WhyChooseSection />
        </Suspense>
        <Suspense fallback={<SectionFallback minHeight="24rem" />}>
          <AboutSection />
        </Suspense>
        <Suspense fallback={<SectionFallback minHeight="20rem" />}>
          <ServiceAreasSection />
        </Suspense>
        <Suspense fallback={<SectionFallback />}>
          <PincodeServiceSection />
        </Suspense>
        <Suspense fallback={<SectionFallback minHeight="24rem" />}>
          <Testimonials />
        </Suspense>
        <Suspense fallback={<SectionFallback minHeight="16rem" />}>
          <BookingRedirect />
        </Suspense>
        <Suspense fallback={<SectionFallback minHeight="24rem" />}>
          <ContactSection />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
