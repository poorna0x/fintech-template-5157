
import React from 'react';
import { Droplets } from 'lucide-react';

const Logo = () => {
  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Refresh the page when logo is clicked
    window.location.reload();
  };

  return (
    <div 
      className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity relative z-50 whitespace-nowrap"
      onClick={handleLogoClick}
      style={{ position: 'relative', zIndex: 9999 }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.location.reload();
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
