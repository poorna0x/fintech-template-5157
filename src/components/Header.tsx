
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Logo from './Logo';
import { Menu, X, CircleDot, LayoutDashboard, DollarSign, Sun, Moon, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';

const Header = () => {
  const [activePage, setActivePage] = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  

  // Set active page based on current route
  useEffect(() => {
    if (location.pathname === '/') {
      setActivePage('home');
    } else if (location.pathname === '/book') {
      setActivePage('booking');
    } else if (location.pathname === '/admin') {
      setActivePage('admin');
    }
  }, [location.pathname]);

  // Dynamic navigation focus based on scroll position (only on homepage)
  useEffect(() => {
    if (location.pathname !== '/') return;

    const handleScroll = () => {
      const sections = ['home', 'about', 'services', 'booking', 'contact'];
      const scrollPosition = window.scrollY + 200; // Increased offset for better UX

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = document.getElementById(sections[i]);
        if (section && section.offsetTop <= scrollPosition) {
          setActivePage(sections[i]);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);
  
  const handleNavClick = (page: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setActivePage(page);
    
    if (page === 'home') {
      // Navigate to homepage
      navigate('/');
    } else if (page === 'booking') {
      // Navigate to booking page
      navigate('/book');
    } else if (page === 'admin') {
      // Navigate to admin page
      navigate('/admin');
    } else if (location.pathname === '/') {
      // On homepage, scroll to sections
      if (page === 'home') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const element = document.getElementById(page);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }
    } else {
      // On other pages, navigate to homepage and then scroll to section
      navigate('/');
      // Small delay to ensure page loads before scrolling
      setTimeout(() => {
        const element = document.getElementById(page);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
    setMobileMenuOpen(false);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };


  return (
    <div className="sticky top-0 z-50 pt-8 px-4 bg-background/95 backdrop-blur-md border-b border-border/50">
      <header className="w-full max-w-7xl mx-auto py-3 px-6 md:px-8 flex items-center justify-between">
        <div className="p-3">
          <Logo />
        </div>
        
        {/* Mobile menu button */}
        <button 
          className="md:hidden p-3 rounded-2xl text-muted-foreground hover:text-foreground bg-card/80 backdrop-blur-sm border border-border/50"
          onClick={toggleMobileMenu}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        
        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center absolute left-1/2 transform -translate-x-1/2">
          <div className="rounded-full px-1 py-1 backdrop-blur-md bg-background/80 border border-border shadow-lg">
            <ToggleGroup type="single" value={activePage} onValueChange={(value) => value && setActivePage(value)}>
              <ToggleGroupItem 
                value="home"
                className={cn(
                  "px-4 py-2 rounded-full transition-all duration-300 ease-in-out relative transform",
                  activePage === 'home' ? 'text-accent-foreground bg-accent scale-105 shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                )}
                onClick={handleNavClick('home')}
              >
                Home
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="about" 
                className={cn(
                  "px-4 py-2 rounded-full transition-all duration-300 ease-in-out relative transform",
                  activePage === 'about' ? 'text-accent-foreground bg-accent scale-105 shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                )}
                onClick={handleNavClick('about')}
              >
                About
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="services"
                className={cn(
                  "px-4 py-2 rounded-full transition-all duration-300 ease-in-out relative transform",
                  activePage === 'services' ? 'text-accent-foreground bg-accent scale-105 shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                )}
                onClick={handleNavClick('services')}
              >
                Services
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="booking"
                className={cn(
                  "px-4 py-2 rounded-full transition-all duration-300 ease-in-out relative transform",
                  activePage === 'booking' ? 'text-accent-foreground bg-accent scale-105 shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                )}
                onClick={handleNavClick('booking')}
              >
                Book Now
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="contact"
                className={cn(
                  "px-4 py-2 rounded-full transition-all duration-300 ease-in-out relative transform",
                  activePage === 'contact' ? 'text-accent-foreground bg-accent scale-105 shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                )}
                onClick={handleNavClick('contact')}
              >
                Contact
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </nav>
        
        {/* Mobile navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 bg-background z-50 flex flex-col">
            {/* Header with logo and close button */}
            <div className="flex items-center justify-between p-6 border-b border-border bg-background">
              <Logo />
              <button 
                onClick={toggleMobileMenu}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Navigation links - takes up remaining space */}
            <div className="flex-1 flex flex-col p-6 space-y-2 bg-background">
              <a 
                href="#" 
                className={`px-4 py-3 text-base rounded-lg transition-all duration-300 ease-in-out transform ${
                  activePage === 'home' ? 'bg-accent text-accent-foreground scale-105 shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                }`}
                onClick={handleNavClick('home')}
              >
                Home
              </a>
              <a 
                href="#about" 
                className={`px-4 py-3 text-base rounded-lg transition-all duration-300 ease-in-out transform ${
                  activePage === 'about' ? 'bg-accent text-accent-foreground scale-105 shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                }`}
                onClick={handleNavClick('about')}
              >
                About
              </a>
              <a 
                href="#services" 
                className={`px-4 py-3 text-base rounded-lg transition-all duration-300 ease-in-out transform ${
                  activePage === 'services' ? 'bg-accent text-accent-foreground scale-105 shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                }`}
                onClick={handleNavClick('services')}
              >
                Services
              </a>
              <a 
                href="#booking" 
                className={`px-4 py-3 text-base rounded-lg transition-all duration-300 ease-in-out transform ${
                  activePage === 'booking' ? 'bg-accent text-accent-foreground scale-105 shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                }`}
                onClick={handleNavClick('booking')}
              >
                Book Now
              </a>
              <a 
                href="#contact" 
                className={`px-4 py-3 text-base rounded-lg transition-all duration-300 ease-in-out transform ${
                  activePage === 'contact' ? 'bg-accent text-accent-foreground scale-105 shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                }`}
                onClick={handleNavClick('contact')}
              >
                Contact
              </a>
            </div>
            
            {/* Theme toggle at bottom */}
            <div className="p-6 bg-background border-t border-border">
              <div className="flex items-center justify-between px-4 py-3 bg-card rounded-lg border border-border">
                <span className="text-sm text-muted-foreground">Theme</span>
                <div className="flex items-center gap-2">
                  <Moon size={16} className={`${isDarkMode ? 'text-primary' : 'text-muted-foreground'}`} />
                  <Switch 
                    checked={!isDarkMode} 
                    onCheckedChange={toggleTheme} 
                    className="data-[state=checked]:bg-primary"
                  />
                  <Sun size={16} className={`${!isDarkMode ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="hidden md:flex items-center gap-4">
          {/* Theme toggle for desktop */}
          <div className="flex items-center gap-2 rounded-full px-3 py-2 bg-card/80 backdrop-blur-sm border border-border/50">
            <Moon size={18} className={`${isDarkMode ? 'text-primary' : 'text-muted-foreground'}`} />
            <Switch 
              checked={!isDarkMode} 
              onCheckedChange={toggleTheme} 
              className="data-[state=checked]:bg-primary"
            />
            <Sun size={18} className={`${!isDarkMode ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          
          {/* Show phone number on booking page, Book Service button on other pages */}
          {location.pathname === '/book' ? (
            <div className="rounded-2xl">
              <Button 
                onClick={() => window.open('tel:+918884944288', '_self')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg flex items-center gap-2"
              >
                <Phone size={18} />
                +91-8884944288
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl">
              <Button 
                onClick={() => navigate('/book')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
              >
                Book Service
              </Button>
            </div>
          )}
        </div>
      </header>
    </div>
  );
};

export default Header;
