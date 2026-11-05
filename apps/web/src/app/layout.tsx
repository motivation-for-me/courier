import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { PwaController } from '../components/pwa-controller';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Brisk Career System | Courier Operations',
  description: 'Responsive courier dispatch, pickup, tracking, and delivery operations.',
  applicationName: 'Brisk Career System',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Brisk Career System' },
  formatDetection: { telephone: false },
  icons: { icon: [{ url: '/icons/bcs-192.png', sizes: '192x192', type: 'image/png' }], apple: [{ url: '/icons/bcs-192.png', sizes: '192x192', type: 'image/png' }] },
};

export const viewport = { themeColor: '#102238', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <body><PwaController />{children}</body>
    </html>
  );
}
