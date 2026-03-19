'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    // For GitHub Pages: redirect 404s back to the app so client-side routing can handle them
    const path = window.location.pathname;
    const basePath = '/knitting-tracker';

    // If we're on a valid app route, let the client router handle it
    if (path.startsWith(basePath)) {
      const appPath = path.slice(basePath.length) || '/';
      router.replace(appPath);
    } else {
      router.replace('/');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
      <div className="w-8 h-8 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
