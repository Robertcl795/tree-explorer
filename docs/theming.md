# Theming

> Don’t paste this into your app. Read it, adapt it, and decide what you’re actually building.

## 1) Getting started

1. Apply `--tree-*` variables on `tree-explorer` host (or parent scope).
2. Keep structural behavior in config/engine, not CSS overrides.
3. Validate in Storybook after token changes.

```css
tree-explorer.app-theme {
  --tree-bg: #ffffff;
  --tree-fg: #111827;
  --tree-border: #d1d5db;
  --tree-focus-ring: 2px solid #2563eb;
  --tree-row-height: 36px;
}
```

## 2) Purpose

- Expose visual customization as stable CSS-variable contract.
- Keep runtime logic unchanged under theme changes.
- Preserve virtualization behavior while allowing design-system alignment.

## 3) Feature overview

```mermaid
flowchart LR
  DS[Design System Tokens] --> MAP[App token mapping]
  MAP --> VARS[--tree-* CSS variables]
  VARS --> NG[@tree-explorer]
  VARS --> LIT[@lit-tree-explorer]
```

Behavior rules:

- Use `--tree-*` as public theme API.
- Keep hard layout geometry decisions in config (`itemSize`, indentation) and engine behavior.
- Keep highlights and pinned states tokenized through the documented `--tree-*` contract.

## 4) API overview

| Field | Type | Default | Meaning | Notes |
|---|---|---|---|---|
| `--tree-row-height` | CSS length | `36px` | Row height token | Must match virtualization assumptions in UI usage |
| `--tree-bg` | CSS color | `#ffffff` | Main background | |
| `--tree-fg` | CSS color | `rgba(0,0,0,0.87)` | Primary text color | |
| `--tree-border` | CSS color | `#e0e0e0` | Borders/dividers | |
| `--tree-hover-bg` | CSS color | `#f5f5f5` | Hover state background | |
| `--tree-focus-ring` | CSS outline | `2px solid #0b63ce` | Focus indicator | Accessibility-critical |
| `--tree-error-fg` | CSS color | `#b00020` | Error text color | |
| `--tree-pinned-bg` | CSS background | gradient | Pinned surface styling | |
| `--tree-pinned-link-fg` | CSS color | `#0b63ce` | Pinned link color | |
| `--tree-highlight-bg` | CSS color | `#fff3a0` | Match highlight background | |

## 5) Edge cases & failure modes

- Global overrides that also target Storybook wrappers:
  - can make examples look correct while app integration remains wrong.
- Mismatch between visual row height and virtualization config:
  - can produce clipped or overlapping rows.
- Overriding structural classes instead of tokens:
  - breaks upgrade safety.

## 6) Recipes

- Design-system mapping:
  - map `--tree-*` to DS tokens (`--ds-*`) at app shell level.
- High-contrast mode:
  - raise focus contrast and hover contrast via token overrides only.
- Dense mode:
  - reduce row/padding/font tokens together, not piecemeal.
- Storybook references:
  - `packages/tree-explorer/src/stories/tree-explorer.advanced.stories.ts`
  - `packages/tree-explorer/src/stories/tree-explorer.pinned-cookbook.stories.ts`
  - `packages/tree-explorer/src/stories/tree-explorer.errors-edge-cases.stories.ts`

## 7) Non-goals / pitfalls

- Do not hardcode per-feature color values in component styles when a token exists.
- Do not change DOM structure to theme things.
- Do not use theme overrides to encode domain behavior rules.
