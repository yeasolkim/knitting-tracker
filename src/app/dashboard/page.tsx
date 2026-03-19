'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import DashboardClient from './DashboardClient';

export default function DashboardPage() {
  return (
    <AuthGuard>
      {(user) => (
        <div className="min-h-screen bg-gray-50/50">
          <Navbar userEmail={user.email} />

          <main className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-gray-800">내 도안</h1>
              <Link
                href="/patterns/new"
                className="inline-flex items-center gap-2 bg-rose-400 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-rose-500 transition-colors"
              >
                + 새 도안
              </Link>
            </div>

            <DashboardClient />
          </main>
        </div>
      )}
    </AuthGuard>
  );
}
