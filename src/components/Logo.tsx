
import React from 'react';
import { Droplets } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface LogoProps {
  /** When true, use neutral z-index to avoid overlap on some mobile browsers (e.g. Samsung) */
  inFooter?: boolean;
}

const Logo = ({ inFooter = false }: LogoProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Disable navigation on technician pages
  const isTechnicianPage = location.pathname.startsWith('/technician');

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't navigate on technician pages
    if (isTechnicianPage) {
      return;
    }
    
    // Navigate to home instead of refreshing
    if (location.pathname === '/') {
      // Already on homepage, just scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Navigate to homepage
      navigate('/');
    }
  };

  return (
    <div 
      className={`flex items-center gap-2 ${isTechnicianPage ? 'cursor-default' : 'cursor-pointer hover:opacity-80'} transition-opacity relative whitespace-nowrap ${inFooter ? 'z-auto' : 'z-50'}`}
      onClick={handleLogoClick}
      style={{ position: 'relative', zIndex: inFooter ? 'auto' : 9999 }}
      role={isTechnicianPage ? undefined : "button"}
      tabIndex={isTechnicianPage ? -1 : 0}
      onKeyDown={(e) => {
        if (isTechnicianPage) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (location.pathname === '/') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            navigate('/');
          }
        }
      }}
    >
      <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center relative z-50 flex-shrink-0">
        <Droplets className="w-5 h-5 text-primary-foreground" />
      </div>
      <div className="text-xl font-bold text-foreground relative z-50 whitespace-nowrap">Hydrogen RO</div>
    </div>
  );
};

export default Logo;
