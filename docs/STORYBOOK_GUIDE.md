# Storybook Guide

## Objective
Use Storybook as the architecture compliance and behavior verification surface for Angular Tree Explorer.

Reference baseline: `docs/diagrams_angular.md` and `docs/ARCHITECTURE_OVERVIEW.md`.

## Setup
- Framework: `@storybook/angular`.
- Story location: `testing/stories/tree-explorer`.
- Shared fixtures: `testing/mocks`.
- Story rule: stories pass only `adapter` + `config` + host-level callbacks.

## Story Structure
- `Tree/Scale/10k`
- `Tree/Scale/100k`
- `Tree/Scale/500k`
- `Tree/Interactions/Selection`
- `Tree/Interactions/Filtering`
- `Tree/Interactions/ExpandCollapse`
- `Tree/Interactions/KeyboardNav`
- `Tree/Interactions/ContextMenu`
- `Tree/Race/PageAwareInvalidation`

## Required Stories

### Scale stories
- 10k: baseline behavior and controls sanity.
- 100k: stress-check virtualization and loading.
- 500k: hard gate story for scroll smoothness and memory.

### Controls and toggles
- Virtualization enabled/disabled.
- Page-aware enabled/disabled.
- Selection mode (`none`, `single`, `multi`).
- Context menu enabled/disabled.
- Pinned enabled/disabled.
- Overscan, row height, page size.

### Interaction stories
- Expand/collapse with paged children.
- Selection mode transitions and range selection.
- Filtering with adapter-owned semantics.
- Keyboard traversal and `aria-activedescendant` updates.
- Context menu open/action/close ownership in host.

## Architecture Enforcement in Stories
- Stories do not import engine internals directly.
- Stories do not patch component private state.
- Stories do not embed domain logic in templates.
- Stories exercise real adapter contract behavior through mocks.

## Example Story Pattern
```ts
export const Scale500k: Story = {
  args: {
    adapter: createSyntheticAdapter(500_000, 200),
    config: createDefaultConfig({
      virtualization: { enabled: true, itemSize: 32, overscan: 20 },
      pageAware: { enabled: true, defaultPageSize: 200 },
      selection: { mode: 'multi' },
      contextMenu: { enabled: true },
      pinned: { enabled: true },
    }),
  },
};
```

## Visual Regression Strategy (Outline)
- Capture baseline snapshots for each required story.
- Capture two viewport sizes: desktop and mobile.
- Include state snapshots for expanded, filtered, selected, and error states.
- Run visual diff on PRs touching rendering, CSS, or row template logic.

## Interaction Test Strategy in Storybook
- Use `play` functions to drive keyboard and click sequences.
- Validate output events (`selectionChange`, `loadError`) and DOM state.
- Validate page-aware range requests using mock adapter spies.

## Definition of Done Checklist
- [ ] All required stories exist and render cleanly.
- [ ] 10k/100k/500k stories run without architecture violations.
- [ ] Controls expose all config-driven toggles.
- [ ] Interaction stories cover selection, filtering, expand/collapse, keyboard nav, context menu.
- [ ] Visual baseline snapshots created and checked in.
- [ ] Storybook CI build passes.

## Success Checkpoints
- 500k story stays under DOM ceiling gate during scripted scroll interactions.
- All interaction `play` tests pass with deterministic mock adapters.
- Architecture lint rule reports 0 violations for direct engine internals usage in stories.
