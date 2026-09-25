---
name: Kinetic Dispatch
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#5a4138'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#8e7166'
  outline-variant: '#e2bfb2'
  surface-tint: '#a73a00'
  primary: '#a33900'
  on-primary: '#ffffff'
  primary-container: '#cc4900'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb599'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#006194'
  on-tertiary: '#ffffff'
  tertiary-container: '#007bb9'
  on-tertiary-container: '#fdfcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#ffb599'
  on-primary-fixed: '#370e00'
  on-primary-fixed-variant: '#7f2b00'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#93ccff'
  on-tertiary-fixed: '#001d31'
  on-tertiary-fixed-variant: '#004b73'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0em
  body-default:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  body-dense:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  label-mono-bold:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  caption:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-lg: 1rem
  margin: 1rem
  margin-lg: 1.5rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.375rem
  space-md: 0.5rem
  space-lg: 0.75rem
  space-xl: 1rem
  space-2xl: 1.5rem
---

## Brand & Style

This design system is engineered for mission-critical, high-throughput logistics, supply chain management, and parcel dispatch operations. The visual atmosphere balances industrial utility with high-speed executive oversight. It avoids decorative fluff in favor of high-contrast legibility, dense information throughput, and rapid cognitive scanning under stressful hub environments.

Drawing from **Modern Utilitarian** and **Data-Dense Functionalist** movements, the system treats data as an operational instrument. The target audience encompasses hub dispatchers, line-haul managers, fleet operators, and enterprise customer service agents who process thousands of consignment notes (CNs) daily. Key emotional signatures are precision, immediacy, continuous motion, and unflinching reliability.

## Colors

The palette leverages an industrial safety hierarchy: high-energy orange communicates operational dispatch and primary actions, anchored by structural courier navy and slate tones.

### Functional Core
- **Canvas Base:** `#F8FAFC` (Slate-50) establishes a low-fatigue workspace.
- **Card & Panel Layer:** `#FFFFFF` (Pure White) surfaces floating over the canvas with micro-borders.
- **Typography Primary:** `#0F172A` (Slate-900) provides decisive contrast for consignment references and metrics.
- **Typography Secondary:** `#475569` (Slate-600) for metadata headers, weight stamps, and time markers.
- **Typography Muted:** `#94A3B8` (Slate-400) for timestamps and field borders.
- **Action / Dispatch:** `#EA580C` (Safety Orange), with `#C2410C` for hover states and active indicators.
- **Structure & Chrome:** `#0F172A` (Deep Courier Navy) for top navigation bars, modal headers, and persistent dock elements.

### Operational State Tokens
Status colors follow a strict 2-tier token system (`fg` for text/borders, `bg` for 100-tint pill fills):
- **BOOKED:** `#0284C7` on `#F0F9FF` (Sky)
- **MANIFESTED / IN TRANSIT:** `#D97706` on `#FEF3C7` (Amber)
- **OUT FOR DELIVERY:** `#4F46E5` on `#EEF2FF` (Indigo)
- **DELIVERED:** `#16A34A` on `#DCFCE7` (Emerald)
- **ATTEMPT FAILED:** `#E11D48` on `#FFE4E6` (Rose)
- **RTO / RETURNED:** `#EA580C` on `#FFEDD5` (Red-Orange)
- **COD PENDING:** `#9333EA` on `#F3E8FF` (Violet)

## Typography

The typography strategy separates navigational prose from high-accuracy tracking codes:
- **Inter** handles high-legibility UI text, column headers, and administrative actions. It defaults to `font-feature-settings: "cv02", "cv03", "cv04", "cv11"` to disambiguate glyphs like `I`, `l`, and `1`.
- **JetBrains Mono** is mandatory for all Consignment Numbers (CN), Air Waybills (AWB), truck license plates, currency figures (COD), and pin codes. It prevents character misreads during high-velocity barcode handheld scans and data entry.
- All numeric tables enforce tabular figures (`font-variant-numeric: tabular-nums`) to ensure vertical column alignment across thousands of rows.

## Layout & Spacing

The layout model is built for horizontal screen efficiency, minimizing vertical scrolling to allow dispatch operators to keep critical fleet feeds within the first fold.

### Density & Grid
- **Desktop Grid:** 12-column fluid grid spanning edge-to-edge with a fixed left-rail navigation (compacted to 56px collapsed / 220px expanded).
- **Table Density:** Rows feature a condensed 36px default height (compact mode: 30px) with horizontal cell padding locked at `space-md` (8px) and vertical padding at `space-xs` (4px).
- **Responsive Adaptations:** Below 1024px, split-pane dispatch views convert to stacked modal overlays. Below 768px, operational tables reflow into dense card lists showing only CN identifier, current milestone pill, destination hub, and direct call/action triggers.

## Elevation & Depth

Depth is defined primarily by **structural micro-borders** rather than heavy drop shadows, maintaining crisp contrast under variable ambient warehouse lighting:
- **Flat Surface (Level 0):** Canvas `#F8FAFC`.
- **Raised Panel (Level 1):** `#FFFFFF` with a 1px border of `#E2E8F0` and an ambient tint shadow: `0 1px 2px 0 rgba(15, 23, 42, 0.04)`.
- **Floating Overlays & Flyouts (Level 2):** Modals, manifest slide-overs, and typeahead search drop-downs use a 1px border of `#CBD5E1` combined with `0 8px 16px -4px rgba(15, 23, 42, 0.08), 0 2px 4px -1px rgba(15, 23, 42, 0.04)`.
- **Active Scanning Zone:** An active input or live laser-scan field takes a solid 2px outline in `#EA580C` with an inner glow of `rgba(234, 88, 12, 0.15)`.

## Shapes

The geometric silhouette is sharp, industrial, and structured (`roundedness: 1`):
- Standard interactive elements (inputs, buttons, table cell badges, dropdown items) use a strict `0.25rem` (4px) corner radius to maximize rectangular data density.
- Cards, containers, and table wrapper shells use `0.375rem` (6px).
- Full pills (`9999px`) are reserved exclusively for operational status badges to instantly differentiate state tags from interactive buttons or text inputs.

## Components

### Action Scan-Bar
The signature hub component: a unified keyboard-first input field pinned to the dispatch header. It features a left-aligned optical scanner indicator icon, fixed monospaced text input, and automated hotkey triggers (`Ctrl + /` or `Cmd + K`). Entering a CN executes instant lookup or triggers batch check-in without focus loss.

### Status Pills
Status pills have a fixed height of 20px, font size of 11px (`label-mono-sm`), uppercase styling, and horizontal padding of 6px. They use an explicit dual-color lock:
- High-saturation foreground text on a soft tinted background with a matching 1px border at 20% opacity.
- Deliberate avoidance of generic neutral badges; every package must reflect an unambiguous operational state.

### Data Grid & Table Engine
- **Header:** Background `#F1F5F9`, uppercase 11px bold text `#475569`, 1px solid bottom border `#CBD5E1`.
- **Rows:** Alternating zebra-striping is forbidden. Hover rows activate an instant background shift to `#F8FAFC` with a left 2px border accent in `#EA580C` for the active cursor target.
- **Barcode & CN Cells:** Rendered in `JetBrains Mono` with an integrated "Copy AWB" and quick-view drawer action on hover.

### Inputs & Filters
Inputs feature compact 32px heights, flat white backgrounds, and a 1px border of `#CBD5E1`. On focus, the border shifts to `#EA580C` without layout jump. Segmented filter bars use an inner grey track `#E2E8F0` with 2px padding, toggling active white segment cards.

### Buttons
- **Primary Dispatch Button:** Solid `#EA580C`, text `#FFFFFF`, height 32px, font weight 600. Hover state: `#C2410C`. Focus ring: 2px `#EA580C` offset by 2px white.
- **Secondary Logistics Button:** Background `#0F172A`, text `#FFFFFF`, height 32px.
- **Subtle / Table Action Buttons:** Transparent background, 1px border `#E2E8F0`, text `#334155`, hover background `#F1F5F9`.