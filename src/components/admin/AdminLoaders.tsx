import React from 'react';
import { PortalBootLoader } from '@/components/PortalBootLoader';

export function AdminScreenLoader({ message }: { message: string }) {
  return <PortalBootLoader showName message={message} />;
}

export function AdminInlineLoader({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex items-center justify-center space-x-1 mb-3">
        <div className="w-2.5 h-2.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2.5 h-2.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2.5 h-2.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  );
}
