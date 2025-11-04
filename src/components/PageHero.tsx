import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';

interface PageHeroProps {
  badge?: string;
  title: string | React.ReactNode;
  description: string;
  showButtons?: boolean;
  customDarkBgColor?: string;
}

const PageHero: React.FC<PageHeroProps> = ({ 
  badge = "Trusted by 3000+ customers",
  title,
  description,
  showButtons = true,
  customDarkBgColor
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode } = useTheme();

  // Check if we're on About, Contact, or Services pages
  const isSpecialPage = location.pathname === '/about' || 
                        location.pathname === '/contact' || 
                        location.pathname === '/services';
  
  // Apply custom color if provided in dark mode on these pages
  const darkBgStyle = (isSpecialPage && isDarkMode && customDarkBgColor)
    ? { backgroundColor: customDarkBgColor }
    : {};

  const handleBookService = () => {
    navigate('/book');
  };

  const handleCall = () => {
    window.open('tel:+918884944288', '_self');
  };

  return (
    <section 
      className="relative w-full py-12 md:py-20 px-2 md:px-12 flex flex-col items-center justify-center overflow-hidden bg-background/95 backdrop-blur-md"
      style={darkBgStyle}
    >
      <div className="relative z-10 max-w-4xl text-center space-y-6">
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-full bg-muted text-primary">
            <span className="flex h-2 w-2 rounded-full bg-primary"></span>
            {badge}
          </span>
        </div>
        
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tighter text-balance text-foreground">
          {typeof title === 'string' && title.startsWith('About Hydrogen') ? (
            <>
              <span className="whitespace-nowrap">About Hydrogen RO</span>
              {title.replace('About Hydrogen RO', '')}
            </>
          ) : (
            title
          )}
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
              <div>Same-day service available</div>
              <div>All brands service supported</div>
              <div>Genuine spare parts</div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default PageHero;

