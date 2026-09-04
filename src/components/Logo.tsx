
import React from 'react';
import { Droplets } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAuthPortal, isTechnicianPortalPath } from '@/lib/authPortal';

interface LogoProps {
  /** When true, use neutral z-index to avoid overlap on some mobile browsers (e.g. Samsung) */
  inFooter?: boolean;
  /** Brand text shown next to the icon. Defaults to "Hydrogen RO". */
  brandName?: string;
  /** When false, render only the icon without the brand text. Defaults to true. */
  showName?: boolean;
  /** Override click (e.g. admin dashboard refresh). Skips public-home navigation. */
  onClick?: () => void;
}

const Logo = ({
  inFooter = false,
  brandName = 'Hydrogen RO',
  showName = true,
  onClick,
}: LogoProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isTechnicianPage = isTechnicianPortalPath(location.pathname);
  const isAdminPortal = getAuthPortal(location.pathname) === 'admin';
  const isStatic = isTechnicianPage && !onClick;

  const activate = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (isTechnicianPage || isAdminPortal) {
      return;
    }
    if (location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    navigate('/');
  };

  return (
    <div
      className={`flex items-center gap-2 ${isStatic ? 'cursor-default' : 'cursor-pointer hover:opacity-80'} transition-opacity relative whitespace-nowrap ${inFooter ? 'z-auto' : 'z-50'}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isStatic) return;
        activate();
      }}
      style={{ position: 'relative', zIndex: inFooter ? 'auto' : 9999 }}
      role={isStatic ? undefined : 'button'}
      tabIndex={isStatic ? -1 : 0}
      aria-label={
        isStatic
          ? undefined
          : onClick
            ? `${brandName}, refresh`
            : isAdminPortal
              ? `${brandName}`
              : `${brandName}, go to home`
      }
      onKeyDown={(e) => {
        if (isStatic) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      <div className="w-8 h-8 bg-gradient-to-br from-sky-500 to-cyan-500 rounded-lg flex items-center justify-center relative z-50 flex-shrink-0 shadow-sm">
        <Droplets className="w-5 h-5 text-white" />
      </div>
      {showName && (
        <div className="text-xl font-bold text-foreground relative z-50 whitespace-nowrap">{brandName}</div>
      )}
    </div>
  );
};

export default Logo;
