
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Logo from './Logo';
import { Menu, X, CircleDot, LayoutDashboard, DollarSign, Sun, Moon, Phone, Wrench, Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { openPublicPhoneCall } from '@/lib/publicPhone';

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
    } else if (location.pathname === '/contact') {
      setActivePage('contact');
    } else if (location.pathname === '/about') {
      setActivePage('about');
    } else if (location.pathname === '/services') {
      setActivePage('services');
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

  // Keep page from scrolling behind the full-screen mobile menu (no sideways jump).
  useEffect(() => {
    document.body.classList.toggle('mobile-nav-open', mobileMenuOpen);
    return () => document.body.classList.remove('mobile-nav-open');
  }, [mobileMenuOpen]);
  
  const handleNavClick = (page: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setActivePage(page);
    
    if (page === 'home') {
      if (location.pathname === '/') {
        // Already on homepage, just scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        // Navigate to homepage
        navigate('/');
      }
    } else if (page === 'booking') {
      navigate('/book');
    } else if (page === 'contact') {
      // Navigate to contact page
      navigate('/contact');
    } else if (page === 'about') {
      // Navigate to about page
      navigate('/about');
    } else if (page === 'services') {
      // Navigate to services page
      navigate('/services');
    } else if (location.pathname === '/') {
      // On homepage, scroll to sections (about, services)
      const element = document.getElementById(page);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
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
    <div className="sticky top-0 z-50 pt-8 px-4 bg-sky-50/80 dark:bg-sky-950/30 backdrop-blur-md border-b border-sky-100/80 dark:border-sky-500/15">
      <header className="w-full max-w-7xl mx-auto py-3 px-6 md:px-8 flex items-center justify-between">
        <div className={`p-3 ${mobileMenuOpen ? 'hidden md:block' : 'block'}`}>
          <Logo />
        </div>
        
        {/* Mobile menu button */}
        {!mobileMenuOpen && (
          <button
            type="button"
            className="md:hidden p-3 rounded-2xl text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur-sm border border-border/50"
            onClick={toggleMobileMenu}
            aria-label="Open menu"
            aria-expanded={false}
            aria-controls="mobile-navigation"
          >
            <span className="sr-only">Open menu</span>
            <Menu size={24} aria-hidden="true" />
          </button>
        )}
        
        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center absolute left-1/2 transform -translate-x-1/2" aria-label="Main navigation">
          <div className="rounded-full px-1 py-1 backdrop-blur-md bg-white/70 dark:bg-card/70 border border-sky-100 dark:border-sky-500/15 shadow-lg shadow-sky-900/5">
            <ToggleGroup type="single" value={activePage} onValueChange={(value) => value && setActivePage(value)}>
              <ToggleGroupItem 
                value="home"
                className={cn(
                  "px-4 py-2 rounded-full transition-all duration-300 ease-in-out relative transform data-[state=on]:bg-sky-700 dark:data-[state=on]:bg-sky-500 data-[state=on]:text-white",
                  activePage === 'home' ? 'text-white bg-sky-700 dark:bg-sky-500 scale-105 shadow-md shadow-sky-600/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                )}
                onClick={handleNavClick('home')}
              >
                Home
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="about" 
                className={cn(
                  "px-4 py-2 rounded-full transition-all duration-300 ease-in-out relative transform data-[state=on]:bg-sky-700 dark:data-[state=on]:bg-sky-500 data-[state=on]:text-white",
                  activePage === 'about' ? 'text-white bg-sky-700 dark:bg-sky-500 scale-105 shadow-md shadow-sky-600/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                )}
                onClick={handleNavClick('about')}
              >
                About
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="services"
                className={cn(
                  "px-4 py-2 rounded-full transition-all duration-300 ease-in-out relative transform data-[state=on]:bg-sky-700 dark:data-[state=on]:bg-sky-500 data-[state=on]:text-white",
                  activePage === 'services' ? 'text-white bg-sky-700 dark:bg-sky-500 scale-105 shadow-md shadow-sky-600/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                )}
                onClick={handleNavClick('services')}
              >
                Services
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="booking"
                className={cn(
                  "px-4 py-2 rounded-full transition-all duration-300 ease-in-out relative transform data-[state=on]:bg-sky-700 dark:data-[state=on]:bg-sky-500 data-[state=on]:text-white",
                  activePage === 'booking' ? 'text-white bg-sky-700 dark:bg-sky-500 scale-105 shadow-md shadow-sky-600/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                )}
                onClick={handleNavClick('booking')}
              >
                Book Now
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="contact"
                className={cn(
                  "px-4 py-2 rounded-full transition-all duration-300 ease-in-out relative transform data-[state=on]:bg-sky-700 dark:data-[state=on]:bg-sky-500 data-[state=on]:text-white",
                  activePage === 'contact' ? 'text-white bg-sky-700 dark:bg-sky-500 scale-105 shadow-md shadow-sky-600/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
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
          <div
            id="mobile-navigation"
            className="md:hidden fixed inset-0 bg-background z-50 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation menu"
            style={{ 
              WebkitOverflowScrolling: 'touch',
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 50,
              WebkitTransform: 'translateZ(0)',
              transform: 'translateZ(0)',
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
              WebkitPerspective: '1000',
              perspective: '1000'
            }}
          >
            {/* Header with logo and close button */}
            <div className="flex items-center justify-between p-6 border-b border-border bg-background relative">
              <button
                type="button"
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-0 p-0"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleNavClick('home')(e);
                }}
                aria-label="Hydrogen RO home"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-sky-500 to-cyan-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Droplets className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
                <div className="text-xl font-bold text-foreground whitespace-nowrap">Hydrogen RO</div>
              </button>
              <button
                type="button"
                onClick={toggleMobileMenu}
                className="relative w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close menu"
              >
                <span className="sr-only">Close menu</span>
                <X size={24} aria-hidden="true" />
              </button>
            </div>
            
            {/* Navigation links - takes up remaining space */}
            <div className="flex-1 flex flex-col p-6 space-y-2 bg-background">
              <a 
                href="#" 
                className={`px-4 py-3 text-base rounded-lg transition-all duration-300 ease-in-out transform ${
                  activePage === 'home' ? 'bg-sky-700 dark:bg-sky-500 text-white scale-105 shadow-md shadow-sky-600/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                }`}
                onClick={handleNavClick('home')}
              >
                Home
              </a>
              <a 
                href="#about" 
                className={`px-4 py-3 text-base rounded-lg transition-all duration-300 ease-in-out transform ${
                  activePage === 'about' ? 'bg-sky-700 dark:bg-sky-500 text-white scale-105 shadow-md shadow-sky-600/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                }`}
                onClick={handleNavClick('about')}
              >
                About
              </a>
              <a 
                href="#services" 
                className={`px-4 py-3 text-base rounded-lg transition-all duration-300 ease-in-out transform ${
                  activePage === 'services' ? 'bg-sky-700 dark:bg-sky-500 text-white scale-105 shadow-md shadow-sky-600/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                }`}
                onClick={handleNavClick('services')}
              >
                Services
              </a>
              <a 
                href="#booking" 
                className={`px-4 py-3 text-base rounded-lg transition-all duration-300 ease-in-out transform ${
                  activePage === 'booking' ? 'bg-sky-700 dark:bg-sky-500 text-white scale-105 shadow-md shadow-sky-600/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
                }`}
                onClick={handleNavClick('booking')}
              >
                Book Now
              </a>
              <a 
                href="#contact" 
                className={`px-4 py-3 text-base rounded-lg transition-all duration-300 ease-in-out transform ${
                  activePage === 'contact' ? 'bg-sky-700 dark:bg-sky-500 text-white scale-105 shadow-md shadow-sky-600/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-102'
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
                  <Moon size={16} className={`${isDarkMode ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                  <Switch
                    checked={!isDarkMode}
                    onCheckedChange={toggleTheme}
                    className="data-[state=checked]:bg-primary"
                    aria-label="Toggle light and dark theme"
                  />
                  <Sun size={16} className={`${!isDarkMode ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="hidden md:flex items-center gap-4">
          {/* Theme toggle for desktop */}
          
          <div className="flex items-center gap-2 rounded-full px-3 py-2 bg-white/70 dark:bg-card/70 backdrop-blur-sm border border-sky-100 dark:border-sky-500/15">
            <Moon size={18} className={`${isDarkMode ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
            <Switch
              checked={!isDarkMode}
              onCheckedChange={toggleTheme}
              className="data-[state=checked]:bg-primary"
              aria-label="Toggle light and dark theme"
            />
            <Sun size={18} className={`${!isDarkMode ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
          </div>
          
          {/* Show phone number on booking page, Book Service button on other pages */}
          {location.pathname === '/book' ? (
            <div className="rounded-2xl">
              <Button 
                onClick={() => openPublicPhoneCall('+918884944288', 'header_booking_page')}
                className="bg-sky-700 text-white hover:bg-sky-800 shadow-lg flex items-center gap-2"
              >
                <Phone size={18} />
                +91-8884944288
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl">
              <Button 
                onClick={() => {
                  navigate('/book');
                }}
                className="bg-sky-700 text-white hover:bg-sky-800 shadow-lg"
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
