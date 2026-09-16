import type { Metadata } from 'next';
import { PARADISE_CITY } from '@/config/paradise';

interface Props {
  params: Promise<{ roomCode: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roomCode } = await params;
  const code = roomCode.toUpperCase();
  
  const title = `Join co-op ${code}`;
  const fullTitle = `${PARADISE_CITY.name} — ${title}`;
  const description = `You've been invited to build a city together! Join room ${code} to start playing.`;

  return {
    title,
    description,
    openGraph: {
      title: fullTitle,
      description,
      siteName: PARADISE_CITY.name,
      images: ['/opengraph-image.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: ['/opengraph-image.png'],
    },
  };
}

export default function CoopRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
