'use client';

import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export function SpotlightCard({ children, className = '', glow = 'rgba(249, 115, 22, .16)' }: { children: ReactNode; className?: string; glow?: string }) {
  function move(event: MouseEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--spot-x', `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty('--spot-y', `${event.clientY - bounds.top}px`);
  }
  return <article className={`spotlight-card ${className}`.trim()} onMouseMove={move} style={{ '--spot-glow': glow } as CSSProperties}>{children}</article>;
}
