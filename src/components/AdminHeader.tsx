import React from 'react';
import Logo from './Logo';

const AdminHeader = () => {

  return (
    <div className="sticky top-0 z-50 pt-4 sm:pt-8 px-4 bg-white/95 backdrop-blur-md border-b border-gray-300">
      <header className="w-full max-w-7xl mx-auto py-2 sm:py-3 px-4 sm:px-6 md:px-8 flex items-center justify-center">
        <div className="p-2 sm:p-3">
          <Logo />
        </div>
      </header>
    </div>
  );
};

export default AdminHeader;
