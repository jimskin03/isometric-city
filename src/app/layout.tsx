import type { Metadata, Viewport } from 'next';
import { Playfair_Display, DM_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { getLocale } from "gt-next/server";
import { GTProvider } from "gt-next";

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900']
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700']
});

export const metadata: Metadata = {
  title: {
    default: 'Paradise City',
    template: 'Paradise City — %s',
  },
  description: 'Paradise City is a compact isometric city-building simulation in the CryptGreg universe.',
  openGraph: {
    title: 'Paradise City',
    description: 'A compact isometric city-building simulation in the CryptGreg universe.',
    type: 'website',
    siteName: 'Paradise City',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1179,
        height: 1406,
        type: 'image/png',
        alt: 'Paradise City isometric city builder screenshot'
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/opengraph-image.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Paradise City'
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f1219'
};

export default async function RootLayout({ children }: {children: React.ReactNode;}) {
  return (
  <html className={`dark ${playfair.variable} ${dmSans.variable}`} lang={await getLocale()}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/assets/buildings/residential.png" />
        {/* Preload critical game assets - WebP for browsers that support it */}
        <link
        rel="preload"
        href="/assets/sprites_red_water_new.webp"
        as="image"
        type="image/webp" />

        <link
        rel="preload"
        href="/assets/water.webp"
        as="image"
        type="image/webp" />

      </head>
      <body className="bg-background text-foreground antialiased font-sans overflow-hidden"><GTProvider>{children}<Analytics /></GTProvider></body>
    </html>
  );
}