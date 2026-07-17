import { useEffect } from 'react';
import { Droplets } from 'lucide-react';
import { isNativeApp } from '@/lib/isNativeApp';
import { markNativeWebLoaderReady } from '@/lib/nativeBootReady';

type PortalBootLoaderProps = {
  /** Admin: logo + "Hydrogen RO". Technician: logo only. */
  showName: boolean;
  message?: string;
  className?: string;
};

/**
 * Website boot spinner for portal apps.
 * On APK, signals native logo overlay to dismiss once this paints.
 */
export function PortalBootLoader({ showName, message, className }: PortalBootLoaderProps) {
  useEffect(() => {
    if (isNativeApp()) markNativeWebLoaderReady();
  }, []);

  return (
    <div
      className={
        className ??
        'min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4'
      }
    >
      <div className="text-center">
        <div className={`flex items-center justify-center gap-3 ${showName ? 'mb-6' : 'mb-6'}`}>
          <div className="w-12 h-12 bg-[#111111] rounded-xl flex items-center justify-center shadow-lg shrink-0">
            <Droplets className="w-7 h-7 text-white" />
          </div>
          {showName && (
            <div className="text-2xl font-bold text-foreground whitespace-nowrap">Hydrogen RO</div>
          )}
        </div>
        <div className="flex items-center justify-center space-x-1">
          <div
            className="w-3 h-3 bg-primary rounded-full animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="w-3 h-3 bg-primary rounded-full animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="w-3 h-3 bg-primary rounded-full animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
        {message ? (
          <p className="text-muted-foreground text-sm mt-4">{message}</p>
        ) : null}
      </div>
    </div>
  );
}

export default PortalBootLoader;
