# Angular Host Guide

This guide is host-only. Build order and phase planning live in [`docs/IMPLEMENTATION_GUIDE.md`](./IMPLEMENTATION_GUIDE.md).

## 1) Host Responsibilities

`TreeExplorerComponent` is the single Angular entry point and owns:
- DOM intent translation to engine events.
- Command runner execution for adapter/DOM side effects.
- Virtual window rendering from snapshot selectors.
- Keyboard/a11y wiring for tree semantics.
- Context menu DOM ownership.

`TreeItemComponent` (or equivalent row component) is presentational-only:
- Receives row descriptor input.
- Emits UI intents upward.
- Performs no adapter calls and no engine mutation.

## 2) Fixed Data Flow

`UI intents -> TreeExplorerComponent -> TreeEngine -> derived outputs -> rendering`

- Scroll/click/keydown/contextmenu events are mapped to `EngineEvent`.
- `TreeEngine.dispatch(event)` returns commands and updated snapshot.
- Host executes commands and dispatches completion events.
- Rendering consumes `totalCount`, `rowAt(index)`, and `rowKeyAt(index)`.

## 3) Command Runner Contract

- Command execution is explicit and bounded.
- Adapter calls include request metadata used for stale protection.
- Completion events are dispatched back into `TreeEngine`.
- Stale responses are ignored by `epoch` + `requestId` checks.

Canonical parent-aware paging command shape:
- `{ parentId: TreeId | null, pageIndex: number, pageSize: number, epoch: number, requestId: string }`

## 4) Virtual Window Rendering Contract

- Fixed row height (`config.virtualization.itemSize`) is required.
- Viewport metrics produce index range + overscan.
- Host dispatches viewport-range event to engine.
- Template renders only the requested index window via `rowAt(index)`.
- Spacer heights derive from `totalCount` and fixed `itemSize`.
- Row identity uses stable keys from adapter IDs.

## 5) Accessibility and Keyboard

- Use semantic tree roles and ARIA attributes.
- Route keyboard events through intent dispatch, not direct state mutation.
- Keep focus model stable under virtualized rendering.
- Support keyboard context-menu invocation in host-owned menu flow.

## 6) Forbidden in Angular Host

- Domain/API semantics in components.
- Direct node mutation bypassing engine events.
- Parallel materialized visible-row cache arrays.
- Alternate orchestration path outside engine commands/events.
- Context menu DOM ownership outside `TreeExplorerComponent`.

## 7) Minimal Compliance Checklist

- [ ] `TreeExplorerComponent` is the only Angular entry point.
- [ ] Adapter calls occur only in command runner execution.
- [ ] Rendering uses `totalCount` + `rowAt(index)`.
- [ ] Parent-aware paging model is used (`parentId|null + pageIndex + pageSize`).
- [ ] Stale responses are ignored by `epoch` + `requestId`.
- [ ] Context menu DOM is host-owned.
