import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Friends Member Reservation',
  description: 'Member reservation system for friends gym and blossom yoga'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}