import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface PageHeroProps {
  badge?: string;
  title: string;
  description: string;
  showButtons?: boolean;
}

const PageHero: React.FC<PageHeroProps> = ({ 
  badge = "Trusted by 3000+ customers",
  title,
  description,
  showButtons = true 
}) => {
  const navigate = useNavigate();

  const handleBookService = () => {
    navigate('/book');
  };

  const handleCall = () => {
    window.open('tel:+918884944288', '_self');
  };

  return (
    <section className="relative w-full py-12 md:py-20 px-2 md:px-12 flex flex-col items-center justify-center overflow-hidden bg-background">
      {/* Cosmic particle effect (background dots) */}
      <div className="absolute inset-0 cosmic-grid opacity-30"></div>
      
      {/* Gradient glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full">
        <div className="w-full h-full opacity-10 bg-primary blur-[120px]"></div>
      </div>
      
      <div className="relative z-10 max-w-4xl text-center space-y-6">
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-full bg-muted text-primary">
            <span className="flex h-2 w-2 rounded-full bg-primary"></span>
            {badge}
          </span>
        </div>
        
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tighter text-balance text-foreground">
          {title}
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
          {description}
        </p>
        
        {showButtons && (
          <>
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
              <div>Free consultation</div>
              <div>Same-day service available</div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default PageHero;

