import React from 'react';
import { isNativeApp } from '@/lib/isNativeApp';

export function AdminScreenLoader({ message }: { message: string }) {
  if (isNativeApp()) {
    return <div className="min-h-screen bg-[#FAFAFA]" aria-hidden />;
  }
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="flex items-center justify-center space-x-1 mb-4">
          <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}

export function AdminInlineLoader({ message }: { message: string }) {
  if (isNativeApp()) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    );
  }
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
