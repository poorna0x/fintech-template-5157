
import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import Logo from './Logo';
import { getBrandSeoProfile } from '@/lib/publicSiteSeo';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';

const Footer = () => {
  const brand = getBrandSeoProfile(getPublicSiteKey());
  const telHref = (phone: string) => `tel:${phone.replace(/\s/g, '')}`;

  return (
    <footer
      className="w-full py-16 px-2 md:px-12 border-t border-border bg-background"
      style={{ isolation: 'isolate', position: 'relative', zIndex: 1 }}
    >
      <div className="max-w-7xl mx-auto">
        <h2 className="sr-only">Site footer</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10">
          <div className="md:col-span-2 space-y-6 text-center md:text-left">
            {/* Logo wrapper: reserve space to prevent overlap on some Samsung devices */}
            <div className="flex justify-center md:justify-start flex-shrink-0 min-h-[2.5rem]">
              <Logo inFooter brandName={brand.brandName} />
            </div>
            <p className="text-muted-foreground max-w-xs mx-auto md:mx-0">
              Expert RO water purifier solutions for homes and offices across Bengaluru, Karnataka. Clean, safe water guaranteed with professional installation and maintenance services.
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto md:mx-0 leading-relaxed">
              Place of business: Bengaluru, Karnataka, India. Statutory business name, address, and GSTIN appear on
              tax invoices and formal quotations where applicable.
            </p>
            
            {/* Contact Information */}
            <div className="space-y-3 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3">
                <Phone className="w-4 h-4 text-primary" />
                <a href={telHref(brand.primaryPhone)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {brand.primaryPhone}
                </a>
              </div>
              <div className="flex items-center justify-center md:justify-start gap-3">
                <Mail className="w-4 h-4 text-primary" />
                <a href={`mailto:${brand.email}`} className="text-muted-foreground hover:text-foreground transition-colors">
                  {brand.email}
                </a>
              </div>
            </div>
          </div>
          
          <div className="hidden md:block space-y-4">
            <h3 className="font-medium text-lg text-foreground">RO Services in Bengaluru</h3>
            <ul className="space-y-3">
              <li><a href="#services" className="text-muted-foreground hover:text-foreground transition-colors">RO Installation Bengaluru</a></li>
              <li><a href="#services" className="text-muted-foreground hover:text-foreground transition-colors">RO Repair & Maintenance</a></li>
              <li><a href="#services" className="text-muted-foreground hover:text-foreground transition-colors">RO Filter Replacement</a></li>
              <li><a href="#services" className="text-muted-foreground hover:text-foreground transition-colors">Water Softener Installation</a></li>
            </ul>
          </div>
          
          <div className="hidden md:block space-y-4">
            <h3 className="font-medium text-lg text-foreground">Service Areas & Company</h3>
            <ul className="space-y-3">
              <li><a href="#about" className="text-muted-foreground hover:text-foreground transition-colors">About {brand.brandName}</a></li>
              <li><a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors">Customer Reviews</a></li>
              <li><a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors">Contact {brand.brandName}</a></li>
              <li><a href="#why-choose" className="text-muted-foreground hover:text-foreground transition-colors">Why Choose Us</a></li>
            </ul>
          </div>
          
          <div className="hidden md:block space-y-4">
            <h3 className="font-medium text-lg text-foreground">Support & Booking</h3>
            <ul className="space-y-3">
              <li><a href="#booking" className="text-muted-foreground hover:text-foreground transition-colors">Book RO Service</a></li>
              <li><Link to="/warranty" className="text-muted-foreground hover:text-foreground transition-colors">Check Warranty Status</Link></li>
              <li><a href="#about" className="text-muted-foreground hover:text-foreground transition-colors">RO Maintenance Tips</a></li>
              <li><a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors">Service Support</a></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-16 pt-8 border-t border-border relative z-0">
          {/* Mobile Policy Links - Keep as is */}
          <div className="flex justify-center md:hidden mb-8">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm w-full max-w-sm">
              <Link to="/privacy-policy" className="text-muted-foreground hover:text-foreground transition-colors text-center">Privacy Policy</Link>
              <Link to="/privacy-request" className="text-muted-foreground hover:text-foreground transition-colors text-center">Privacy request</Link>
              <Link to="/terms-of-service" className="text-muted-foreground hover:text-foreground transition-colors text-center">Terms of Service</Link>
              <Link to="/refund-policy" className="text-muted-foreground hover:text-foreground transition-colors text-center">Refund Policy</Link>
              <Link to="/cookie-policy" className="text-muted-foreground hover:text-foreground transition-colors text-center">Cookie Policy</Link>
              <Link to="/disclaimer" className="text-muted-foreground hover:text-foreground transition-colors text-center col-span-2">Disclaimer</Link>
            </div>
          </div>
          
          {/* Desktop Copyright with Policy Links */}
          <div className="hidden md:flex items-center justify-between text-muted-foreground text-sm">
            <div>
              © {new Date().getFullYear()} {brand.brandName} - Best RO Water Purifier Services in Bengaluru, Karnataka. All rights reserved.
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
              <Link to="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link to="/privacy-request" className="hover:text-foreground transition-colors">Privacy request</Link>
              <Link to="/terms-of-service" className="hover:text-foreground transition-colors">Terms of Service</Link>
              <Link to="/refund-policy" className="hover:text-foreground transition-colors">Refund Policy</Link>
              <Link to="/cookie-policy" className="hover:text-foreground transition-colors">Cookie Policy</Link>
              <Link to="/disclaimer" className="hover:text-foreground transition-colors">Disclaimer</Link>
            </div>
          </div>
          
          {/* Mobile Copyright */}
          <div className="text-center md:hidden text-muted-foreground text-sm">
            © {new Date().getFullYear()} {brand.brandName} - Best RO Water Purifier Services in Bengaluru, Karnataka. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
