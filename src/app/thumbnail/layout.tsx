import type { Metadata } from 'next';
import { PARADISE_CITY } from '@/config/paradise';

export const metadata: Metadata = {
  title: { absolute: `OG Preview — ${PARADISE_CITY.name}` },
  robots: 'noindex, nofollow',
};

export default function ThumbnailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
