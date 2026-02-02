# Zebra UI Implementation Plan

## Overview
Rebuild the Zebra frontend with a **high-fashion aesthetic** inspired by Zara, Louis Vuitton, and Balenciaga — characterized by:
- **Monochrome palette** (pure black & white)
- **Small, refined typography** (not loud/display-heavy)
- **Generous whitespace**
- **Minimal UI chrome**
- **Sharp edges, no rounded corners**
- **Subtle hover states**

---

## Phase 1: Infrastructure Setup

### 1.1 Downgrade to Tailwind v3
- Replace `tailwindcss: ^4` with `tailwindcss: ^3.4.0`
- Replace `@tailwindcss/postcss: ^4` with `autoprefixer` + standard postcss config
- Create `tailwind.config.js` (v3 style, not CSS-based config)
- Update `globals.css` to use `@tailwind base/components/utilities` instead of `@import "tailwindcss"`

### 1.2 Typography System (Fashion-Forward)
**Fonts:**
- Display: Keep **Bebas Neue** but use sparingly (logo only)
- Body: **Inter** at small sizes (11px-13px base)
- Mono: **Space Mono** for prices/data

**Size Scale (smaller than typical):**
```
xs:   10px  — micro labels
sm:   11px  — captions, metadata
base: 12px  — body text (!)
md:   13px  — emphasized body
lg:   14px  — section headers
xl:   16px  — page titles
2xl:  20px  — hero text (rare)
```

### 1.3 Color Tokens
```css
--black: #000000
--white: #FFFFFF
--gray-100: #F5F5F5  /* subtle backgrounds */
--gray-200: #E5E5E5  /* borders */
--gray-400: #A3A3A3  /* muted text */
--gray-600: #525252  /* secondary text */
```

---

## Phase 2: Core Components (Fashion Style)

### 2.1 Button
- Height: 36px (not 48px)
- Font: 10px uppercase, tracking 0.15em
- Border: 1px solid (not 2px)
- No hover background change — just border opacity shift
- Variants: `default`, `outline`, `ghost`

### 2.2 Input
- Height: 36px
- Font: 12px mono
- Border: 1px solid bottom only (underline style) OR full border
- Placeholder: gray-400
- No focus ring — just border color change

### 2.3 Card
- No rounded corners (0px radius)
- Border: 1px solid gray-200
- Padding: generous (24px-32px)
- Header: small uppercase text, not bold

### 2.4 Select/Dropdown
- Minimal chrome
- Small arrow indicator
- Same underline treatment as input

### 2.5 Table
- No alternating row colors
- Thin 1px borders
- Small text (11px)
- Generous row height for breathing room

### 2.6 Badge/Status
- Tiny (10px font)
- No background — just text with subtle border
- Or: inverted (white text on black)

---

## Phase 3: Layout Structure

### 3.1 Header (All Pages)
```
┌─────────────────────────────────────────────────────────────────┐
│  ZEBRA                                          TRADE  CONNECT  │
│  (logo, 14px)                                   (10px links)    │
└─────────────────────────────────────────────────────────────────┘
```
- Fixed height: 64px
- Bottom border: 1px
- Logo: Bebas Neue, but smaller (14-16px)
- Nav links: 10px uppercase, wide tracking

### 3.2 Landing Page (`/`)
**Hero:**
- Large statement text BUT refined (not screaming)
- "STRIPES HIDE IN PLAIN SIGHT" — 32-48px, light weight
- Subtext: 11px, max-width constrained

**How It Works:**
- 3-column grid
- Step numbers: small, subtle
- Descriptions: 11px body text

**Stats:**
- Numbers: mono, 24px
- Labels: 10px uppercase

### 3.3 Trade Page (`/trade`)
**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER                                                          │
├─────────────────────────────────────────────────────────────────┤
│  BALANCE STRIP (compact, inline)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐ │
│  │  ORDER FORM                  │  │  HERD STATUS             │ │
│  │  (left, primary action)      │  │  (right, info)           │ │
│  └──────────────────────────────┘  └──────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  YOUR ORDERS / RECENT FILLS (tabs, table below)             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Deposit Page (`/deposit`)
- LI.FI integration widget
- Chain selector (minimal dropdown)
- Amount input
- Route preview

### 3.5 Orders Page (`/orders`)
- Tab filters: All | Pending | Matched | Settled
- Table with order cards

---

## Phase 4: Pages Implementation

### 4.1 Landing Page
- [x] Exists — needs restyling for smaller fonts
- Reduce hero text size
- Refine "How It Works" section
- Update footer

### 4.2 Trade Page
- [x] Exists — needs component updates
- Implement new Order Form
- Update Herd Stats component
- Restyle tables

### 4.3 Deposit Page
- [ ] Create new
- LI.FI widget integration
- Balance display

### 4.4 Orders Page
- [ ] Create new
- Order list with status filters
- Match notification handling

---

## Phase 5: Modals & Overlays

### 5.1 Wallet Connect Modal
- [ ] Update existing
- Minimal, centered
- List of wallet options

### 5.2 Deposit Modal
- [ ] Update existing
- LI.FI integration

### 5.3 Order Confirmation Modal
- [ ] Update existing
- ZK proof generation progress

### 5.4 Match Notification Modal
- [ ] Update existing
- "MATCH FOUND" alert
- Reveal & settle flow

---

## Phase 6: Animations & Micro-interactions

- Hover states: subtle opacity/border changes
- Page transitions: none (instant, editorial)
- Loading: minimal spinner or "..." text
- Success: brief flash, not celebratory

---

## Implementation Order

1. **Tailwind v3 migration** — update configs, fix breaking changes
2. **Global styles** — typography scale, colors, base styles
3. **Core components** — Button, Input, Card, Select, Table, Badge
4. **Header component** — shared across pages
5. **Landing page** — restyle with new components
6. **Trade page** — restyle order form, herd stats, tables
7. **Deposit page** — new page with LI.FI
8. **Orders page** — new page with filters
9. **Modals** — update all 4 modals
10. **Polish** — animations, responsive, edge cases

---

## File Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── globals.css          # Updated for Tailwind v3
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx             # Landing
│   │   ├── trade/page.tsx       # Trade
│   │   ├── deposit/page.tsx     # NEW: Deposit
│   │   └── orders/page.tsx      # NEW: Orders
│   ├── components/
│   │   ├── ui/                  # Shadcn-style components
│   │   ├── layout/              # Header, Footer
│   │   ├── modals/              # All modals
│   │   └── zebra/               # Custom Zebra components
│   └── lib/
│       └── utils.ts
├── tailwind.config.js           # NEW: v3 config
├── postcss.config.js            # Updated for v3
└── package.json                 # Updated deps
```

---

## Questions for Approval

1. **Font sizes** — Is 12px base too small? Or should we go even smaller (11px)?
2. **Hero treatment** — Keep the big "STRIPES HIDE" text or go fully minimal?
3. **Color accents** — Stay pure black/white or allow subtle gray tones?
4. **Borders** — 1px everywhere or 2px for emphasis areas?
