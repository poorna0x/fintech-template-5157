
import React from 'react';
import { Droplets } from 'lucide-react';

const Logo = () => {
  const handleLogoClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div 
      className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={handleLogoClick}
    >
      <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
        <Droplets className="w-5 h-5 text-primary-foreground" />
      </div>
      <div className="text-xl font-bold text-foreground">Hydrogen RO</div>
    </div>
  );
};

export default Logo;
