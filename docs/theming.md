# Theming

## Philosophy

- Tokenize visuals, keep structure stable.
- Treat CSS custom properties as the public theming API.
- Keep runtime logic unchanged: theming is CSS-first and virtualization-safe.

## Phase 0 Inventory (Style Audit)

### Structural styles (kept as implementation detail)

- Layout primitives: `display`, `flex`, `grid`, `position`, `overflow`.
- Virtualization container sizing and containment (`contain`, viewport height management).
- Interaction wiring classes and DOM structure for rows/pinned section.

### Themeable styles (moved to CSS variables)

- Colors: foreground/background, muted text, hover, error, borders, pinned links.
- Typography: family, base size, heading weight/size, line height.
- Sizing tokens: row height, icon size, control size, row paddings/gaps.
- Focus styles: focus ring and focus background.
- Surfaces/effects: radius and shadow.
- Skeleton shimmer colors.

## Contract and Scoping

### Naming convention

- Prefix: `--tree-*`
- Scope: component host (`tree-explorer` in Angular, `td-tree-lit` host in Lit)
- Backward-compatible aliases are kept for legacy highlight variables:
  - `--td-tree-highlight-*` maps to `--tree-highlight-*`

### Default source

- Angular default contract file:
  - `packages/tree-explorer/src/lib/styles/tree-theme.css`
- Loaded by:
  - `packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.ts`
- Also mirrored in Lit host styles:
  - `packages/lit-tree-explorer/src/tree-lit.ts`

## How To Theme (Angular)

Set variables directly on the host:

```html
<tree-explorer class="app-tree" ...></tree-explorer>
```

```css
.app-tree {
  --tree-bg: #ffffff;
  --tree-fg: #111827;
  --tree-border: #d1d5db;
  --tree-hover-bg: #f3f4f6;
  --tree-focus-ring: 2px solid #2563eb;
  --tree-row-height: 40px;
}
```

Map design-system tokens:

```css
.app-tree {
  --tree-bg: var(--ds-surface-default);
  --tree-fg: var(--ds-text-primary);
  --tree-muted-fg: var(--ds-text-secondary);
  --tree-border: var(--ds-border-subtle);
  --tree-focus-ring: 2px solid var(--ds-focus-ring);
  --tree-pinned-link-fg: var(--ds-link-default);
}
```

Light/dark wrappers:

```css
.theme-light tree-explorer {
  --tree-bg: #ffffff;
  --tree-fg: #0f172a;
}

.theme-dark tree-explorer {
  --tree-bg: #0b1220;
  --tree-fg: #e5e7eb;
  --tree-muted-fg: #9ca3af;
  --tree-border: #334155;
  --tree-divider: #1f2937;
  --tree-hover-bg: #111827;
  --tree-focus-bg: #172554;
  --tree-pinned-bg: linear-gradient(180deg, #111827 0%, #0f172a 100%);
}
```

## How To Theme (Lit)

Apply the same variables on the custom element host:

```html
<td-tree-lit class="docs-tree"></td-tree-lit>
```

```css
.docs-tree {
  --tree-bg: #ffffff;
  --tree-fg: #111827;
  --tree-row-height: 36px;
  --tree-pinned-link-fg: #0b63ce;
}
```

## Variable Reference

| Variable | Purpose | Default |
|---|---|---|
| `--tree-row-height` | Row height used by virtualized rows | `36px` |
| `--tree-row-padding-x` | Row horizontal padding | `8px` |
| `--tree-row-padding-y` | Row vertical padding | `4px` |
| `--tree-row-gap` | Gap between row controls/content | `8px` |
| `--tree-icon-size` | Icon size for row/pinned icons | `16px` |
| `--tree-control-size` | Control button size (caret/menu) | `32px` |
| `--tree-font-family` | Base font family | `Roboto, 'Helvetica Neue', sans-serif` |
| `--tree-font-size` | Base font size | `13px` |
| `--tree-font-weight` | Base font weight | `400` |
| `--tree-line-height` | Base line height | `1.35` |
| `--tree-bg` | Main background | `#ffffff` |
| `--tree-fg` | Primary foreground | `rgba(0,0,0,0.87)` |
| `--tree-muted-fg` | Muted text | `rgba(0,0,0,0.6)` |
| `--tree-subtle-fg` | Secondary subtle text | `rgba(0,0,0,0.58)` |
| `--tree-disabled-fg` | Disabled text color | `rgba(0,0,0,0.45)` |
| `--tree-disabled-opacity` | Disabled opacity | `0.6` |
| `--tree-border` | Main border color | `#e0e0e0` |
| `--tree-divider` | Row divider color | `#f0f0f0` |
| `--tree-hover-bg` | Hover background | `#f5f5f5` |
| `--tree-hover-muted-bg` | Hover background for controls | `rgba(0,0,0,0.08)` |
| `--tree-focus-ring` | Focus outline | `2px solid #0b63ce` |
| `--tree-focus-bg` | Focused row background | `#eaf3ff` |
| `--tree-error-fg` | Error text color | `#b00020` |
| `--tree-error-border` | Error row border | `#b00020` |
| `--tree-icon-fg` | Icon color | `rgba(0,0,0,0.54)` |
| `--tree-radius` | Default control radius | `4px` |
| `--tree-radius-pill` | Pill radius (skeleton) | `999px` |
| `--tree-shadow` | Surface shadow | `0 2px 8px rgba(0,0,0,0.15)` |
| `--tree-skeleton-bg` | Skeleton base color | `#eceff1` |
| `--tree-skeleton-bg-alt` | Skeleton shimmer color | `#f5f7f8` |
| `--tree-pinned-bg` | Pinned section background | `linear-gradient(180deg, #fcfcfd 0%, #f7f8fa 100%)` |
| `--tree-pinned-border` | Pinned section border | `var(--tree-border)` |
| `--tree-pinned-branch-fg` | Pinned heading color | `rgba(0,0,0,0.74)` |
| `--tree-pinned-accent` | Pinned heading icon color | `#f6b300` |
| `--tree-pinned-connector` | Pinned branch connector line | `rgba(0,0,0,0.12)` |
| `--tree-pinned-link-fg` | Pinned link color | `#0b63ce` |
| `--tree-pinned-link-hover-fg` | Pinned link hover color | `#064ea3` |
| `--tree-pinned-link-decoration` | Pinned link underline color | `rgba(11,99,206,0.35)` |
| `--tree-pinned-link-hover-decoration` | Pinned link hover underline | `rgba(6,78,163,0.55)` |
| `--tree-highlight-bg` | Match highlight background | `#fff3a0` |
| `--tree-highlight-color` | Match highlight text color | `currentColor` |
| `--tree-highlight-radius` | Match highlight radius | `2px` |
| `--tree-highlight-padding-inline` | Match highlight horizontal padding | `1px` |

## Recipes

### Dense tree

```css
tree-explorer.dense {
  --tree-row-height: 30px;
  --tree-row-padding-x: 6px;
  --tree-row-padding-y: 2px;
  --tree-row-gap: 6px;
  --tree-font-size: 12px;
}
```

### Accessible focus/contrast

```css
tree-explorer.accessible {
  --tree-focus-ring: 3px solid #1d4ed8;
  --tree-focus-bg: #dbeafe;
  --tree-hover-bg: #e2e8f0;
  --tree-pinned-link-fg: #1d4ed8;
  --tree-pinned-link-hover-fg: #1e40af;
}
```

## Gotchas

- Angular view encapsulation does not block CSS variable inheritance; set vars on the `tree-explorer` host or a parent container.
- Keep indentation, virtualization sizing, and structural layout in config/engine paths; use CSS vars for visual styling only.
- If a new UI element is added, define its token(s) before introducing hardcoded visual styles.
