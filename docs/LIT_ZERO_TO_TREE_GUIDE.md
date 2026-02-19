# Lit Zero-to-Tree Guide

## Objective
Build Tree Explorer directly in Lit from scratch while preserving core architecture and invariants.

Reference baseline: `docs/diagrams_angular.md` and `docs/ARCHITECTURE_OVERVIEW.md`.

## Fixed Architecture
- `@tree-core` is framework-agnostic and owns all state transitions.
- Lit host owns intent wiring, command execution, and rendering.
- Adapter owns all domain semantics.
- Async is command-based with `epoch` + `requestId` stale protection.

## Build Sequence

### Step 1: Workspace and packages
- Create `packages/tree-core` and `packages/lit-tree-explorer`.
- Configure ESM build outputs and strict TS settings.

### Step 2: Core contracts
- Define `TreeAdapter`, `TreeConfig`, `FilterQuery`, `TreeLoadError`.
- Define discriminated unions for events, commands, and completion events.

### Step 3: Engine core
- Implement pure `dispatch(event)` reducer returning commands.
- Implement normalized state with ID-keyed records.
- Implement selectors `totalCount`, `rowAt(index)`, `selectedIds`, `activeId`.

### Step 4: Paging and projection
- Implement page-aware required-page derivation from viewport range.
- Implement `inFlight` and `loadedPages` dedupe registries.
- Ensure stale completion rejection via `epoch` checks.

### Step 5: Lit host component
- Create `<tree-explorer>` element.
- Translate DOM intents to engine events.
- Execute commands via queue/runner and dispatch completions.
- Render virtual window using fixed row height and spacers.

### Step 6: Interaction and A11y
- Add expand, selection, filtering, pinned, context menu support.
- Add keyboard navigation and ARIA tree semantics.

### Step 7: Test and perf gates
- Add Vitest unit tests for engine modules.
- Add web component integration tests.
- Validate 500k synthetic performance gates.

## Lit Host Pattern
```ts
private onScroll(e: Event): void {
  const target = e.currentTarget as HTMLElement;
  const start = Math.floor(target.scrollTop / this.rowHeight) - this.overscan;
  const visible = Math.ceil(target.clientHeight / this.rowHeight);
  const end = start + visible + this.overscan * 2;
  this.dispatchIntent({
    type: 'ViewportChanged',
    start: Math.max(0, start),
    end,
    overscan: this.overscan,
  });
}
```

## Mandatory Invariants
- No `visibleRows[]` cache.
- No node mutation outside reducer.
- No adapter logic in templates.
- No stale command completion merge.

## Lit-specific Checklist
- [ ] `disconnectedCallback` cancels runner work.
- [ ] `requestAnimationFrame` batching prevents render thrash.
- [ ] `CustomEvent` output contract documented.
- [ ] Storybook web-components stories cover 10k/100k/500k cases.
- [ ] Keyboard traversal works with virtualized window.

## Success Checkpoints
- `dispatch()` determinism passes event replay tests at 100% consistency.
- Virtualized DOM count remains under the same ceiling gate used by Angular host.
- Page-aware range-loading integration tests pass under rapid scroll + filter invalidation races.
