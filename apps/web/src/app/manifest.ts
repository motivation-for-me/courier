import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SwiftLog Courier Operations', short_name: 'SwiftLog',
    description: 'Courier shipment, pickup, tracking, delivery and shop operations.',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'any',
    background_color: '#f4f6fa', theme_color: '#102238', categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/swiftlog-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/swiftlog-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/swiftlog-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
