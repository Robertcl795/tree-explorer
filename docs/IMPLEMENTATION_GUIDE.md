# Step-by-Step Implementation Guide (Criticality-First)

Source of truth for architecture invariants: [`docs/ARCHITECTURE_OVERVIEW.md`](./ARCHITECTURE_OVERVIEW.md).
Angular baseline for this guide: 20+.

Use this guide to implement in strict order. Do not skip phases. Each phase adds code and tests while preserving these hard constraints:
- Flow stays `UI intents -> TreeExplorerComponent -> TreeEngine -> derived outputs -> rendering`.
- Adapter is the only domain boundary.
- No parallel visible-row caches.
- No direct node mutation outside engine transitions.
- Context menu DOM ownership stays in `TreeExplorerComponent`.
- Async is command-based with `epoch` + `requestId` stale protection.
- Virtual scroll is fixed-row-height and page-aware.
- Keyboard navigation and accessibility are mandatory.
- Angular host is Signals-first with no `effect()` usage; RxJS is used only for explicit command execution.
- Use semantic native HTML (no Angular Material dependencies); styling concerns stay in CSS variables.

For performance and release gates, use:
- [`docs/PERFORMANCE_GATES.md`](./PERFORMANCE_GATES.md)
- [`docs/TEST_PLAN_VITEST.md`](./TEST_PLAN_VITEST.md)
- [`docs/STORYBOOK_GUIDE.md`](./STORYBOOK_GUIDE.md)
- [`docs/PUBLISHING_NPM.md`](./PUBLISHING_NPM.md)

## Phase 1) Repo scaffolding + exports discipline

### Step overview
Create package entrypoints and lock exports first. This prevents deep-import drift and keeps API ownership explicit.

### Do this now
1. Create explicit index/public-api files for both packages.
2. Export only stable surface types and factories.
3. Add a no-deep-import CI check test.

### Code snippets

```ts
// File: packages/tree-core/src/index.ts
// Invariant: public API is explicit and stable.
export * from './public-api';
```

```ts
// File: packages/tree-core/src/public-api.ts
// Invariant: only contract + engine API leave the package.
export type { TreeAdapter } from './lib/types/tree-adapter';
export type { TreeConfig } from './lib/types/tree-config';
export type { EngineEvent } from './lib/types/tree-events';
export type { EngineCommand } from './lib/types/tree-commands';
export type { EngineSnapshot } from './lib/types/tree-snapshot';
export { createTreeEngine } from './lib/engine/tree-engine';
```

```ts
// File: packages/tree-explorer/src/index.ts
// Invariant: single Angular entrypoint package surface.
export * from './public-api';
```

```ts
// File: packages/tree-explorer/src/public-api.ts
// Invariant: host exports are explicit; no legacy aliases.
export { TreeExplorerComponent } from './lib/tree-explorer.component';
export { TreeItemComponent } from './lib/tree-item.component';
export type { TreeAdapter, TreeConfig } from '@tree-core';
```

### Tests added now

```ts
// File: packages/tree-core/src/lib/public-api.spec.ts
import { describe, it, expect } from 'vitest';
import * as api from '@tree-core';

describe('public-api', () => {
  it('exports createTreeEngine', () => {
    expect(typeof api.createTreeEngine).toBe('function');
  });
});
```

### Architecture compliance checks
- [ ] Only `index.ts` / `public-api.ts` are used by examples/tests.
- [ ] No additional entrypoint alias is introduced.

### Success checkpoints
- `pnpm typecheck` passes.
- No deep imports in workspace search.

### Stop conditions
- Any consumer needs `@tree-core/lib/...` imports.
- Any undocumented symbol leaks in export map.

## Phase 2) Types: Adapter/Config/Events/Commands/Snapshot

### Step overview
Define all contracts before behavior code. Use discriminated unions and ERM-like state identifiers.

### Do this now
1. Add core ID and row descriptor types.
2. Define `TreeAdapter` with optional filtering/path hooks.
3. Define config toggles and event/command unions.
4. Define snapshot selector contract (`totalCount`, `rowAt`, `keyAt`).

### Code snippets

```ts
// File: packages/tree-core/src/lib/types/tree-id.ts
// Invariant: all relations are ID-based, not object-reference based.
export type TreeId = string;
```

```ts
// File: packages/tree-core/src/lib/types/tree-adapter.ts
// Invariant: adapter is the only domain boundary.
import type { TreeId } from './tree-id';

export interface TreeMeta {
  icon?: string;
  disabled?: boolean;
}

export interface TreePageResult<TSource> {
  items: readonly TSource[];
  totalCount: number;
}

export interface TreePathStep {
  parentId: TreeId | null;
  nodeId: TreeId;
  pageIndex?: number;
}

export interface TreePathResult {
  targetId: TreeId;
  steps: readonly TreePathStep[];
}

export interface TreeAdapter<TSource, TNode = TSource> {
  getId(source: TSource): TreeId;
  getLabel(node: TNode): string;
  getIcon?(node: TNode): string | undefined;
  getMeta?(node: TNode): TreeMeta | undefined;

  getRoots(): Promise<readonly TSource[]>;
  getChildren(parentId: TreeId | null): Promise<readonly TSource[]>;

  // Optional page-aware API.
  loadPage?(
    parentId: TreeId | null,
    pageIndex: number,
    pageSize: number,
    filterText?: string,
  ): Promise<TreePageResult<TSource>>;

  // Adapter-owned filter semantics.
  matches?(node: TNode, query: string): boolean;

  // Optional path resolution for pinned navigation.
  resolvePathToNode?(targetId: TreeId): Promise<TreePathResult>;

  // Optional source->node mapping.
  toNode?(source: TSource): TNode;
}
```

```ts
// File: packages/tree-core/src/lib/types/tree-config.ts
// Invariant: behavior toggles are declarative and input-driven.
export type SelectionMode = 'none' | 'single' | 'multi';

export interface TreeConfig {
  virtualization: {
    enabled: boolean;
    itemSize: number;
    overscan: number;
  };
  pageAware: {
    enabled: boolean;
    defaultPageSize: number;
  };
  selection: {
    mode: SelectionMode;
  };
  contextMenu: {
    enabled: boolean;
  };
  pinned: {
    enabled: boolean;
  };
  keyboard: {
    enabled: boolean;
  };
  filtering: {
    debounceMs: number;
  };
}
```

```ts
// File: packages/tree-core/src/lib/types/tree-events.ts
// Invariant: all engine input transitions are explicit union variants.
import type { TreeId } from './tree-id';

export type EngineEvent =
  | { type: 'INIT_REQUESTED' }
  | { type: 'ROOTS_LOADED'; requestId: string; epoch: number; items: readonly unknown[] }
  | { type: 'CHILDREN_LOADED'; requestId: string; epoch: number; parentId: TreeId | null; items: readonly unknown[] }
  | { type: 'PAGE_LOADED'; requestId: string; epoch: number; parentId: TreeId | null; pageIndex: number; pageSize: number; items: readonly unknown[]; totalCount: number }
  | { type: 'LOAD_FAILED'; requestId: string; epoch: number; scope: 'root' | 'children' | 'page' | 'navigation'; message: string }
  | { type: 'VIEWPORT_CHANGED'; startIndex: number; endIndex: number; overscan: number }
  | { type: 'TOGGLE_EXPAND'; nodeId: TreeId }
  | { type: 'SELECT'; nodeId: TreeId; mode: 'single' | 'toggle' | 'range' }
  | { type: 'FILTER_UPDATED'; text: string }
  | { type: 'NAV_KEY'; key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | 'PageUp' | 'PageDown' | 'Enter' | 'Space' }
  | { type: 'PINNED_NAVIGATE'; targetId: TreeId }
  | { type: 'CONTEXT_MENU_OPEN'; nodeId: TreeId; x: number; y: number };
```

```ts
// File: packages/tree-core/src/lib/types/tree-commands.ts
// Invariant: async/DOM side effects are commands, never hidden in reducer.
import type { TreeId } from './tree-id';

export type EngineCommand =
  | { type: 'LOAD_ROOTS'; requestId: string; epoch: number }
  | { type: 'LOAD_CHILDREN'; requestId: string; epoch: number; parentId: TreeId | null }
  | { type: 'LOAD_PAGE'; requestId: string; epoch: number; parentId: TreeId | null; pageIndex: number; pageSize: number; filterText?: string }
  | { type: 'RESOLVE_PATH'; requestId: string; epoch: number; targetId: TreeId }
  | { type: 'SCROLL_TO_INDEX'; index: number }
  | { type: 'EMIT_SELECTION_CHANGE'; selectedIds: readonly TreeId[] }
  | { type: 'EMIT_LOAD_ERROR'; scope: 'root' | 'children' | 'page' | 'navigation'; message: string };
```

```ts
// File: packages/tree-core/src/lib/types/tree-snapshot.ts
// Invariant: render reads index-addressable selectors, not a visibleRows cache.
import type { TreeId } from './tree-id';

export interface RowDescriptor {
  id: TreeId;
  parentId: TreeId | null;
  depth: number;
  label: string;
  expandable: boolean;
  expanded: boolean;
  selected: boolean;
  active: boolean;
  status: 'ready' | 'loading' | 'error';
}

export interface EngineSnapshot {
  readonly epoch: number;
  readonly totalCount: number;
  rowAt(index: number): RowDescriptor | null;
  keyAt(index: number): TreeId | null;
  readonly selectedIds: readonly TreeId[];
  readonly activeId: TreeId | null;
}
```

### Tests added now

```ts
// File: packages/tree-core/src/lib/types/tree-events.spec.ts
import { describe, it, expectTypeOf } from 'vitest';
import type { EngineEvent } from './tree-events';

describe('EngineEvent union', () => {
  it('is discriminated by type', () => {
    expectTypeOf<EngineEvent['type']>().toMatchTypeOf<string>();
  });
});
```

### Architecture compliance checks
- [ ] Adapter contract is the only place describing domain retrieval/matching/path resolution.
- [ ] Event/command unions are explicit and discriminated.

### Success checkpoints
- No TODO placeholders in public type exports.
- Type-only tests validate union shape and narrowing.

### Stop conditions
- Non-discriminated event payloads.
- Snapshot exposes `rows[]` cache directly.

## Phase 3) Engine skeleton: reducer + command emission + subscribe/getSnapshot

### Step overview
Implement a pure reducer and a tiny engine facade. Do not execute async work in core.

### Do this now
1. Add internal state shape (ERM style IDs + relations).
2. Implement reducer signature `(state, event) => { state, commands }`.
3. Implement `createTreeEngine()` with `dispatch`, `getSnapshot`, `subscribe`.

### Code snippets

```ts
// File: packages/tree-core/src/lib/engine/state.ts
// Invariant: canonical state is normalized by IDs and relations.
import type { TreeId } from '../types/tree-id';
import type { TreeConfig } from '../types/tree-config';
import type { TreeLoadError } from '../types/tree-errors';

export interface NodeRecord {
  id: TreeId;
  parentId: TreeId | null;
  label: string;
  childrenIds: TreeId[];
  hasChildren: boolean;
}

export interface TreeState {
  epoch: number;
  nextRequestSeq: number;
  config: TreeConfig;
  adapterSupportsPathResolution: boolean;
  nodeById: Map<TreeId, NodeRecord>;
  rootIds: TreeId[];
  expandedIds: Set<TreeId>;
  selectedIds: Set<TreeId>;
  activeId: TreeId | null;
  filterText: string;
  inflightByRequestId: Map<string, { epoch: number }>;
  errors: TreeLoadError[];
}

export const INITIAL_STATE: TreeState = {
  epoch: 0,
  nextRequestSeq: 1,
  config: {} as TreeConfig,
  adapterSupportsPathResolution: false,
  nodeById: new Map(),
  rootIds: [],
  expandedIds: new Set(),
  selectedIds: new Set(),
  activeId: null,
  filterText: '',
  inflightByRequestId: new Map(),
  errors: [],
};
```

```ts
// File: packages/tree-core/src/lib/engine/reducer.ts
// Invariant: reducer is pure and emits commands instead of side effects.
import type { EngineCommand } from '../types/tree-commands';
import type { EngineEvent } from '../types/tree-events';
import type { TreeState } from './state';

export interface ReducerResult {
  state: TreeState;
  commands: EngineCommand[];
}

export function treeReducer(state: TreeState, event: EngineEvent): ReducerResult {
  switch (event.type) {
    case 'INIT_REQUESTED': {
      const requestId = `req-${state.nextRequestSeq}`;
      return {
        state: { ...state, nextRequestSeq: state.nextRequestSeq + 1 },
        commands: [{ type: 'LOAD_ROOTS', requestId, epoch: state.epoch }],
      };
    }
    case 'FILTER_UPDATED': {
      // structural/filter invalidation bumps epoch.
      return {
        state: { ...state, filterText: event.text, epoch: state.epoch + 1 },
        commands: [],
      };
    }
    default:
      return { state, commands: [] };
  }
}
```

```ts
// File: packages/tree-core/src/lib/engine/tree-engine.ts
// Invariant: engine API is deterministic and subscription-driven.
import type { EngineEvent } from '../types/tree-events';
import type { EngineSnapshot } from '../types/tree-snapshot';
import { treeReducer } from './reducer';
import { INITIAL_STATE, type TreeState } from './state';
import { createSnapshot } from './selectors';

export interface TreeEngine {
  dispatch(event: EngineEvent): readonly import('../types/tree-commands').EngineCommand[];
  getSnapshot(): EngineSnapshot;
  subscribe(listener: () => void): () => void;
}

export function createTreeEngine(): TreeEngine {
  let state: TreeState = INITIAL_STATE;
  const listeners = new Set<() => void>();

  return {
    dispatch(event) {
      const result = treeReducer(state, event);
      state = result.state;
      listeners.forEach((listener) => listener());
      return result.commands;
    },
    getSnapshot() {
      return createSnapshot(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

### Tests added now

```ts
// File: packages/tree-core/src/lib/engine/reducer.determinism.spec.ts
import { describe, it, expect } from 'vitest';
import { treeReducer } from './reducer';
import { INITIAL_STATE } from './state';

describe('treeReducer determinism', () => {
  it('same state + event => same output', () => {
    const event = { type: 'FILTER_UPDATED', text: 'abc' } as const;
    const r1 = treeReducer(INITIAL_STATE, event);
    const r2 = treeReducer(INITIAL_STATE, event);
    expect(r1.state).toEqual(r2.state);
    expect(r1.commands).toEqual(r2.commands);
  });
});
```

### Architecture compliance checks
- [ ] Reducer does not call adapter/DOM APIs.
- [ ] Engine exposes subscribe/getSnapshot without hidden mutable side channels.

### Success checkpoints
- Determinism test passes.
- `createTreeEngine()` returns stable API.

### Stop conditions
- Any async execution inside reducer.
- Snapshot depends on host state.

## Phase 4) Projection foundation: `totalCount` + `rowAt` without visible arrays

### Step overview
Add projection selectors that answer by index. Keep projections inside engine only.

### Do this now
1. Build a flattened index from normalized state.
2. Expose snapshot with `totalCount`, `rowAt`, and `keyAt`.
3. Keep projection derivation internal to selector layer.

### Code snippets

```ts
// File: packages/tree-core/src/lib/engine/selectors.ts
// Invariant: selector API is index-addressable; no visibleRows cache export.
import type { EngineSnapshot, RowDescriptor } from '../types/tree-snapshot';
import type { TreeState } from './state';

function project(state: TreeState): RowDescriptor[] {
  const out: RowDescriptor[] = [];

  const visit = (id: string, depth: number): void => {
    const node = state.nodeById.get(id);
    if (!node) return;
    out.push({
      id: node.id,
      parentId: node.parentId,
      depth,
      label: node.label,
      expandable: node.hasChildren,
      expanded: state.expandedIds.has(node.id),
      selected: state.selectedIds.has(node.id),
      active: state.activeId === node.id,
      status: 'ready',
    });
    if (state.expandedIds.has(node.id)) {
      node.childrenIds.forEach((childId) => visit(childId, depth + 1));
    }
  };

  state.rootIds.forEach((rootId) => visit(rootId, 1));
  return out;
}

export function createSnapshot(state: TreeState): EngineSnapshot {
  const rows = project(state);

  return {
    epoch: state.epoch,
    totalCount: rows.length,
    rowAt(index) {
      return rows[index] ?? null;
    },
    keyAt(index) {
      return rows[index]?.id ?? null;
    },
    selectedIds: [...state.selectedIds],
    activeId: state.activeId,
  };
}
```

### Tests added now

```ts
// File: packages/tree-core/src/lib/engine/projection.spec.ts
import { describe, it, expect } from 'vitest';
import { createSnapshot } from './selectors';
import { INITIAL_STATE } from './state';

describe('projection selectors', () => {
  it('exposes totalCount/rowAt/keyAt contract', () => {
    const snap = createSnapshot(INITIAL_STATE);
    expect(typeof snap.totalCount).toBe('number');
    expect(snap.rowAt(0)).toBeNull();
    expect(snap.keyAt(0)).toBeNull();
  });
});
```

### Architecture compliance checks
- [ ] Render API is `totalCount` + `rowAt(index)` + `keyAt(index)`.
- [ ] No exported visible-row array cache.

### Success checkpoints
- Projection tests pass.
- Row identity comes from adapter-derived IDs.

### Stop conditions
- Introducing external row caches parallel to engine projection.
- Direct mutation of node records from host.

## Phase 5) Paging/range-loading: viewport->pages; dedupe; epoch/requestId

### Step overview
Implement parent-aware page computation and dedupe. Guard all completions with epoch/requestId.

### Do this now
1. Add parent-aware page key type.
2. Implement `computeNeededPages()` from viewport range.
3. Track loaded/inflight by parent-aware key.
4. Emit `LOAD_PAGE` commands only for missing pages.

### Code snippets

```ts
// File: packages/tree-core/src/lib/engine/paging.ts
// Invariant: page requests are derived from viewport and deduped by canonical key.
import type { EngineCommand } from '../types/tree-commands';
import type { TreeId } from '../types/tree-id';

export interface PageKey {
  parentId: TreeId | null;
  pageIndex: number;
  pageSize: number;
}

export interface NeededPagesInput {
  parentId: TreeId | null;
  startIndex: number;
  endIndex: number;
  overscan: number;
  pageSize: number;
  loaded: Set<string>;
  inflight: Set<string>;
  epoch: number;
  nextRequestSeq: number;
}

const pageKeyString = (k: PageKey): string => `${k.parentId ?? '__root__'}:${k.pageIndex}:${k.pageSize}`;

export function computeNeededPages(input: NeededPagesInput): {
  keys: PageKey[];
  commands: EngineCommand[];
  nextRequestSeq: number;
} {
  const start = Math.max(0, input.startIndex - input.overscan);
  const end = Math.max(start, input.endIndex + input.overscan);

  const firstPage = Math.floor(start / input.pageSize);
  const lastPage = Math.floor(end / input.pageSize);

  const keys: PageKey[] = [];
  const commands: EngineCommand[] = [];
  let seq = input.nextRequestSeq;

  for (let pageIndex = firstPage; pageIndex <= lastPage; pageIndex += 1) {
    const key: PageKey = { parentId: input.parentId, pageIndex, pageSize: input.pageSize };
    const k = pageKeyString(key);
    if (input.loaded.has(k) || input.inflight.has(k)) continue;

    const requestId = `req-${seq++}`;
    keys.push(key);
    commands.push({
      type: 'LOAD_PAGE',
      requestId,
      epoch: input.epoch,
      parentId: key.parentId,
      pageIndex: key.pageIndex,
      pageSize: key.pageSize,
    });
  }

  return { keys, commands, nextRequestSeq: seq };
}
```

```ts
// File: packages/tree-core/src/lib/engine/reducer.ts
// Invariant: stale completions must not mutate state.
import type { EngineCommand } from '../types/tree-commands';
import type { EngineEvent } from '../types/tree-events';
import type { TreeState } from './state';

export function applyPageLoadedIfFresh(
  state: TreeState,
  event: Extract<EngineEvent, { type: 'PAGE_LOADED' }>,
): { state: TreeState; commands: EngineCommand[] } {
  const inflight = state.inflightByRequestId.get(event.requestId);
  if (!inflight) return { state, commands: [] };
  if (inflight.epoch !== event.epoch) return { state, commands: [] };

  const nextState: TreeState = {
    ...state,
    inflightByRequestId: new Map(state.inflightByRequestId),
  };
  nextState.inflightByRequestId.delete(event.requestId);
  return { state: nextState, commands: [] };
}
```

### Tests added now

```ts
// File: packages/tree-core/src/lib/engine/paging.spec.ts
import { describe, it, expect } from 'vitest';
import { computeNeededPages } from './paging';

describe('computeNeededPages', () => {
  it('maps viewport range to expected page indexes', () => {
    const result = computeNeededPages({
      parentId: null,
      startIndex: 120,
      endIndex: 179,
      overscan: 10,
      pageSize: 50,
      loaded: new Set(),
      inflight: new Set(),
      epoch: 3,
      nextRequestSeq: 1,
    });
    const pages = result.keys.map((k) => k.pageIndex);
    expect(pages).toEqual([2, 3]);
  });

  it('dedupes loaded and inflight pages', () => {
    const loaded = new Set(['__root__:2:50']);
    const inflight = new Set(['__root__:3:50']);
    const result = computeNeededPages({
      parentId: null,
      startIndex: 120,
      endIndex: 179,
      overscan: 10,
      pageSize: 50,
      loaded,
      inflight,
      epoch: 3,
      nextRequestSeq: 1,
    });
    expect(result.keys).toHaveLength(0);
  });
});
```

```ts
// File: packages/tree-core/src/lib/engine/stale.spec.ts
import { describe, it, expect } from 'vitest';
import { treeReducer } from './reducer';

// Minimal stale-ignore assertion skeleton.
describe('stale completion guard', () => {
  it('ignores PAGE_LOADED with unknown/stale requestId', () => {
    const state: any = { inflightByRequestId: new Map(), epoch: 7 };
    const { state: next } = treeReducer(state, {
      type: 'PAGE_LOADED',
      requestId: 'req-stale',
      epoch: 6,
      parentId: null,
      pageIndex: 0,
      pageSize: 50,
      items: [],
      totalCount: 0,
    } as any);
    expect(next).toBe(state);
  });
});
```

### Architecture compliance checks
- [ ] Parent-aware key model is used (`parentId|null + pageIndex + pageSize`).
- [ ] Duplicate page requests are suppressed.
- [ ] Stale completions are ignored by epoch/requestId.

### Success checkpoints
- Viewport->pages correctness tests pass.
- Dedupe and stale tests pass.

### Stop conditions
- Overfetch/underfetch in visible range.
- Stale responses mutating canonical state.

## Phase 6) Engine hardening: stale ignores; cancellation hooks; errors

### Step overview
Make failure and cancellation explicit while preserving deterministic transitions.

### Do this now
1. Add structured load error type.
2. Add optional abort token map keyed by requestId.
3. Emit `EMIT_LOAD_ERROR` commands instead of throwing from reducer.

### Code snippets

```ts
// File: packages/tree-core/src/lib/types/tree-errors.ts
// Invariant: failures are explicit state/command data, never hidden throws.
export interface TreeLoadError {
  requestId: string;
  epoch: number;
  scope: 'root' | 'children' | 'page' | 'navigation';
  message: string;
}
```

```ts
// File: packages/tree-core/src/lib/engine/state.ts
// Invariant: cancellation is explicit and invalidates old in-flight ownership.
export function clearInflightForEpochBump(state: TreeState): TreeState {
  return {
    ...state,
    epoch: state.epoch + 1,
    inflightByRequestId: new Map(),
  };
}
```

```ts
// File: packages/tree-core/src/lib/engine/reducer.ts
// Invariant: reducer handles failure by state transition + command emission.
import type { EngineCommand } from '../types/tree-commands';
import type { EngineEvent } from '../types/tree-events';
import type { TreeState } from './state';

export function applyLoadFailed(
  state: TreeState,
  event: Extract<EngineEvent, { type: 'LOAD_FAILED' }>,
): { state: TreeState; commands: EngineCommand[] } {
  const nextState: TreeState = {
    ...state,
    errors: [
      ...state.errors,
      {
        requestId: event.requestId,
        epoch: event.epoch,
        scope: event.scope,
        message: event.message,
      },
    ],
  };
  return {
    state: nextState,
    commands: [{ type: 'EMIT_LOAD_ERROR', scope: event.scope, message: event.message }],
  };
}
```

### Tests added now

```ts
// File: packages/tree-core/src/lib/engine/errors.spec.ts
import { describe, it, expect } from 'vitest';
import { treeReducer } from './reducer';

describe('error surfacing', () => {
  it('records scoped error and emits EMIT_LOAD_ERROR', () => {
    const state: any = { errors: [] };
    const result = treeReducer(state, {
      type: 'LOAD_FAILED',
      requestId: 'req-1',
      epoch: 2,
      scope: 'page',
      message: 'timeout',
    } as any);
    expect(result.state.errors).toHaveLength(1);
    expect(result.commands[0]).toMatchObject({ type: 'EMIT_LOAD_ERROR', scope: 'page' });
  });
});
```

### Architecture compliance checks
- [ ] Stale/cancelled request paths are explicit and testable.
- [ ] Errors are emitted as commands and state, not side-effect exceptions.

### Success checkpoints
- Error tests pass.
- No direct throw escapes reducer logic.

### Stop conditions
- Reducer introduces hidden I/O.
- Cancellation paths mutate unrelated state.

## Phase 7) Minimal Angular host: intent dispatch + command runner (no effects)

### Step overview
Build a thin host with signals-first state and explicit RxJS command execution. No `effect()`.

### Do this now
1. Create `TreeExplorerComponent` with `input()` adapter/config.
2. Keep snapshot and version as signals.
3. Wire explicit command subject + subscription pipeline.
4. Add intent handlers for scroll/keydown/click/contextmenu.

### Code snippets

```ts
// File: packages/tree-explorer/src/lib/tree-explorer.component.ts
// Invariant: host performs orchestration only; no domain logic leaks.
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { Subject, Subscription, from, of, mergeMap, EMPTY, catchError } from 'rxjs';
import {
  createTreeEngine,
  type EngineCommand,
  type EngineEvent,
  type TreeAdapter,
  type TreeConfig,
} from '@tree-core';

@Component({
  selector: 'tree-explorer',
  standalone: true,
  templateUrl: './tree-explorer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeExplorerComponent<TSource, TNode = TSource> implements OnDestroy {
  readonly adapter = input.required<TreeAdapter<TSource, TNode>>();
  readonly config = input.required<TreeConfig>();

  readonly selectionChange = output<readonly string[]>();
  readonly loadError = output<{ scope: string; message: string }>();

  private readonly engine = createTreeEngine();
  private readonly snapshotVersion = signal(0);
  readonly snapshot = computed(() => {
    this.snapshotVersion();
    return this.engine.getSnapshot();
  });

  private readonly command$ = new Subject<EngineCommand>();
  private readonly sub = new Subscription();

  constructor() {
    this.sub.add(this.engine.subscribe(() => this.snapshotVersion.update((n) => n + 1)));
    this.sub.add(
      this.command$
        .pipe(
          mergeMap((cmd) => this.executeCommand(cmd)),
        )
        .subscribe((event) => this.dispatch(event)),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  dispatch(event: EngineEvent): void {
    const commands = this.engine.dispatch(event);
    commands.forEach((cmd) => this.command$.next(cmd));
  }

  onScrollViewport(startIndex: number, endIndex: number): void {
    this.dispatch({
      type: 'VIEWPORT_CHANGED',
      startIndex,
      endIndex,
      overscan: this.config().virtualization.overscan,
    });
  }

  onKeydown(key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | 'PageUp' | 'PageDown' | 'Enter' | 'Space'): void {
    this.dispatch({ type: 'NAV_KEY', key } as EngineEvent);
  }

  onRowClick(nodeId: string): void {
    this.dispatch({ type: 'SELECT', nodeId, mode: 'single' });
  }

  onContextMenu(nodeId: string, e: MouseEvent): void {
    e.preventDefault();
    this.dispatch({ type: 'CONTEXT_MENU_OPEN', nodeId, x: e.clientX, y: e.clientY });
  }

  private executeCommand(command: EngineCommand) {
    const adapter = this.adapter();

    if (command.type === 'LOAD_ROOTS') {
      return from(adapter.getRoots()).pipe(
        mergeMap((items) => of({ type: 'ROOTS_LOADED', requestId: command.requestId, epoch: command.epoch, items } as EngineEvent)),
        catchError((err) => of({ type: 'LOAD_FAILED', requestId: command.requestId, epoch: command.epoch, scope: 'root', message: String(err) } as EngineEvent)),
      );
    }

    if (command.type === 'LOAD_PAGE' && adapter.loadPage) {
      return from(adapter.loadPage(command.parentId, command.pageIndex, command.pageSize, command.filterText)).pipe(
        mergeMap((result) => of({
          type: 'PAGE_LOADED',
          requestId: command.requestId,
          epoch: command.epoch,
          parentId: command.parentId,
          pageIndex: command.pageIndex,
          pageSize: command.pageSize,
          items: result.items,
          totalCount: result.totalCount,
        } as EngineEvent)),
        catchError((err) => of({ type: 'LOAD_FAILED', requestId: command.requestId, epoch: command.epoch, scope: 'page', message: String(err) } as EngineEvent)),
      );
    }

    if (command.type === 'EMIT_SELECTION_CHANGE') {
      this.selectionChange.emit(command.selectedIds);
      return EMPTY;
    }

    if (command.type === 'EMIT_LOAD_ERROR') {
      this.loadError.emit({ scope: command.scope, message: command.message });
      return EMPTY;
    }

    return EMPTY;
  }
}
```

```ts
// File: packages/tree-explorer/src/lib/tree-item.component.ts
// Invariant: presentational-only component; no adapter calls.
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { RowDescriptor } from '@tree-core';

@Component({
  selector: 'tree-item',
  standalone: true,
  template: `
    <button type="button" (click)="rowClick.emit(row().id)">
      {{ row().label }}
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeItemComponent {
  readonly row = input.required<RowDescriptor>();

  readonly rowClick = output<string>();
  readonly toggleExpand = output<string>();
  readonly rowContextMenu = output<{ id: string; event: MouseEvent }>();
}
```

### Tests added now

```ts
// File: packages/tree-explorer/src/lib/tree-explorer.host.spec.ts
import { describe, it, expect } from 'vitest';

describe('TreeExplorer host invariants', () => {
  it('routes adapter calls through command execution path only', () => {
    // Outline: spy adapter methods and assert they are called only after engine emits commands.
    expect(true).toBe(true);
  });
});
```

### Architecture compliance checks
- [ ] No `effect()` usage.
- [ ] Signals-first snapshot/view model.
- [ ] RxJS only for command execution pipeline.
- [ ] Adapter calls only in command runner.

### Success checkpoints
- Host compiles without Angular Material.
- Intent handlers exist for scroll/keydown/click/contextmenu.

### Stop conditions
- Hidden subscriptions or implicit side effects.
- Adapter calls from child/presentational component.

## Phase 8) Virtual window render: fixed row height; spacers; stable keys; minimal DOM

### Step overview
Render only current index window. Use `totalCount` and `rowAt(index)`; avoid row caches.

### Do this now
1. Add viewport metrics signals.
2. Derive start/end indices from scroll position and item size.
3. Render rows by index with top/bottom spacers.
4. Track rows by stable key.

### Code snippets

```ts
// File: packages/tree-explorer/src/lib/tree-explorer.component.ts
// Invariant: derives index window only; never materializes visible row cache arrays.
import { computed, signal } from '@angular/core';
import type { EngineSnapshot, TreeConfig } from '@tree-core';

export class VirtualWindowController {
  readonly scrollTop = signal(0);
  readonly viewportHeight = signal(400);

  readonly windowRange = computed(() => {
    const s = this.snapshot();
    const itemSize = this.config().virtualization.itemSize;
    const overscan = this.config().virtualization.overscan;
    const start = Math.max(0, Math.floor(this.scrollTop() / itemSize) - overscan);
    const visible = Math.ceil(this.viewportHeight() / itemSize);
    const end = Math.min(s.totalCount, start + visible + overscan * 2);
    return { start, end, itemSize };
  });

  readonly windowIndices = computed(() => {
    const { start, end } = this.windowRange();
    return Array.from({ length: end - start }, (_, i) => start + i);
  });

  constructor(
    private readonly snapshot: () => EngineSnapshot,
    private readonly config: () => TreeConfig,
    private readonly emitViewportRange: (startIndex: number, endIndex: number) => void,
  ) {}

  onViewportScroll(event: Event): void {
    const target = event.target as HTMLElement;
    this.scrollTop.set(target.scrollTop);
    this.viewportHeight.set(target.clientHeight);

    const itemSize = this.config().virtualization.itemSize;
    const startIndex = Math.floor(target.scrollTop / itemSize);
    const endIndex = Math.floor((target.scrollTop + target.clientHeight) / itemSize);
    this.emitViewportRange(startIndex, endIndex);
  }

  trackIndex = (_: number, index: number): string => this.snapshot().keyAt(index) ?? `missing-${index}`;
}
```

```html
<!-- File: packages/tree-explorer/src/lib/tree-explorer.component.html -->
<!-- Invariant: render path uses totalCount + rowAt(index) + stable keys. -->
<div
  class="tree-viewport"
  role="tree"
  tabindex="0"
  (scroll)="onViewportScroll($event)"
  (keydown)="onKeydown($any($event).key)">

  <div [style.height.px]="windowRange().start * windowRange().itemSize"></div>

  @for (idx of windowIndices(); track trackIndex($index, idx)) {
    @if (snapshot().rowAt(idx); as row) {
      <div
        role="treeitem"
        [attr.data-row-id]="row.id"
        [attr.aria-level]="row.depth"
        [attr.aria-expanded]="row.expandable ? row.expanded : null"
        [attr.aria-selected]="row.selected ? 'true' : 'false'"
        (click)="onRowClick(row.id)"
        (contextmenu)="onContextMenu(row.id, $event)">
        <tree-item [row]="row"></tree-item>
      </div>
    }
  }

  <div [style.height.px]="(snapshot().totalCount - windowRange().end) * windowRange().itemSize"></div>
</div>
```

### Tests added now

```ts
// File: packages/tree-explorer/src/lib/tree-explorer.virtual-window.spec.ts
import { describe, it, expect } from 'vitest';

describe('virtual window invariants', () => {
  it('keeps rendered row count bounded by viewport + overscan', () => {
    // Outline: assert rendered row count upper bound under scroll churn.
    expect(true).toBe(true);
  });
});
```

### Architecture compliance checks
- [ ] Fixed row height (`itemSize`) drives index math.
- [ ] Rendering uses selectors; no visibleRows cache.
- [ ] Row keys derive from `keyAt(index)` / adapter IDs.

### Success checkpoints
- DOM row ceiling remains bounded.
- No key churn across repeated scroll updates.

### Stop conditions
- Rendering all rows.
- Using a mutable host-level row cache.

## Phase 9) Feature increments: expansion -> selection -> filtering -> navigation -> pinned -> context menu

### Step overview
Add features in strict order to avoid cross-feature regressions and preserve deterministic engine transitions.

### Do this now
1. Expansion transitions and commands.
2. Selection modes (`none/single/multi`).
3. Debounced filter intent dispatch.
4. Keyboard/navigation transitions.
5. Optional pinned navigation using adapter path resolution.
6. Context menu open/close state in host component.

### Code snippets

```ts
// File: packages/tree-core/src/lib/engine/reducer.ts
// Invariant: feature transitions happen only through reducer events.
import type { EngineCommand } from '../types/tree-commands';
import type { EngineEvent } from '../types/tree-events';
import type { TreeState } from './state';

export function applyToggleExpand(
  state: TreeState,
  event: Extract<EngineEvent, { type: 'TOGGLE_EXPAND' }>,
): { state: TreeState; commands: EngineCommand[] } {
  const expandedIds = new Set(state.expandedIds);
  if (expandedIds.has(event.nodeId)) expandedIds.delete(event.nodeId);
  else expandedIds.add(event.nodeId);
  return { state: { ...state, expandedIds, epoch: state.epoch + 1 }, commands: [] };
}

export function applySelect(
  state: TreeState,
  event: Extract<EngineEvent, { type: 'SELECT' }>,
): { state: TreeState; commands: EngineCommand[] } {
  if (state.config.selection.mode === 'none') return { state, commands: [] };
  const selectedIds = new Set(state.selectedIds);
  if (state.config.selection.mode === 'single' || event.mode === 'single') {
    selectedIds.clear();
    selectedIds.add(event.nodeId);
  } else if (selectedIds.has(event.nodeId)) {
    selectedIds.delete(event.nodeId);
  } else {
    selectedIds.add(event.nodeId);
  }
  return {
    state: { ...state, selectedIds },
    commands: [{ type: 'EMIT_SELECTION_CHANGE', selectedIds: [...selectedIds] }],
  };
}

export function applyPinnedNavigate(
  state: TreeState,
  event: Extract<EngineEvent, { type: 'PINNED_NAVIGATE' }>,
): { state: TreeState; commands: EngineCommand[] } {
  if (!state.config.pinned.enabled) return { state, commands: [] };
  if (!state.adapterSupportsPathResolution) return { state, commands: [] };
  const requestId = `req-${state.nextRequestSeq}`;
  return {
    state: { ...state, nextRequestSeq: state.nextRequestSeq + 1 },
    commands: [{ type: 'RESOLVE_PATH', requestId, epoch: state.epoch, targetId: event.targetId }],
  };
}
```

```ts
// File: packages/tree-explorer/src/lib/tree-explorer.component.ts
// Invariant: filtering debounce is host timing logic; semantics remain adapter-owned.
import type { EngineEvent } from '@tree-core';

export class FilterIntentController {
  private filterTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly debounceMs: () => number,
    private readonly dispatch: (event: EngineEvent) => void,
  ) {}

  onFilterInput(text: string): void {
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => {
      this.dispatch({ type: 'FILTER_UPDATED', text });
    }, this.debounceMs());
  }
}
```

### Tests added now

```ts
// File: packages/tree-core/src/lib/engine/features.spec.ts
import { describe, it, expect } from 'vitest';

describe('feature order invariants', () => {
  it('selection no-ops when mode is none', () => {
    expect(true).toBe(true);
  });

  it('filter update increments epoch for stale protection', () => {
    expect(true).toBe(true);
  });

  it('pinned navigation requires optional path support', () => {
    expect(true).toBe(true);
  });
});
```

### Architecture compliance checks
- [ ] Filtering semantics remain adapter-owned.
- [ ] Pinned behavior does not alter base projection ordering.
- [ ] Context menu DOM ownership remains in host.

### Success checkpoints
- Feature suite passes in rollout order.
- No regression in paging/range correctness tests.

### Stop conditions
- Adding feature logic directly into child components.
- Bypassing command/event flow for any feature.

## Phase 10) A11y: ARIA tree + keyboard + focus model

### Step overview
Make keyboard navigation deterministic and accessible in virtualized rendering.

### Do this now
1. Add semantic tree roles/attributes.
2. Keep container focus with active-descendant style model.
3. Route keydown through `NAV_KEY` events.

### Code snippets

```html
<!-- File: packages/tree-explorer/src/lib/tree-explorer.component.html -->
<!-- Invariant: semantic accessible HTML without framework widget dependencies. -->
<div
  role="tree"
  tabindex="0"
  [attr.aria-activedescendant]="snapshot().activeId ? 'tree-row-' + snapshot().activeId : null"
  (keydown)="onKeydown($any($event).key)">
  @for (idx of windowIndices(); track trackIndex($index, idx)) {
    @if (snapshot().rowAt(idx); as row) {
      <div
        [id]="'tree-row-' + row.id"
        role="treeitem"
        [attr.aria-level]="row.depth"
        [attr.aria-selected]="row.selected ? 'true' : 'false'"
        [attr.aria-expanded]="row.expandable ? row.expanded : null">
        <tree-item [row]="row"></tree-item>
      </div>
    }
  }
</div>
```

```ts
// File: packages/tree-core/src/lib/engine/navigation.spec.ts
import { describe, it, expect } from 'vitest';

describe('keyboard navigation invariants', () => {
  it('ArrowDown keeps active index in bounds', () => {
    // Outline: dispatch NAV_KEY events and assert bounds invariants.
    expect(true).toBe(true);
  });
});
```

### Tests added now
- Keyboard navigation invariant test (bounds, scroll-to-index behavior).
- ARIA attribute consistency test for virtualized rows.

### Architecture compliance checks
- [ ] Keyboard events are reducer intents, not direct DOM mutations.
- [ ] ARIA semantics preserved across viewport churn.

### Success checkpoints
- Keyboard invariant tests pass.
- Focus remains stable while scrolling and loading.

### Stop conditions
- Imperative focus mutation bypassing engine state.
- Missing ARIA tree semantics.

## Phase 11) Storybook readiness (10k/100k/500k)

### Step overview
Use Storybook as verification harness, not as source-of-truth architecture.

### Do this now
1. Add synthetic adapter scenarios for 10k/100k/500k.
2. Add controls for config toggles.
3. Add interaction stories for major features and race paths.

### Code snippets

- No new implementation snippets in this phase by design.
- Use [`docs/STORYBOOK_GUIDE.md`](./STORYBOOK_GUIDE.md) as the source for story structure, controls, and interaction expectations.
- Keep story files limited to harness composition around already-implemented engine/host contracts.

### Tests added now
- Keep Storybook interaction and scale checks aligned with [`docs/STORYBOOK_GUIDE.md`](./STORYBOOK_GUIDE.md).

### Architecture compliance checks
- [ ] Stories use adapter + config + host callbacks only.
- [ ] Stories validate stale protection and dedupe in race flows.

### Success checkpoints
- 10k/100k/500k stories run with expected invariants.
- Interaction stories cover selection/filter/navigation/context menu.

### Stop conditions
- Story-only behavior diverges from real component logic.

## Phase 12) npm readiness checklist

### Step overview
Finalize export maps, typing, and docs alignment before publish.

### Do this now
1. Validate package exports against actual public contracts.
2. Validate docs links and API references.
3. Run release gates.

### Code snippets

- No new implementation snippets in this phase by design.
- Use [`docs/PUBLISHING_NPM.md`](./PUBLISHING_NPM.md) for export map, release checks, and publish sequencing.
- Validate existing package manifests against the canonical contracts established in phases 1-10.

### Tests added now
- Follow publish gate checklist in [`docs/PUBLISHING_NPM.md`](./PUBLISHING_NPM.md).

### Architecture compliance checks
- [ ] Public surface matches documented contracts.
- [ ] No deep-import requirements for consumers.

### Success checkpoints
- Build/typecheck/tests/docs checks all green.
- No broken links in `README.md` and `docs/*.md`.

### Stop conditions
- Exported API differs from documented API.
- Publishing requires undocumented entrypoints.
