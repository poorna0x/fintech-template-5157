
import React from 'react';
import { Droplets } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const Logo = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogoClick = () => {
    if (location.pathname === '/') {
      // On homepage, scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // On other pages, navigate to homepage
      navigate('/');
    }
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
