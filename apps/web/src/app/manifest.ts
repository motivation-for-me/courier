import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Brisk Courier System Courier Operations', short_name: 'BCS',
    description: 'Courier shipment, pickup, tracking, delivery and shop operations.',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'any',
    background_color: '#f4f6fa', theme_color: '#102238', categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/bcs-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/bcs-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/bcs-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
