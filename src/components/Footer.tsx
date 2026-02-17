
import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import Logo from './Logo';

const Footer = () => {
  return (
    <footer
      className="w-full py-16 px-2 md:px-12 border-t border-border bg-background"
      style={{ isolation: 'isolate', position: 'relative', zIndex: 1 }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10">
          <div className="md:col-span-2 space-y-6 text-center md:text-left">
            {/* Logo wrapper: reserve space to prevent overlap on some Samsung devices */}
            <div className="flex justify-center md:justify-start flex-shrink-0 min-h-[2.5rem]">
              <Logo inFooter />
            </div>
            <p className="text-muted-foreground max-w-xs mx-auto md:mx-0">
              Expert RO water purifier solutions for homes and offices across Bengaluru, Karnataka. Clean, safe water guaranteed with professional installation and maintenance services.
            </p>
            
            {/* Contact Information */}
            <div className="space-y-3 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3">
                <Phone className="w-4 h-4 text-primary" />
                <a href="tel:+918884944288" className="text-muted-foreground hover:text-foreground transition-colors">
                  +91-8884944288
                </a>
              </div>
              <div className="flex items-center justify-center md:justify-start gap-3">
                <Mail className="w-4 h-4 text-primary" />
                <a href="mailto:mail@hydrogenro.com" className="text-muted-foreground hover:text-foreground transition-colors">
                  mail@hydrogenro.com
                </a>
              </div>
            </div>
            <div className="flex items-center justify-center md:justify-start gap-4">
              <a href="#" className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M23 3.01s-2.018 1.192-3.14 1.53a4.48 4.48 0 00-7.86 3v1a10.66 10.66 0 01-9-4.53s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5 0-.278-.028-.556-.08-.83C21.94 5.674 23 3.01 23 3.01z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
              <a href="#" className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 9h4v12H2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
              <a href="#" className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3V2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
              <a href="#" className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78 0 003.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 001.94-2c.313-1.732.467-3.482.46-5.33a29.005 29.005 0 00-.46-5.33z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9.75 15.02l5.75-3.27-5.75-3.27v6.54z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>
          </div>
          
          <div className="hidden md:block space-y-4">
            <h4 className="font-medium text-lg text-foreground">RO Services in Bengaluru</h4>
            <ul className="space-y-3">
              <li><a href="#services" className="text-muted-foreground hover:text-foreground transition-colors">RO Installation Bengaluru</a></li>
              <li><a href="#services" className="text-muted-foreground hover:text-foreground transition-colors">RO Repair & Maintenance</a></li>
              <li><a href="#services" className="text-muted-foreground hover:text-foreground transition-colors">RO Filter Replacement</a></li>
              <li><a href="#services" className="text-muted-foreground hover:text-foreground transition-colors">Water Softener Installation</a></li>
            </ul>
          </div>
          
          <div className="hidden md:block space-y-4">
            <h4 className="font-medium text-lg text-foreground">Service Areas & Company</h4>
            <ul className="space-y-3">
              <li><a href="#about" className="text-muted-foreground hover:text-foreground transition-colors">About Hydrogen RO</a></li>
              <li><a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors">Customer Reviews</a></li>
              <li><a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors">Contact Hydrogen RO</a></li>
              <li><a href="#why-choose" className="text-muted-foreground hover:text-foreground transition-colors">Why Choose Us</a></li>
            </ul>
          </div>
          
          <div className="hidden md:block space-y-4">
            <h4 className="font-medium text-lg text-foreground">Support & Booking</h4>
            <ul className="space-y-3">
              <li><a href="#booking" className="text-muted-foreground hover:text-foreground transition-colors">Book RO Service</a></li>
              <li><a href="#about" className="text-muted-foreground hover:text-foreground transition-colors">RO Maintenance Tips</a></li>
              <li><a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors">Service Support</a></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-16 pt-8 border-t border-border relative z-0">
          {/* Mobile Policy Links - Keep as is */}
          <div className="flex justify-center md:hidden mb-8">
            <div className="grid grid-cols-2 gap-6 text-sm">
              <Link to="/privacy-policy" className="text-muted-foreground hover:text-foreground transition-colors text-center">Privacy Policy</Link>
              <Link to="/terms-of-service" className="text-muted-foreground hover:text-foreground transition-colors text-center">Terms of Service</Link>
              <Link to="/refund-policy" className="text-muted-foreground hover:text-foreground transition-colors text-center">Refund Policy</Link>
              <Link to="/cookie-policy" className="text-muted-foreground hover:text-foreground transition-colors text-center">Cookie Policy</Link>
            </div>
          </div>
          
          {/* Desktop Copyright with Policy Links */}
          <div className="hidden md:flex items-center justify-between text-muted-foreground text-sm">
            <div>
              © {new Date().getFullYear()} Hydrogen RO - Best RO Water Purifier Services in Bengaluru, Karnataka. All rights reserved.
            </div>
            <div className="flex items-center gap-6">
              <Link to="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link to="/terms-of-service" className="hover:text-foreground transition-colors">Terms of Service</Link>
              <Link to="/refund-policy" className="hover:text-foreground transition-colors">Refund Policy</Link>
              <Link to="/cookie-policy" className="hover:text-foreground transition-colors">Cookie Policy</Link>
            </div>
          </div>
          
          {/* Mobile Copyright */}
          <div className="text-center md:hidden text-muted-foreground text-sm">
            © {new Date().getFullYear()} Hydrogen RO - Best RO Water Purifier Services in Bengaluru, Karnataka. All rights reserved.
          </div>
          
          {/* Hidden SEO Links - Not visible but crawlable */}
          <div className="sr-only">
            <a href="#services">RO Installation Bengaluru</a>
            <a href="#services">RO Repair & Maintenance</a>
            <a href="#services">RO Filter Replacement</a>
            <a href="#services">Water Softener Installation</a>
            <a href="#about">About Hydrogen RO</a>
            <a href="#testimonials">Customer Reviews</a>
            <a href="#contact">Contact Hydrogen RO</a>
            <a href="#why-choose">Why Choose Us</a>
            <a href="#booking">Book RO Service</a>
            <a href="#about">RO Maintenance Tips</a>
            <a href="#contact">Service Support</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
