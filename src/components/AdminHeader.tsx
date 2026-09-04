import React from 'react';
import Logo from './Logo';

type AdminHeaderProps = {
  /** Same action as the dashboard refresh button — do not send admins to the public home page. */
  onLogoClick?: () => void;
};

const AdminHeader = ({ onLogoClick }: AdminHeaderProps) => {
  return (
    <div className="sticky top-0 z-50 pt-4 sm:pt-8 px-4 bg-white/95 backdrop-blur-md border-b border-gray-300">
      <header className="w-full max-w-7xl mx-auto py-2 sm:py-3 px-4 sm:px-6 md:px-8 flex items-center justify-center">
        <div className="p-2 sm:p-3">
          <Logo onClick={onLogoClick} />
        </div>
      </header>
    </div>
  );
};

export default AdminHeader;
