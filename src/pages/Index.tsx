
import React from 'react';
import Header from '@/components/Header';
import ScrollProgress from '@/components/ScrollProgress';
import HeroSection from '@/components/HeroSection';
import AboutSection from '@/components/AboutSection';
import ServicesSection from '@/components/ServicesSection';
import ServiceAreasSection from '@/components/ServiceAreasSection';
import PincodeServiceSection from '@/components/PincodeServiceSection';
import BookingSection from '@/components/BookingSection';
import WhyChooseSection from '@/components/WhyChooseSection';
import Testimonials from '@/components/Testimonials';
import ContactSection from '@/components/ContactSection';
import Footer from '@/components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <ScrollProgress />
      <Header />
      <main>
        <HeroSection />
        <AboutSection />
        <ServicesSection />
        <ServiceAreasSection />
        <PincodeServiceSection />
        <BookingSection />
        <WhyChooseSection />
        <Testimonials />
        <ContactSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
