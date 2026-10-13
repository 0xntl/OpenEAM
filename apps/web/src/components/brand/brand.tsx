// The instance's identity, in one place (D-23). An instance admin can set a
// name and upload a logo, a dark-background variant of it and a square
// icon; until they do, people see the product's own mark and name. Every
// surface that shows "who this is" — the sidebar, the sign-in and setup
// pages, the splash, the browser tab — renders one of these rather than
// spelling the name out.
import { useEffect, useState } from 'react';
import { PRODUCT_NAME, useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

// The product's mark: three outlined squares and one filled in the brand
// colour, the same geometry as public/favicon.svg. Outlines follow
// currentColor so it sits on either theme without a second file.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="3 3 26 26"
      aria-hidden
      className={cn('shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <title>{PRODUCT_NAME} mark</title>
      <rect x="5" y="5" width="8" height="8" fill="var(--brand)" stroke="none" />
      <rect x="18" y="4" width="10" height="10" />
      <rect x="4" y="18" width="10" height="10" />
      <rect x="18" y="18" width="10" height="10" />
    </svg>
  );
}

// The mark as a loading indicator (keyframes in index.css). Three variants:
// 'pulse' keeps the outlines still and lets the filled square breathe;
// 'trail' keeps the mark as it is and sends the filled square round the
// cells with a short tail behind it;
// 'trace' draws the outlines one after another and settles the square in.
// For moments when the whole app, or a whole view, has nothing to show yet
// — the splash while `me` loads, a lazily loaded diagram. Always the
// product's mark, even on a branded instance: an uploaded icon is a bitmap
// of unknown shape and cannot be animated like this, and a loader is not a
// place to read a brand anyway.
export function BrandLoader({
  label = 'Loading',
  size = 'md',
  variant = 'trail',
  className,
}: {
  label?: string;
  size?: 'md' | 'lg';
  variant?: 'pulse' | 'trail' | 'trace';
  className?: string;
}) {
  const trace = variant === 'trace';
  const fillClassName = {
    pulse: 'brand-loader-fill-pulse',
    trail: 'brand-loader-fill-trail brand-loader-fill-trail-lead',
    trace: 'brand-loader-fill',
  }[variant];
  const delays = ['0s', '0.25s', '0.5s'];
  const outline = (i: number) =>
    trace ? { className: 'brand-loader-outline', style: { animationDelay: delays[i] } } : {};
  return (
    <output
      aria-live="polite"
      aria-label={label}
      className={cn('inline-flex items-center justify-center text-foreground', className)}
    >
      <svg
        viewBox="3 3 26 26"
        aria-hidden
        className={size === 'lg' ? 'size-12' : 'size-8'}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="square"
      >
        <title>{label}</title>
        {/* Outline indices run clockwise (top right, bottom right, bottom
            left): the order the square visits them and the trace draws them. */}
        <rect {...outline(0)} x="18" y="4" width="10" height="10" />
        <rect {...outline(2)} x="4" y="18" width="10" height="10" />
        <rect {...outline(1)} x="18" y="18" width="10" height="10" />
        {/* The tail: two copies a beat behind, drawn first so they sit
            under the square. Delays and opacities live in index.css. */}
        {variant === 'trail' &&
          [2, 1].map((i) => (
            <rect
              key={i}
              className={`brand-loader-fill-trail brand-loader-fill-trail-${i}`}
              x="5"
              y="5"
              width="8"
              height="8"
              fill="var(--brand)"
              stroke="none"
            />
          ))}
        {/* Drawn last so it sits above the frames. */}
        <rect
          className={fillClassName}
          x="5"
          y="5"
          width="8"
          height="8"
          fill="var(--brand)"
          stroke="none"
        />
      </svg>
    </output>
  );
}

// Whether the page is currently dark. The theme provider toggles `.dark`
// on <html> (lib/theme.tsx), for an explicit choice and for "system" alike,
// so watching that class is the one source of truth — it also covers the
// OS switching themes while the app is open.
export function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setDark(root.classList.contains('dark')));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

// Name and mark, or the uploaded logo at the same height — the dark variant
// on a dark page when there is one. The logo is an <img>, never inline
// SVG: an image never runs script, whatever was uploaded. `name` overrides
// the saved one, for the admin page's live preview.
export function Brand({
  size = 'md',
  name,
  className,
}: {
  size?: 'md' | 'lg';
  name?: string;
  className?: string;
}) {
  const { branding } = useAuth();
  const dark = useIsDark();
  const url = (dark && branding.logoDarkUrl) || branding.logoUrl;
  const shownName = name?.trim() || branding.name;
  if (url) {
    return (
      <img
        src={url}
        alt={shownName}
        className={cn(size === 'lg' ? 'h-8' : 'h-6', 'w-auto max-w-56 object-contain', className)}
      />
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold text-foreground', className)}>
      <BrandMark className={size === 'lg' ? 'size-7' : 'size-5'} />
      <span className={size === 'lg' ? 'text-base' : 'text-sm'}>{shownName}</span>
    </span>
  );
}

// The square form: the uploaded icon, or the product's mark. For the
// collapsed sidebar, where there is no room for a name — at the same 16 px
// as the menu icons below it, so it reads as one of them.
export function BrandIcon({ className }: { className?: string }) {
  const { branding } = useAuth();
  if (branding.iconUrl) {
    return (
      <img
        src={branding.iconUrl}
        alt={branding.name}
        className={cn('size-4 shrink-0 object-contain', className)}
      />
    );
  }
  return <BrandMark className={cn('size-4 text-foreground', className)} />;
}

// Shown under the sign-in and setup forms of a branded instance. Apache-2.0
// does not require it; it is the convention self-hosted tools follow, and
// it tells someone where the software came from.
export function PoweredBy({ className }: { className?: string }) {
  const { branding } = useAuth();
  if (!branding.custom) return null;
  return (
    <p className={cn('text-center text-[11px] text-muted-foreground', className)}>
      Powered by {PRODUCT_NAME}
    </p>
  );
}

// Keeps the browser tab in step with the branding: the title is the
// instance name, the favicon is the uploaded icon when there is one.
export function useDocumentBranding(): void {
  const { branding } = useAuth();
  useEffect(() => {
    document.title = branding.name;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    link.href = branding.iconUrl ?? '/favicon.svg';
    link.type = branding.iconUrl ? '' : 'image/svg+xml';
  }, [branding]);
}
