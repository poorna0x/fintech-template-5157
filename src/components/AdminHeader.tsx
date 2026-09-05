import React from 'react';
import Logo from './Logo';

type AdminHeaderProps = {
  /** Same action as the dashboard refresh button — do not send admins to the public home page. */
  onLogoClick?: () => void;
};

/**
 * Always `fixed` (not sticky). Dialog scroll-lock sets body `overflow: hidden`, which
 * unsticks sticky headers — the Hydrogen RO bar vanished behind Assign/etc. and the
 * full scrolled page showed through the dim overlay.
 */
const AdminHeader = ({ onLogoClick }: AdminHeaderProps) => {
  const bar = (
    <header className="w-full max-w-7xl mx-auto py-2 sm:py-3 px-4 sm:px-6 md:px-8 flex items-center justify-center">
      <div className="p-2 sm:p-3">
        <Logo onClick={onLogoClick} />
      </div>
    </header>
  );

  return (
    <>
      <div className="admin-sticky-header fixed top-0 left-0 right-0 z-40 pt-4 sm:pt-8 px-4 bg-white/95 backdrop-blur-md border-b border-gray-300">
        {bar}
      </div>
      {/* Same box size in document flow so content never sits under the fixed bar */}
      <div
        className="admin-sticky-header-spacer shrink-0 pt-4 sm:pt-8 px-4 border-b border-transparent invisible pointer-events-none select-none"
        aria-hidden="true"
      >
        <header className="w-full max-w-7xl mx-auto py-2 sm:py-3 px-4 sm:px-6 md:px-8 flex items-center justify-center">
          <div className="p-2 sm:p-3">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <div className="w-8 h-8 flex-shrink-0" />
              <div className="text-xl font-bold">Hydrogen RO</div>
            </div>
          </div>
        </header>
      </div>
    </>
  );
};

export default AdminHeader;
