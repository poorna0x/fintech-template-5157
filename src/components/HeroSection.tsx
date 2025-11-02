import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import TaskBoard from './TaskBoard';
import { Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
const HeroSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const navigate = useNavigate();
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleBookService = () => {
    navigate('/book');
  };

  const handleCall = () => {
    window.open('tel:+918884944288', '_self');
  };
  return <section id="home" className="relative w-full py-12 md:py-20 px-2 md:px-12 flex flex-col items-center justify-center overflow-hidden bg-background">
      {/* Cosmic particle effect (background dots) */}
      <div className="absolute inset-0 cosmic-grid opacity-30"></div>
      
      {/* Gradient glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full">
        <div className="w-full h-full opacity-10 bg-primary blur-[120px]"></div>
      </div>
      
      <div className={`relative z-10 max-w-4xl text-center space-y-6 transition-all duration-700 transform ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-full bg-muted text-primary">
            <span className="flex h-2 w-2 rounded-full bg-primary"></span>
            Trusted by 3000+ customers
          </span>
        </div>
        
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-medium tracking-tighter text-balance text-foreground">
          Best RO Water Purifier Services in <span className="text-foreground">Bengaluru</span>
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
          Professional RO installation, repair & maintenance services in Bengaluru. Same-day service with certified technicians.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6 items-center">
          <Button 
            onClick={handleBookService}
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm sm:text-base h-12 w-full max-w-[280px] sm:w-auto sm:min-w-[200px] px-6 sm:px-8 transition-all duration-200 min-h-[48px] shadow-lg"
          >
            Book Service Now
          </Button>
          <Button 
            onClick={handleCall}
            variant="outline" 
            className="border-border text-foreground hover:bg-accent hover:text-accent-foreground text-sm sm:text-base h-12 w-full max-w-[280px] sm:w-auto sm:min-w-[200px] px-6 sm:px-8 transition-all duration-200 min-h-[48px]"
          >
            Call: +91-8884944288
          </Button>
        </div>
        
        <div className="pt-6 text-sm text-muted-foreground space-y-1">
          <div>Same-day service available</div>
        </div>
      </div>
      
      {/* Service showcase with glassmorphic effect */}
      <div className={`w-full max-w-6xl mt-12 z-10 transition-all duration-1000 delay-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`}>
        <div className="cosmic-glow relative rounded-xl overflow-hidden border border-border backdrop-blur-sm bg-card shadow-lg p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* RO Services */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h3 className="font-semibold text-foreground">RO Installation Bengaluru</h3>
              <p className="text-sm text-muted-foreground">Professional RO system setup with quality components across Bangalore</p>
            </div>

            {/* Water Softener */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </div>
              <h3 className="font-semibold text-foreground">Water Softener Bangalore</h3>
              <p className="text-sm text-muted-foreground">Eliminate hard water issues for your home in Bengaluru</p>
            </div>

            {/* Maintenance */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-foreground">RO Filter Replacement</h3>
              <p className="text-sm text-muted-foreground">Regular filter replacement and system maintenance in Karnataka</p>
            </div>

            {/* Emergency */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="font-semibold text-foreground">Emergency RO Repair</h3>
              <p className="text-sm text-muted-foreground">24/7 emergency water system repair services in Bengaluru</p>
            </div>
          </div>
        </div>
      </div>
    </section>;
};
export default HeroSection;