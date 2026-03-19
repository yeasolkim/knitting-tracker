'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import UploadClient from './UploadClient';

export default function NewPatternPage() {
  return (
    <AuthGuard>
      {(user) => (
        <div className="min-h-screen bg-gray-50/50">
          <Navbar userEmail={user.email} />

          <main className="max-w-6xl mx-auto px-4 py-8">
            <div className="mb-8">
              <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block">
                ← 대시보드로
              </Link>
              <h1 className="text-2xl font-bold text-gray-800">새 도안 추가</h1>
            </div>

            <UploadClient />
          </main>
        </div>
      )}
    </AuthGuard>
  );
}
