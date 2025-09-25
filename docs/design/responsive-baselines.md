# Responsive Baselines – Core Pages

These references satisfy the Foundation Hardening milestone requirement for capturing mobile and desktop design intent. Each section links to the canonical Figma frames and calls out critical responsive behaviors the engineering team must preserve.

## Home (`/`)

- **Desktop reference**: https://www.figma.com/file/desktop-home-trendpot
- **Mobile reference**: https://www.figma.com/file/mobile-home-trendpot
- **Layout notes**:
  - Hero uses a split grid with creator imagery pinned left on desktop and stacked above the fold on mobile.
  - Primary CTA remains visible by pinning the donate button using a sticky footer on mobile viewports.
  - Feature cards collapse from a three-column grid (≥1024px) to a single scrollable list with 16px gutters.

## Challenges Listing (`/challenges`)

- **Desktop reference**: https://www.figma.com/file/desktop-challenges-trendpot
- **Mobile reference**: https://www.figma.com/file/mobile-challenges-trendpot
- **Layout notes**:
  - Filters live in a persistent left rail on desktop and convert into a slide-over drawer triggered by a "Filter" pill on mobile.
  - Card thumbnails maintain a 16:9 aspect ratio with CSS `aspect-ratio` and shift from horizontal to vertical orientation below 768px.
  - Pagination controls condense into a progress stepper on mobile with "Previous" tucked into the app bar overflow menu.

## Challenge Detail (`/c/[slug]`)

- **Desktop reference**: https://www.figma.com/file/desktop-challenge-detail-trendpot
- **Mobile reference**: https://www.figma.com/file/mobile-challenge-detail-trendpot
- **Layout notes**:
  - Hero embeds TikTok content with max-width 720px on desktop and full-bleed on mobile while keeping captions readable.
  - Donation sidebar floats to the right on desktop but anchors beneath the hero on mobile with a persistent donate CTA.
  - Related challenges use a responsive carousel that snaps to three cards on desktop, two on tablets, and one on narrow screens.

## Authentication & Account (`/login`, `/signup`, `/auth/verify`, `/account`)

- **Desktop reference**: https://www.figma.com/file/desktop-auth-trendpot
- **Mobile reference**: https://www.figma.com/file/mobile-auth-trendpot
- **Layout notes**:
  - Auth cards expand to 480px with balanced padding on desktop and collapse to edge-to-edge cards with sticky footers on mobile so CTAs stay visible above the keyboard.
  - Typography scales from `text-3xl` headings on mobile to `text-4xl` on desktop, with supporting copy stepping up from `text-sm` to `text-base` for readability.
  - The account dashboard keeps overview tiles in a two-column grid on desktop, shifts to a single column on small screens, and exposes a bottom sheet drawer for session details/actions below the `sm` breakpoint.

## Implementation Checklist

- All breakpoints align with Tailwind's `sm`, `md`, and `lg` tokens already configured in the project.
- Document-level meta should set `viewport` to `width=device-width, initial-scale=1` to match the designs.
- Reuse `packages/ui` primitives and extend them with responsive variants rather than duplicating styles.
