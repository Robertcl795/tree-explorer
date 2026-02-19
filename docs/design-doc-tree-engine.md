# Tree Engine Design Document — Framework-Agnostic State Machine

> Canonical design spec for `@tree-core` engine + `@tree-explorer` Angular wrapper.
> Covers state machine, TypeScript API, virtualization algorithm, engine modules, and test plan.

---

## Table of Contents

1. [Plan A vs Plan B](#1-plan-a-vs-plan-b)
2. [State Machine Spec](#2-state-machine-spec)
3. [TypeScript API Surface](#3-typescript-api-surface)
4. [Engine Modules](#4-engine-modules)
5. [Web Component + Angular Consumption Contract](#5-web-component--angular-consumption-contract)
6. [Virtualization Algorithm Detail](#6-virtualization-algorithm-detail)
7. [Roadmap and Tests](#7-roadmap-and-tests)

---

## 1. Plan A vs Plan B

### Plan A: Reducer + Command Pattern (Event-Sourced Engine)

Engine is a **pure reducer**: `(state, event) => { state, commands }`.

- Every UI intent and async completion is an `EngineEvent`.
- The reducer returns a new `TreeState` plus zero or more `Command` objects (side-effect descriptions).
- The host (Angular service, Lit controller, vanilla JS) executes commands via the adapter and dispatches completion events back.
- Selectors are pure functions over `TreeState`.

```
dispatch(event) → reducer(state, event) → { newState, commands[] }
                                              ↓
                              host executes commands via adapter
                                              ↓
                              dispatch(completionEvent) → reducer ...
```

**Pros:**
- Fully deterministic and testable — every transition is a pure function.
- Time-travel debugging trivial (log events + replay).
- Zero framework coupling — no observables, no signals, no subscriptions inside engine.
- Commands are inspectable data — easy to test "engine requested page 3 for node X".
- Concurrency correctness via `requestId` on commands — stale completions are rejected by guards.
- Single canonical state — no caches, no divergence.

**Cons:**
- Slightly more boilerplate in the host layer (command executor loop).
- Developers unfamiliar with event-sourcing may find the indirection non-obvious initially.
- Batching multiple rapid events requires explicit coalescing (solvable with microtask batching).

---

### Plan B: Mutable Store with Method API (OOP Engine)

Engine is a **class with methods** that mutate internal state and return effects.

- `engine.toggleExpand(nodeId)` directly mutates internal state, returns side-effects to execute.
- Subscriptions via callback registration: `engine.subscribe(listener)`.
- Selectors are getter methods on the engine instance.

```
engine.toggleExpand(id) → mutates state, returns effects[]
engine.getProjection() → current flat row list
engine.subscribe(fn) → called on every state change
```

**Pros:**
- Familiar OOP API — lower learning curve.
- Less boilerplate — methods do the work directly.
- No event serialization overhead.

**Cons:**
- Mutation makes testing harder — must snapshot state before/after.
- No replay/time-travel without extra infrastructure.
- Risk of host code calling methods in unexpected order, corrupting state.
- Harder to enforce invariants — methods can be called from anywhere.
- Subscription model must be carefully designed to avoid Angular/framework leaks.
- "Returns effects" pattern still exists, so the host executor loop is the same.

---

### Tradeoff Comparison

| Dimension           | Plan A (Reducer+Cmd)     | Plan B (Mutable Store)   |
|---------------------|--------------------------|--------------------------|
| Correctness         | Strongest — pure fns     | Good — but mutation risk |
| Testability         | Best — snapshot in/out   | Adequate — need setup    |
| Performance         | Structural sharing easy  | Direct mutation fast     |
| DX for new devs     | Medium learning curve    | Lower learning curve     |
| Framework agnostic  | Perfect — zero coupling  | Good — but sub risk      |
| Extensibility       | Add events + handlers    | Add methods              |
| Debugging           | Event log + replay       | Breakpoints + inspect    |
| Concurrency safety  | requestId guards natural | Must bolt on guards      |

### Recommendation: **Plan A (Reducer + Command Pattern)**

**Blunt reasoning:** The entire point of this engine is correctness under concurrent async operations (page loads racing, filter changes mid-load, expand during scroll). A pure reducer makes these guarantees trivially testable: given state S and event E, assert resulting state and commands. Mutation-based approaches require defensive guards bolted on after the fact and are harder to prove correct under race conditions. The slightly higher boilerplate in the host layer is a one-time cost paid once per framework wrapper, while correctness bugs in a mutable store would recur forever.

Both plans share identical module structure, package layout, adapter boundary, and feature set. The difference is purely in the orchestration pattern.

---

## 2. State Machine Spec

### 2.1 Canonical State Shape

```typescript
interface TreeState {
  // === Node Index ===
  /** All known nodes keyed by ID. Single source of truth for node data. */
  nodes: Record<string, TreeNodeState>;

  /** Ordered root node IDs. */
  rootIds: string[];

  // === Expansion ===
  /** Set of expanded node IDs. */
  expandedIds: Set<string>;

  // === Selection ===
  /** Set of selected node IDs. */
  selectedIds: Set<string>;

  /** Anchor node for range selection (shift+click). */
  selectionAnchor: string | null;

  // === Filtering ===
  /** Current active filter query, or null if no filter. */
  filterQuery: FilterQuery | null;

  /** Set of node IDs matching the current filter. */
  matchedIds: Set<string>;

  /** Set of ancestor IDs of matched nodes (kept visible). */
  ancestorOfMatchIds: Set<string>;

  // === Paging / Loading ===
  /** Per-node paging state. Key = nodeId (or '__root__' for root). */
  pageStates: Record<string, NodePageState>;

  /** In-flight request tracking. Key = requestId. */
  inflightRequests: Record<string, InflightRequest>;

  /** Monotonic counter for generating unique request IDs. */
  nextRequestId: number;

  // === Navigation ===
  /** Active focus index in the projection (roving focus). */
  focusIndex: number;

  /** Active-descendant node ID (for aria-activedescendant). */
  focusedNodeId: string | null;

  /** Pending pinned navigation target, if any. */
  pendingNavigation: PendingNavigation | null;

  // === Projection (derived, cached) ===
  /**
   * The ONE canonical flattened projection.
   * Recomputed on expansion/filter/page changes.
   * Each entry is a ProjectedRow.
   */
  projection: ProjectedRow[];

  /** Dirty flag — projection needs recomputation. */
  projectionDirty: boolean;

  // === Config (live toggles) ===
  config: ResolvedTreeConfig;

  // === Errors ===
  errors: TreeLoadError[];
}

interface TreeNodeState {
  id: string;
  parentId: string | null;
  depth: number;
  data: unknown; // TSource — opaque to engine
  childrenIds: string[];
  /** Total children count from server (for paging). -1 = unknown. */
  totalChildrenCount: number;
  isLeaf: boolean;
  /** True if children have been loaded at least once. */
  childrenLoaded: boolean;
}

interface NodePageState {
  /** Page size used for this node. */
  pageSize: number;
  /** Total item count from server. */
  totalCount: number;
  /** Pages that have been fully loaded. */
  loadedPages: Set<number>;
  /** Pages currently being loaded (requestId mapped). */
  loadingPages: Map<number, string>; // pageIndex → requestId
  /** Pages that failed to load. */
  failedPages: Map<number, string>; // pageIndex → error reason
}

interface InflightRequest {
  requestId: string;
  type: 'loadChildren' | 'loadPage' | 'loadRootPage' | 'resolvePath';
  nodeId: string | null; // null for root
  pageIndex: number | null;
  /** Timestamp for stale detection. */
  createdAt: number;
}

interface ProjectedRow {
  nodeId: string;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  isLeaf: boolean;
  isLoading: boolean;
  isPlaceholder: boolean;
  isMatchedByFilter: boolean;
  isFocused: boolean;
  flatIndex: number;
  /** Opaque data from adapter; null for placeholder rows. */
  data: unknown | null;
}

interface PendingNavigation {
  targetId: string;
  requestId: string;
  status: 'resolving-path' | 'expanding-ancestors' | 'loading-branch';
  /** Remaining path steps to process. */
  remainingSteps: NavigationStep[];
  /** Completed step IDs. */
  completedSteps: string[];
}

interface NavigationStep {
  nodeId: string;
  pageHint?: number;
}
```

### 2.2 Events (Inputs to the Reducer)

```typescript
// === UI Intent Events ===
type EngineEvent =
  // --- Data ---
  | { type: 'INIT'; rootData: unknown[]; totalRootCount?: number }
  | { type: 'SET_ADAPTER_META'; isLeafFn?: (data: unknown) => boolean }

  // --- Expansion ---
  | { type: 'TOGGLE_EXPAND'; nodeId: string }
  | { type: 'EXPAND'; nodeId: string }
  | { type: 'COLLAPSE'; nodeId: string }
  | { type: 'EXPAND_ALL' }
  | { type: 'COLLAPSE_ALL' }

  // --- Selection ---
  | { type: 'SELECT'; nodeId: string; mode: 'single' | 'toggle' | 'range' }
  | { type: 'SELECT_ALL' }
  | { type: 'DESELECT_ALL' }

  // --- Filtering ---
  | { type: 'SET_FILTER'; query: FilterQuery }
  | { type: 'CLEAR_FILTER' }

  // --- Viewport / Virtualization ---
  | { type: 'VIEWPORT_RANGE_CHANGED'; startIndex: number; endIndex: number; overscan: number }

  // --- Navigation ---
  | { type: 'NAVIGATE_TO_NODE'; targetId: string }
  | { type: 'CANCEL_NAVIGATION' }

  // --- Keyboard ---
  | { type: 'KEY_ARROW_DOWN' }
  | { type: 'KEY_ARROW_UP' }
  | { type: 'KEY_ARROW_RIGHT' }
  | { type: 'KEY_ARROW_LEFT' }
  | { type: 'KEY_HOME' }
  | { type: 'KEY_END' }
  | { type: 'KEY_ENTER' }
  | { type: 'KEY_SPACE' }
  | { type: 'KEY_PAGE_DOWN'; pageSize: number }
  | { type: 'KEY_PAGE_UP'; pageSize: number }
  | { type: 'KEY_TYPEAHEAD'; char: string }

  // --- Config ---
  | { type: 'UPDATE_CONFIG'; config: Partial<TreeConfigInput> }

  // --- Focus ---
  | { type: 'SET_FOCUS_INDEX'; index: number }

  // === Async Completion Events ===
  | { type: 'CHILDREN_LOADED'; requestId: string; nodeId: string; children: unknown[]; totalCount: number }
  | { type: 'PAGE_LOADED'; requestId: string; nodeId: string; pageIndex: number; items: unknown[]; totalCount: number }
  | { type: 'ROOT_PAGE_LOADED'; requestId: string; pageIndex: number; items: unknown[]; totalCount: number }
  | { type: 'LOAD_FAILED'; requestId: string; error: string }
  | { type: 'PATH_RESOLVED'; requestId: string; targetId: string; steps: NavigationStep[] }
  | { type: 'PATH_RESOLUTION_FAILED'; requestId: string; reason: string }

  // === Error management ===
  | { type: 'DISMISS_ERROR'; errorIndex: number }
  | { type: 'RETRY_FAILED_PAGE'; nodeId: string; pageIndex: number };
```

### 2.3 Guards (Transition Preconditions)

```typescript
const guards = {
  /** Reject async completion if requestId doesn't match any inflight request. */
  isRequestCurrent: (state: TreeState, requestId: string): boolean =>
    requestId in state.inflightRequests,

  /** Prevent expansion of leaf nodes. */
  canExpand: (state: TreeState, nodeId: string): boolean => {
    const node = state.nodes[nodeId];
    return !!node && !node.isLeaf;
  },

  /** Prevent selection when selection is disabled. */
  canSelect: (state: TreeState): boolean =>
    state.config.selection.mode !== 'none',

  /** Prevent range selection when mode is 'single'. */
  canRangeSelect: (state: TreeState): boolean =>
    state.config.selection.mode === 'multi',

  /** Prevent page load if page already loaded or in-flight. */
  canLoadPage: (state: TreeState, nodeId: string, pageIndex: number): boolean => {
    const ps = state.pageStates[nodeId];
    if (!ps) return true;
    return !ps.loadedPages.has(pageIndex) && !ps.loadingPages.has(pageIndex);
  },

  /** Prevent navigation if another navigation is already pending. */
  canNavigate: (state: TreeState): boolean =>
    state.pendingNavigation === null,

  /** Viewport range is valid. */
  isValidRange: (start: number, end: number): boolean =>
    start >= 0 && end >= start,

  /** Focus index is within projection bounds. */
  isValidFocusIndex: (state: TreeState, index: number): boolean =>
    index >= 0 && index < state.projection.length,
};
```

### 2.4 Actions (Pure State Updates)

Actions are pure functions: `(state, event) => TreeState`.

Key actions (not exhaustive — see module breakdown for full list):

| Action | Trigger Event | State Mutations |
|---|---|---|
| `addNodes` | `INIT`, `CHILDREN_LOADED`, `PAGE_LOADED` | Inserts into `nodes`, updates `childrenIds` on parent |
| `toggleExpansion` | `TOGGLE_EXPAND` | Flips `expandedIds`, marks `projectionDirty` |
| `applySelection` | `SELECT` | Updates `selectedIds`, `selectionAnchor` |
| `applyFilter` | `SET_FILTER` | Sets `filterQuery`, computes `matchedIds` + `ancestorOfMatchIds`, marks `projectionDirty` |
| `clearFilter` | `CLEAR_FILTER` | Nulls `filterQuery`, clears match sets |
| `registerInflight` | (before emitting command) | Adds to `inflightRequests`, increments `nextRequestId` |
| `completeInflight` | `CHILDREN_LOADED`, `PAGE_LOADED`, etc. | Removes from `inflightRequests`, updates `pageStates` |
| `rejectStale` | Any async completion where guard fails | No-op or log warning |
| `recomputeProjection` | Any event that sets `projectionDirty` | Rebuilds `projection` array |
| `moveFocus` | `KEY_ARROW_*`, `KEY_HOME`, etc. | Updates `focusIndex`, `focusedNodeId` |
| `recordError` | `LOAD_FAILED` | Pushes to `errors` |
| `updatePageState` | `PAGE_LOADED`, `ROOT_PAGE_LOADED` | Marks page as loaded in `pageStates` |

### 2.5 Commands / Effects (Returned by Reducer)

```typescript
type EngineCommand =
  | { type: 'LOAD_CHILDREN'; requestId: string; nodeId: string }
  | { type: 'LOAD_PAGE'; requestId: string; nodeId: string; pageIndex: number; pageSize: number }
  | { type: 'LOAD_ROOT_PAGE'; requestId: string; pageIndex: number; pageSize: number }
  | { type: 'RESOLVE_PATH'; requestId: string; targetId: string }
  | { type: 'CANCEL_REQUEST'; requestId: string }
  | { type: 'SCROLL_TO_INDEX'; index: number }
  | { type: 'ANNOUNCE_TO_SCREENREADER'; message: string }
  | { type: 'EMIT_SELECTION_CHANGE'; selectedIds: string[] }
  | { type: 'EMIT_NAVIGATION_RESULT'; result: NavigationResult }
  | { type: 'EMIT_LOAD_ERROR'; error: TreeLoadError };
```

### 2.6 Invariants

These must hold after every reducer call:

1. **Single projection:** `state.projection` is the ONLY flattened row list. No secondary caches.
2. **Inflight consistency:** Every `requestId` in `pageStates.loadingPages` exists in `inflightRequests`.
3. **No orphan nodes:** Every `nodeId` in `rootIds` and every ID in any `childrenIds` exists in `nodes`.
4. **Selection subset:** `selectedIds ⊆ keys(nodes)`.
5. **Expansion subset:** `expandedIds ⊆ keys(nodes) where node.isLeaf === false`.
6. **Focus bounds:** `focusIndex >= 0 && focusIndex < projection.length` (or -1 if projection is empty).
7. **Page monotonicity:** Once a page is in `loadedPages`, it stays there until a filter/collapse invalidation.
8. **Filter consistency:** When `filterQuery !== null`, `matchedIds` and `ancestorOfMatchIds` reflect current filter applied to current `nodes`.
9. **Stale rejection:** Async completions with `requestId` not in `inflightRequests` produce no state changes.

**Enforcement:** The reducer runs an `assertInvariants(state)` function in dev mode after every transition. In production, the pure structure of the reducer prevents violations by construction.

---

## 3. TypeScript API Surface

### 3.1 TreeAdapter

```typescript
/**
 * Domain boundary. The ONLY interface between the tree system and your data/API.
 * Implement this; never put domain logic anywhere else.
 *
 * @typeParam TSource — raw shape from your API / domain model
 * @typeParam T — normalized node data (often same as TSource)
 */
export interface TreeAdapter<TSource = unknown, T = TSource> {
  // === Required ===

  /** Stable unique identifier for a source item. Must be deterministic. */
  getId(source: TSource): string;

  /** Display label for the node. */
  getLabel(data: T): string;

  // === Children ===

  /**
   * Synchronous children access. Return undefined if children must be loaded async.
   * Return empty array for confirmed leaf nodes.
   */
  getChildren?(data: T): TSource[] | undefined;

  /** Async children loading. Called when expanding a node whose children aren't loaded. */
  loadChildren?(nodeId: string, parentData: T): Promise<TreeChildrenResult<TSource>>;

  /** Whether the node has (or might have) children. Used before first load. */
  hasChildren?(data: T): boolean;

  /**
   * Explicit leaf determination. Takes precedence over hasChildren/childrenIds heuristics.
   * Return undefined to fall back to default heuristic.
   */
  isLeaf?(data: T, ctx: { childrenLoaded: boolean; childrenCount: number }): boolean | undefined;

  // === Paging ===

  /** Pagination config for a given parent (or root if parentId is null). */
  getPagination?(parentId: string | null): { pageSize: number } | undefined;

  /** Load a specific page of children. */
  loadPage?(parentId: string | null, pageIndex: number, pageSize: number): Promise<TreePageResult<TSource>>;

  // === Filtering ===

  /** Adapter-owned match semantics. Return true if the node matches the query. */
  matches?(data: T, query: FilterQuery): boolean;

  /** Extract searchable text from node data. Used if matches() is not provided. */
  getSearchText?(data: T): string;

  /** Highlight ranges for matched text in labels. */
  highlightRanges?(data: T, query: FilterQuery): Array<{ start: number; end: number }>;

  // === Display ===

  /** Icon identifier or config for the node. */
  getIcon?(data: T): string | TreeIconConfig | undefined;

  // === Navigation ===

  /**
   * Resolve the path from root to a target node.
   * Used for pinned item navigation into unloaded branches.
   * Steps may include page hints for paged parents.
   */
  resolvePathToNode?(targetId: string): Promise<TreePathResolution>;

  // === Data Mapping ===

  /** Transform source data to node data. Default: identity. */
  transform?(source: TSource): T;
}

export interface TreeChildrenResult<TSource> {
  items: TSource[];
  totalCount?: number;
}

export interface TreePageResult<TSource> {
  items: TSource[];
  totalCount: number;
  pageIndex: number;
}

export interface TreePathResolution {
  targetId: string;
  steps: Array<{
    nodeId: string;
    pageHint?: number;
  }>;
}

export interface TreeIconConfig {
  name: string;
  color?: string;
  fontSet?: string;
}
```

### 3.2 TreeEngine Public API

```typescript
/**
 * Framework-agnostic tree state machine.
 * Pure reducer + command pattern.
 *
 * Usage:
 *   const engine = createTreeEngine(config);
 *   const { state, commands } = engine.dispatch(event);
 *   // host executes commands, dispatches completions
 */
export interface TreeEngine {
  /** Dispatch an event and receive new state + commands to execute. */
  dispatch(event: EngineEvent): DispatchResult;

  /** Get current state (read-only snapshot). */
  getState(): Readonly<TreeState>;

  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(listener: (state: Readonly<TreeState>) => void): () => void;

  /**
   * Batch multiple events into a single state transition.
   * Listeners are notified once after all events are processed.
   */
  batch(events: EngineEvent[]): DispatchResult;

  /** Reset engine to initial state. */
  reset(): void;
}

export interface DispatchResult {
  state: Readonly<TreeState>;
  commands: EngineCommand[];
}

/**
 * Create a new TreeEngine instance.
 */
export function createTreeEngine(config?: Partial<TreeConfigInput>): TreeEngine;
```

### 3.3 Selectors

```typescript
/**
 * Pure selector functions over TreeState.
 * These are the ONLY way to derive data from state.
 */
export const selectors = {
  /** The canonical flat projection (filtered + expanded + paged). */
  getProjection: (state: TreeState): ReadonlyArray<ProjectedRow> => state.projection,

  /** Total number of visible rows. */
  getRowCount: (state: TreeState): number => state.projection.length,

  /** Get a single row by flat index. */
  getRowAtIndex: (state: TreeState, index: number): ProjectedRow | undefined => state.projection[index],

  /** Currently selected node IDs. */
  getSelectedIds: (state: TreeState): ReadonlySet<string> => state.selectedIds,

  /** Whether a specific node is expanded. */
  isExpanded: (state: TreeState, nodeId: string): boolean => state.expandedIds.has(nodeId),

  /** Whether a specific node is selected. */
  isSelected: (state: TreeState, nodeId: string): boolean => state.selectedIds.has(nodeId),

  /** Current active filter query. */
  getFilterQuery: (state: TreeState): FilterQuery | null => state.filterQuery,

  /** Whether any filter is active. */
  isFiltered: (state: TreeState): boolean => state.filterQuery !== null,

  /** Current focused node ID. */
  getFocusedNodeId: (state: TreeState): string | null => state.focusedNodeId,

  /** Current focus index in projection. */
  getFocusIndex: (state: TreeState): number => state.focusIndex,

  /** All current errors. */
  getErrors: (state: TreeState): ReadonlyArray<TreeLoadError> => state.errors,

  /** Whether any loads are in-flight. */
  isLoading: (state: TreeState): boolean => Object.keys(state.inflightRequests).length > 0,

  /** Pending navigation state. */
  getPendingNavigation: (state: TreeState): PendingNavigation | null => state.pendingNavigation,

  /** Get node data by ID. */
  getNodeData: (state: TreeState, nodeId: string): unknown | undefined => state.nodes[nodeId]?.data,

  /** Get node state by ID. */
  getNode: (state: TreeState, nodeId: string): TreeNodeState | undefined => state.nodes[nodeId],
};
```

### 3.4 TreeConfig

```typescript
/**
 * Runtime behavior configuration.
 * All fields have defaults via DEFAULT_TREE_CONFIG.
 */
export interface TreeConfig {
  virtualization: {
    /** Enable virtual scrolling. */
    enabled: boolean;
    /** Fixed row height in pixels. */
    itemSize: number;
    /** 'auto' = enable if row count > threshold. */
    mode: 'always' | 'never' | 'auto';
    /** Auto-enable threshold row count. */
    autoThreshold: number;
  };

  pageAware: {
    /** Enable page-aware loading for virtualized trees. */
    enabled: boolean;
    /** Default page size. Adapter.getPagination() overrides per-node. */
    defaultPageSize: number;
  };

  selection: {
    /** Selection mode. */
    mode: 'none' | 'single' | 'multi';
    /** Allow checkbox UI. */
    showCheckboxes: boolean;
  };

  filtering: {
    /** Client-side, server-side, or hybrid. */
    mode: 'client' | 'server' | 'hybrid';
    /** Show ancestor nodes of matched nodes. */
    showParentsOfMatches: boolean;
    /** Auto-expand ancestors of matched nodes. */
    autoExpandMatches: boolean;
    /** Debounce time in ms for filter input. */
    debounceMs: number;
  };

  contextMenu: {
    /** Enable context menu support. */
    enabled: boolean;
  };

  pinned: {
    /** Enable pinned items feature. */
    enabled: boolean;
    /** Label for pinned section. */
    label: string;
  };

  keyboard: {
    /** Enable keyboard navigation. */
    enabled: boolean;
    /** Enable typeahead search. */
    typeahead: boolean;
    /** Typeahead reset timeout in ms. */
    typeaheadTimeout: number;
  };

  accessibility: {
    /** Focus management strategy. */
    focusMode: 'roving-tabindex' | 'activedescendant';
    /** ARIA role for the tree container. */
    role: 'tree';
  };
}

export type TreeConfigInput = DeepPartial<TreeConfig>;

export const DEFAULT_TREE_CONFIG: TreeConfig = {
  virtualization: { enabled: true, itemSize: 36, mode: 'auto', autoThreshold: 100 },
  pageAware: { enabled: false, defaultPageSize: 50 },
  selection: { mode: 'single', showCheckboxes: false },
  filtering: { mode: 'client', showParentsOfMatches: true, autoExpandMatches: true, debounceMs: 200 },
  contextMenu: { enabled: false },
  pinned: { enabled: false, label: 'Pinned' },
  keyboard: { enabled: true, typeahead: false, typeaheadTimeout: 500 },
  accessibility: { focusMode: 'activedescendant', role: 'tree' },
};
```

### 3.5 FilterQuery

```typescript
/**
 * Immutable filter intent. Created by host from user input.
 */
export interface FilterQuery {
  /** Search text. */
  text: string;
  /** Match mode. */
  mode: 'contains' | 'startsWith' | 'exact' | 'regex';
  /** Case-sensitive matching. */
  caseSensitive: boolean;
}

/** Input type accepted by the engine — null means "clear filter". */
export type FilterInput = FilterQuery | null;

/** Create a default FilterQuery from a search string. */
export function createFilterQuery(text: string): FilterQuery {
  return { text, mode: 'contains', caseSensitive: false };
}
```

### 3.6 Error Types

```typescript
/**
 * Standardized load error.
 */
export interface TreeLoadError {
  scope: 'root' | 'children' | 'navigation' | 'page';
  nodeId: string | null;
  pageIndex: number | null;
  reason: string;
  timestamp: number;
  /** Original error, if available. */
  cause?: unknown;
}

/**
 * Invariant violation — thrown in dev mode only.
 */
export class TreeInvariantError extends Error {
  constructor(
    public readonly invariant: string,
    public readonly stateSnapshot: Partial<TreeState>,
  ) {
    super(`Tree invariant violated: ${invariant}`);
    this.name = 'TreeInvariantError';
  }
}

/**
 * Adapter contract violation.
 */
export class TreeAdapterError extends Error {
  constructor(
    public readonly method: string,
    public readonly detail: string,
  ) {
    super(`TreeAdapter.${method}: ${detail}`);
    this.name = 'TreeAdapterError';
  }
}
```

### 3.7 Engine Event + Command Types

Full type definitions shown in sections 2.2 and 2.5 above. Re-exported from `@tree-core/index.ts`.

---

## 4. Engine Modules

All modules live under `packages/tree-core/src/lib/engine/`.

### 4.1 State Module (`state.ts`)

**Responsibilities:**
- Define initial state factory: `createInitialState(config): TreeState`
- Provide the top-level reducer: `treeReducer(state, event): { state, commands }`
- Route events to sub-module handlers
- Run projection recomputation when `projectionDirty`
- Run invariant checks in dev mode

**Inputs:** `TreeState`, `EngineEvent`
**Outputs:** `{ TreeState, EngineCommand[] }`

**Events handled:** All — this is the router.

**Selectors exposed:** None directly; delegates to selectors module.

```typescript
// Simplified reducer structure
export function treeReducer(state: TreeState, event: EngineEvent): { state: TreeState; commands: EngineCommand[] } {
  let nextState = state;
  let commands: EngineCommand[] = [];

  switch (event.type) {
    case 'TOGGLE_EXPAND':
    case 'EXPAND':
    case 'COLLAPSE':
    case 'EXPAND_ALL':
    case 'COLLAPSE_ALL':
      ({ state: nextState, commands } = handleExpansionEvent(nextState, event));
      break;

    case 'SELECT':
    case 'SELECT_ALL':
    case 'DESELECT_ALL':
      ({ state: nextState, commands } = handleSelectionEvent(nextState, event));
      break;

    case 'SET_FILTER':
    case 'CLEAR_FILTER':
      ({ state: nextState, commands } = handleFilterEvent(nextState, event));
      break;

    case 'VIEWPORT_RANGE_CHANGED':
      ({ state: nextState, commands } = handlePagingEvent(nextState, event));
      break;

    case 'CHILDREN_LOADED':
    case 'PAGE_LOADED':
    case 'ROOT_PAGE_LOADED':
    case 'LOAD_FAILED':
      ({ state: nextState, commands } = handleLoadingEvent(nextState, event));
      break;

    case 'KEY_ARROW_DOWN':
    case 'KEY_ARROW_UP':
    case 'KEY_ARROW_RIGHT':
    case 'KEY_ARROW_LEFT':
    case 'KEY_HOME':
    case 'KEY_END':
    case 'KEY_ENTER':
    case 'KEY_SPACE':
    case 'KEY_PAGE_DOWN':
    case 'KEY_PAGE_UP':
      ({ state: nextState, commands } = handleNavigationEvent(nextState, event));
      break;

    case 'NAVIGATE_TO_NODE':
    case 'CANCEL_NAVIGATION':
    case 'PATH_RESOLVED':
    case 'PATH_RESOLUTION_FAILED':
      ({ state: nextState, commands } = handlePinnedNavEvent(nextState, event));
      break;

    // ... remaining cases
  }

  // Recompute projection if dirty
  if (nextState.projectionDirty) {
    nextState = recomputeProjection(nextState);
  }

  // Dev-mode invariant check
  if (__DEV__) assertInvariants(nextState);

  return { state: nextState, commands };
}
```

### 4.2 Projection / Flattening Module (`projection.ts`)

**Responsibilities:**
- DFS traversal of node tree respecting expansion state
- Insert placeholder rows for unloaded pages
- Apply filter visibility (show matched + ancestors)
- Produce the canonical `ProjectedRow[]`

**Inputs:** `nodes`, `rootIds`, `expandedIds`, `filterQuery`, `matchedIds`, `ancestorOfMatchIds`, `pageStates`, `selectedIds`, `focusedNodeId`

**Outputs:** `ProjectedRow[]`

**Events handled:** None directly — called by state module when `projectionDirty`.

**Selectors exposed:**
- `getProjection(state)`
- `getRowCount(state)`
- `getRowAtIndex(state, index)`

```typescript
export function computeProjection(state: TreeState): ProjectedRow[] {
  const rows: ProjectedRow[] = [];
  const isFiltered = state.filterQuery !== null;

  function visit(nodeId: string, depth: number): void {
    const node = state.nodes[nodeId];
    if (!node) return;

    // Filter visibility check
    if (isFiltered) {
      const isMatch = state.matchedIds.has(nodeId);
      const isAncestor = state.ancestorOfMatchIds.has(nodeId);
      if (!isMatch && !isAncestor) return;
    }

    const isExpanded = state.expandedIds.has(nodeId);

    rows.push({
      nodeId,
      depth,
      isExpanded,
      isSelected: state.selectedIds.has(nodeId),
      isLeaf: node.isLeaf,
      isLoading: false, // updated below if applicable
      isPlaceholder: false,
      isMatchedByFilter: isFiltered ? state.matchedIds.has(nodeId) : false,
      isFocused: state.focusedNodeId === nodeId,
      flatIndex: rows.length,
      data: node.data,
    });

    if (isExpanded) {
      const pageState = state.pageStates[nodeId];
      if (pageState && state.config.pageAware.enabled) {
        // Emit loaded children + placeholders for unloaded pages
        emitPagedChildren(rows, node, pageState, depth + 1, state);
      } else {
        for (const childId of node.childrenIds) {
          visit(childId, depth + 1);
        }
      }
    }
  }

  // Handle paged roots vs regular roots
  const rootPageState = state.pageStates['__root__'];
  if (rootPageState && state.config.pageAware.enabled) {
    emitPagedRoots(rows, rootPageState, state);
  } else {
    for (const rootId of state.rootIds) {
      visit(rootId, 0);
    }
  }

  return rows;
}
```

### 4.3 Paging / Range Loading Module (`paging.ts`)

**Responsibilities:**
- Receive viewport range info and determine which pages are needed
- Deduplicate against loaded and in-flight pages
- Generate `LOAD_PAGE` / `LOAD_ROOT_PAGE` commands
- Invalidate pages on filter or expansion changes
- Track per-node `NodePageState`

**Inputs:** `startIndex`, `endIndex`, `overscan`, `projection`, `pageStates`

**Outputs:** `EngineCommand[]` (load page commands), updated `pageStates`

**Events handled:**
- `VIEWPORT_RANGE_CHANGED`
- `PAGE_LOADED` / `ROOT_PAGE_LOADED` (completion)
- `LOAD_FAILED` (page failure tracking)
- `RETRY_FAILED_PAGE`

**Selectors exposed:**
- `getPageState(state, nodeId)`
- `isPageLoaded(state, nodeId, pageIndex)`

```typescript
/**
 * Compute which pages need loading based on the current viewport range.
 *
 * Algorithm:
 *   1. Expand viewport range with overscan
 *   2. Walk projection[start..end]
 *   3. For each placeholder row, determine which page it belongs to
 *   4. Collect unique page keys (nodeId + pageIndex)
 *   5. Filter out already-loaded and in-flight pages
 *   6. Generate LOAD_PAGE commands for remaining pages
 */
export function computeRequiredPages(
  state: TreeState,
  startIndex: number,
  endIndex: number,
  overscan: number,
): { pageKeys: PageKey[]; commands: EngineCommand[]; nextRequestId: number } {
  const effectiveStart = Math.max(0, startIndex - overscan);
  const effectiveEnd = Math.min(state.projection.length - 1, endIndex + overscan);

  const neededPages = new Map<string, PageKey>(); // compositeKey → PageKey
  let reqId = state.nextRequestId;

  for (let i = effectiveStart; i <= effectiveEnd; i++) {
    const row = state.projection[i];
    if (!row.isPlaceholder) continue;

    const parentId = state.nodes[row.nodeId]?.parentId ?? '__root__';
    const ps = state.pageStates[parentId];
    if (!ps) continue;

    const childIndex = getChildIndex(state, parentId, row.nodeId);
    const pageIndex = Math.floor(childIndex / ps.pageSize);
    const key = `${parentId}:${pageIndex}`;

    if (neededPages.has(key)) continue;
    if (ps.loadedPages.has(pageIndex)) continue;
    if (ps.loadingPages.has(pageIndex)) continue;

    neededPages.set(key, { parentId, pageIndex, pageSize: ps.pageSize });
  }

  const commands: EngineCommand[] = [];
  for (const pk of neededPages.values()) {
    const requestId = String(reqId++);
    const cmd: EngineCommand = pk.parentId === '__root__'
      ? { type: 'LOAD_ROOT_PAGE', requestId, pageIndex: pk.pageIndex, pageSize: pk.pageSize }
      : { type: 'LOAD_PAGE', requestId, nodeId: pk.parentId, pageIndex: pk.pageIndex, pageSize: pk.pageSize };
    commands.push(cmd);
  }

  return { pageKeys: [...neededPages.values()], commands, nextRequestId: reqId };
}

interface PageKey {
  parentId: string;
  pageIndex: number;
  pageSize: number;
}
```

### 4.4 Filtering Module (`filtering.ts`)

**Responsibilities:**
- Compute `matchedIds` from current filter query and node data
- Compute `ancestorOfMatchIds` (all ancestors of matched nodes)
- Handle client-side matching using adapter's `matches()` or fallback `getSearchText()`
- Invalidate match sets on node additions (children loaded)
- Mark projection dirty on filter changes

**Inputs:** `filterQuery`, `nodes`, adapter match function reference (passed as config callback)

**Outputs:** `matchedIds: Set<string>`, `ancestorOfMatchIds: Set<string>`

**Events handled:**
- `SET_FILTER`
- `CLEAR_FILTER`
- `CHILDREN_LOADED` / `PAGE_LOADED` (refilter new nodes when filter is active)

**Selectors exposed:**
- `getFilterQuery(state)`
- `isFiltered(state)`
- `isNodeMatched(state, nodeId)`

```typescript
/**
 * Compute matched and ancestor sets for a given filter query.
 *
 * @param matchFn - Adapter-provided match function, or default text matcher
 */
export function computeFilterSets(
  nodes: Record<string, TreeNodeState>,
  query: FilterQuery,
  matchFn: (data: unknown, query: FilterQuery) => boolean,
): { matchedIds: Set<string>; ancestorOfMatchIds: Set<string> } {
  const matchedIds = new Set<string>();
  const ancestorOfMatchIds = new Set<string>();

  // First pass: find all matches
  for (const [id, node] of Object.entries(nodes)) {
    if (node.data != null && matchFn(node.data, query)) {
      matchedIds.add(id);
    }
  }

  // Second pass: mark all ancestors of matches
  for (const matchedId of matchedIds) {
    let current = nodes[matchedId];
    while (current?.parentId) {
      if (ancestorOfMatchIds.has(current.parentId)) break; // already traced
      ancestorOfMatchIds.add(current.parentId);
      current = nodes[current.parentId];
    }
  }

  return { matchedIds, ancestorOfMatchIds };
}
```

### 4.5 Selection Module (`selection.ts`)

**Responsibilities:**
- Single select, toggle select, range select
- Select all / deselect all
- Maintain selection anchor for shift+click range
- Emit `EMIT_SELECTION_CHANGE` command

**Inputs:** `selectedIds`, `selectionAnchor`, `projection`, selection mode from config

**Outputs:** updated `selectedIds`, `selectionAnchor`, `EMIT_SELECTION_CHANGE` command

**Events handled:**
- `SELECT`
- `SELECT_ALL`
- `DESELECT_ALL`
- `KEY_SPACE` (toggle selection of focused item)

**Selectors exposed:**
- `getSelectedIds(state)`
- `isSelected(state, nodeId)`
- `getSelectionCount(state)`

```typescript
export function handleSelect(
  state: TreeState,
  nodeId: string,
  mode: 'single' | 'toggle' | 'range',
): { state: TreeState; commands: EngineCommand[] } {
  if (!guards.canSelect(state)) return { state, commands: [] };

  let newSelected: Set<string>;
  let newAnchor: string | null;

  switch (mode) {
    case 'single':
      newSelected = new Set([nodeId]);
      newAnchor = nodeId;
      break;

    case 'toggle':
      newSelected = new Set(state.selectedIds);
      if (newSelected.has(nodeId)) {
        newSelected.delete(nodeId);
      } else {
        if (state.config.selection.mode === 'single') {
          newSelected = new Set([nodeId]);
        } else {
          newSelected.add(nodeId);
        }
      }
      newAnchor = nodeId;
      break;

    case 'range':
      if (!guards.canRangeSelect(state)) {
        newSelected = new Set([nodeId]);
        newAnchor = nodeId;
        break;
      }
      newSelected = computeRangeSelection(state, nodeId);
      newAnchor = state.selectionAnchor; // preserve anchor
      break;
  }

  return {
    state: {
      ...state,
      selectedIds: newSelected,
      selectionAnchor: newAnchor,
      projectionDirty: true, // selection affects projected row state
    },
    commands: [{ type: 'EMIT_SELECTION_CHANGE', selectedIds: [...newSelected] }],
  };
}
```

### 4.6 Navigation Module (`navigation.ts`)

**Responsibilities:**
- Keyboard focus movement (arrow keys, home, end, page up/down)
- Arrow-right = expand (or move to first child); arrow-left = collapse (or move to parent)
- Enter = activate (context-dependent); Space = toggle selection
- Typeahead: buffer keystrokes, find next match in projection
- Maintain `focusIndex` and `focusedNodeId`
- Emit `SCROLL_TO_INDEX` command when focus moves outside viewport

**Inputs:** `focusIndex`, `projection`, `expandedIds`, keyboard event type

**Outputs:** updated `focusIndex`, `focusedNodeId`, expansion/selection side effects, `SCROLL_TO_INDEX` commands

**Events handled:**
- `KEY_ARROW_DOWN`, `KEY_ARROW_UP`, `KEY_ARROW_RIGHT`, `KEY_ARROW_LEFT`
- `KEY_HOME`, `KEY_END`, `KEY_PAGE_DOWN`, `KEY_PAGE_UP`
- `KEY_ENTER`, `KEY_SPACE`
- `KEY_TYPEAHEAD`
- `SET_FOCUS_INDEX`

**Selectors exposed:**
- `getFocusIndex(state)`
- `getFocusedNodeId(state)`

```typescript
export function handleNavigationEvent(
  state: TreeState,
  event: NavigationEvent,
): { state: TreeState; commands: EngineCommand[] } {
  const commands: EngineCommand[] = [];
  let nextIndex = state.focusIndex;

  switch (event.type) {
    case 'KEY_ARROW_DOWN':
      nextIndex = Math.min(state.focusIndex + 1, state.projection.length - 1);
      break;

    case 'KEY_ARROW_UP':
      nextIndex = Math.max(state.focusIndex - 1, 0);
      break;

    case 'KEY_ARROW_RIGHT': {
      const row = state.projection[state.focusIndex];
      if (row && !row.isLeaf && !row.isExpanded) {
        // Expand the node — delegate to expansion handler
        return handleExpansionEvent(state, { type: 'EXPAND', nodeId: row.nodeId });
      } else if (row && row.isExpanded) {
        // Move to first child
        nextIndex = state.focusIndex + 1;
      }
      break;
    }

    case 'KEY_ARROW_LEFT': {
      const row = state.projection[state.focusIndex];
      if (row && row.isExpanded && !row.isLeaf) {
        // Collapse the node
        return handleExpansionEvent(state, { type: 'COLLAPSE', nodeId: row.nodeId });
      } else if (row) {
        // Move to parent
        const parentId = state.nodes[row.nodeId]?.parentId;
        if (parentId) {
          const parentIndex = state.projection.findIndex(r => r.nodeId === parentId);
          if (parentIndex >= 0) nextIndex = parentIndex;
        }
      }
      break;
    }

    case 'KEY_HOME':
      nextIndex = 0;
      break;

    case 'KEY_END':
      nextIndex = state.projection.length - 1;
      break;

    case 'KEY_PAGE_DOWN':
      nextIndex = Math.min(state.focusIndex + event.pageSize, state.projection.length - 1);
      break;

    case 'KEY_PAGE_UP':
      nextIndex = Math.max(state.focusIndex - event.pageSize, 0);
      break;

    case 'KEY_ENTER':
      // Activate — emit action for host to handle
      break;

    case 'KEY_SPACE': {
      // Toggle selection on focused item
      const row = state.projection[state.focusIndex];
      if (row) {
        return handleSelect(state, row.nodeId, 'toggle');
      }
      break;
    }
  }

  // Clamp and update focus
  nextIndex = Math.max(0, Math.min(nextIndex, state.projection.length - 1));
  const focusedRow = state.projection[nextIndex];

  const nextState: TreeState = {
    ...state,
    focusIndex: nextIndex,
    focusedNodeId: focusedRow?.nodeId ?? null,
    projectionDirty: true, // isFocused flag changes
  };

  commands.push({ type: 'SCROLL_TO_INDEX', index: nextIndex });

  return { state: nextState, commands };
}
```

### 4.7 Pinned Navigation Module (`pinned-navigation.ts`)

**Responsibilities:**
- Orchestrate multi-step async navigation to a pinned target
- Use adapter's `resolvePathToNode()` to get path steps
- Process steps sequentially: expand ancestors, load missing branches
- Handle page hints for paged parents
- Track `PendingNavigation` state
- Handle cancellation, failures, stale results

**Inputs:** target node ID, `pendingNavigation` state, adapter path resolution results

**Outputs:** expansion events, load commands, navigation result commands

**Events handled:**
- `NAVIGATE_TO_NODE`
- `CANCEL_NAVIGATION`
- `PATH_RESOLVED`
- `PATH_RESOLUTION_FAILED`
- `CHILDREN_LOADED` / `PAGE_LOADED` (when part of navigation sequence)

**Selectors exposed:**
- `getPendingNavigation(state)`
- `isNavigating(state)`

---

## 5. Web Component + Angular Consumption Contract

### 5.1 TreeExplorerComponent Responsibilities

```typescript
/**
 * Angular component — the SINGLE public entry point.
 * Selector: <tree-explorer>
 *
 * Responsibilities:
 *   1. Translate DOM events → EngineEvents
 *   2. Execute EngineCommands via adapter
 *   3. Own context menu UI and DOM interactions
 *   4. Manage CDK virtual scroll viewport
 *   5. Forward accessibility attributes
 *
 * MUST NOT:
 *   - Contain domain/API logic
 *   - Call adapter directly (except through command execution)
 *   - Maintain separate row caches
 *   - Mutate engine state directly
 */
@Component({
  selector: 'tree-explorer',
  standalone: true,
  // ...
})
export class TreeExplorerComponent<TSource, T = TSource> {
  // === Inputs ===
  @Input() data: TSource[] | TreeChildrenResult<TSource>;
  @Input() adapter: TreeAdapter<TSource, T>;
  @Input() config: Partial<TreeConfigInput>;
  @Input() filterQuery: FilterInput;
  @Input() pinnedItems: PinnedItem[];

  // === Outputs ===
  @Output() selectionChange = new EventEmitter<string[]>();
  @Output() action = new EventEmitter<TreeAction>();
  @Output() loadError = new EventEmitter<TreeLoadError>();
  @Output() navigationResult = new EventEmitter<NavigationResult>();

  // === Internal ===
  private engine: TreeEngine;

  // --- DOM → Engine ---
  onKeydown(event: KeyboardEvent): void { /* map to KEY_* events, dispatch to engine */ }
  onScroll(range: ListRange): void { /* dispatch VIEWPORT_RANGE_CHANGED */ }
  onNodeClick(nodeId: string, event: MouseEvent): void { /* dispatch SELECT with mode */ }
  onNodeToggle(nodeId: string): void { /* dispatch TOGGLE_EXPAND */ }
  onContextMenu(nodeId: string, event: MouseEvent): void { /* open context menu */ }

  // --- Command Executor ---
  private executeCommands(commands: EngineCommand[]): void {
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'LOAD_CHILDREN':
          this.adapter.loadChildren!(cmd.nodeId, /*...*/).then(
            result => this.engine.dispatch({
              type: 'CHILDREN_LOADED', requestId: cmd.requestId,
              nodeId: cmd.nodeId, children: result.items, totalCount: result.totalCount ?? result.items.length
            }),
            error => this.engine.dispatch({
              type: 'LOAD_FAILED', requestId: cmd.requestId, error: String(error)
            }),
          );
          break;
        case 'LOAD_PAGE':
          this.adapter.loadPage!(cmd.nodeId, cmd.pageIndex, cmd.pageSize).then(/*...*/);
          break;
        case 'RESOLVE_PATH':
          this.adapter.resolvePathToNode!(cmd.targetId).then(/*...*/);
          break;
        case 'SCROLL_TO_INDEX':
          this.viewport.scrollToIndex(cmd.index);
          break;
        case 'EMIT_SELECTION_CHANGE':
          this.selectionChange.emit(cmd.selectedIds);
          break;
        case 'EMIT_LOAD_ERROR':
          this.loadError.emit(cmd.error);
          break;
        // ...
      }
    }
  }
}
```

### 5.2 TreeItem Responsibilities

```typescript
/**
 * Presentational-only row component.
 *
 * Receives a ProjectedRow from the parent TreeExplorerComponent.
 *
 * MUST NOT:
 *   - Call adapter methods
 *   - Dispatch engine events
 *   - Maintain any state
 *   - Make API calls
 */
@Component({
  selector: 'tree-item',
  standalone: true,
  // ...
})
export class TreeItemComponent {
  @Input() row: ProjectedRow;
  @Input() itemSize: number;
  // Icon, label, indent, expand chevron, checkbox — all derived from row.
  // Click/keyboard events bubble up to TreeExplorerComponent.
}
```

### 5.3 Export Surface / Index Files

**`packages/tree-core/src/index.ts`:**

```typescript
// === Types ===
export type { TreeAdapter, TreeChildrenResult, TreePageResult, TreePathResolution, TreeIconConfig } from './lib/types/tree-adapter';
export type { TreeConfig, TreeConfigInput } from './lib/types/tree-config';
export { DEFAULT_TREE_CONFIG } from './lib/types/tree-config';
export type { FilterQuery, FilterInput } from './lib/types/tree-filter';
export { createFilterQuery } from './lib/types/tree-filter';
export type { TreeLoadError } from './lib/types/tree-errors';
export { TreeInvariantError, TreeAdapterError } from './lib/types/tree-errors';

// === Engine ===
export type { TreeEngine, DispatchResult, TreeState, ProjectedRow, TreeNodeState } from './lib/engine/state';
export { createTreeEngine } from './lib/engine/state';
export type { EngineEvent } from './lib/engine/events';
export type { EngineCommand } from './lib/engine/commands';

// === Selectors ===
export { selectors } from './lib/engine/selectors';
```

**`packages/tree-explorer/src/index.ts`:**

```typescript
// Single entry point — TreeExplorer only.
// async-tree is NOT exported. No re-exports of removed components.

export { TreeExplorerComponent } from './lib/components/tree-explorer/tree-explorer.component';
export { TreeItemComponent } from './lib/components/tree-item/tree-item.component';

// Re-export core types for convenience (optional, consumers can also import from @tree-core directly)
export type { TreeAdapter, TreeConfig, FilterQuery, TreeLoadError } from '@tree-core';
```

**async-tree removal:**
- No `async-tree` component file exists in `packages/tree-explorer/src/lib/components/`.
- No `AsyncTreeComponent` export in any index file.
- No documentation references to `async-tree`.
- Verification: `grep -r "async-tree\|AsyncTree\|asyncTree" packages/` returns zero results.

---

## 6. Virtualization Algorithm Detail

### 6.1 Row Height Strategy: **Fixed Height**

**Decision:** Fixed row height (default 36px, configurable via `config.virtualization.itemSize`).

**Justification:**
- Predictable scroll math — total height = `rowCount * itemSize`.
- O(1) index-from-offset computation — `index = Math.floor(scrollTop / itemSize)`.
- No measurement pass needed — eliminates layout thrashing.
- Page computation is stable — row index maps deterministically to page index.
- Required for correct placeholder sizing — unloaded page slots need known height.
- Content that exceeds 36px: use `text-overflow: ellipsis` and tooltip on hover.

### 6.2 Overscan

**Strategy:** Fixed overscan count (default: 5 rows above and below visible range).

```typescript
const OVERSCAN = 5; // configurable via engine if needed

function computeVisibleRange(scrollTop: number, viewportHeight: number, itemSize: number, totalRows: number) {
  const rawStart = Math.floor(scrollTop / itemSize);
  const rawEnd = Math.ceil((scrollTop + viewportHeight) / itemSize) - 1;

  return {
    visibleStart: rawStart,
    visibleEnd: Math.min(rawEnd, totalRows - 1),
    renderStart: Math.max(0, rawStart - OVERSCAN),
    renderEnd: Math.min(totalRows - 1, rawEnd + OVERSCAN),
  };
}
```

### 6.3 Viewport → Visible Index Range

Given by the scroll viewport (CDK for Angular, `@lit-labs/virtualizer` for Lit, or manual for vanilla):

```
scrollTop → startIndex = floor(scrollTop / itemSize)
viewportHeight → count = ceil(viewportHeight / itemSize)
endIndex = startIndex + count - 1
```

The host dispatches `VIEWPORT_RANGE_CHANGED { startIndex, endIndex, overscan }` to the engine on every scroll event (debounced or via `requestAnimationFrame`).

### 6.4 Visible Index Range → Required Pages (Page-Aware)

**Page model:**
- A "page" is a contiguous slice of **children** under a single parent (or root-level items).
- Page key: `{ parentId: string, pageIndex: number }`.
- Page size: per-parent via `adapter.getPagination(parentId)?.pageSize` or `config.pageAware.defaultPageSize`.
- A placeholder row occupies one slot in the projection per unloaded child.

**Page computation algorithm:**

```
1. Walk projection[renderStart .. renderEnd]
2. For each placeholder row:
   a. Determine parentId from node metadata
   b. Determine childIndex = position within parent's children
   c. pageIndex = floor(childIndex / pageSize)
   d. compositeKey = `${parentId}:${pageIndex}`
3. Collect unique compositeKeys
4. Filter out:
   - Already in loadedPages
   - Already in loadingPages (in-flight)
5. Remaining keys → generate LOAD_PAGE commands with unique requestIds
```

**Page key computation example:**

```
Parent "dept-1" has totalChildrenCount = 250, pageSize = 50
Pages: 0 (items 0-49), 1 (items 50-99), 2 (100-149), 3 (150-199), 4 (200-249)

If viewport shows flat indices 120-150, and those map to children 80-110 of dept-1:
  → pages needed: 1 (50-99) and 2 (100-149)
  → if page 1 already loaded, only page 2 is requested
```

### 6.5 Page Deduplication and Invalidation

**Deduplication:**
- Before emitting a `LOAD_PAGE` command, check `pageStates[parentId].loadedPages` and `.loadingPages`.
- In-flight requests are tracked by `requestId` in `inflightRequests`.
- Same page is never requested twice concurrently.

**Invalidation on state changes:**

| State Change | Invalidation Action |
|---|---|
| **Filter applied/changed** | Clear ALL `pageStates`. Clear `inflightRequests` (mark as stale). Recompute projection from scratch. New viewport event will trigger fresh page loads. |
| **Filter cleared** | Same as above. |
| **Node collapsed** | Clear `pageStates[nodeId]` ONLY if config says so (optional). Children remain in `nodes` for fast re-expand. |
| **Node expanded** | If children not loaded: emit `LOAD_CHILDREN` command. If paged and page 0 not loaded: emit `LOAD_PAGE` for page 0. |

**Stale response handling:**
```typescript
// In reducer, for PAGE_LOADED event:
case 'PAGE_LOADED': {
  // Guard: reject stale
  if (!guards.isRequestCurrent(state, event.requestId)) {
    // Response arrived after filter change or collapse. Discard silently.
    return { state, commands: [] };
  }
  // ... process normally
}
```

### 6.6 Placeholder Row Details

When a paged parent is expanded:
- `totalChildrenCount` slots are created in the projection.
- Loaded slots have real `ProjectedRow` entries with `isPlaceholder: false`.
- Unloaded slots have `ProjectedRow` entries with `isPlaceholder: true`, `data: null`.
- The UI renders placeholder rows as skeleton/loading indicators.

```typescript
function emitPagedChildren(
  rows: ProjectedRow[],
  parent: TreeNodeState,
  pageState: NodePageState,
  depth: number,
  state: TreeState,
): void {
  for (let i = 0; i < pageState.totalCount; i++) {
    const childId = parent.childrenIds[i];
    if (childId && state.nodes[childId]) {
      // Real loaded node — recurse
      visit(childId, depth); // (visit is from projection module)
    } else {
      // Placeholder for unloaded slot
      rows.push({
        nodeId: `__placeholder__${parent.id}__${i}`,
        depth,
        isExpanded: false,
        isSelected: false,
        isLeaf: true,
        isLoading: isSlotLoading(pageState, i),
        isPlaceholder: true,
        isMatchedByFilter: false,
        isFocused: false,
        flatIndex: rows.length,
        data: null,
      });
    }
  }
}

function isSlotLoading(pageState: NodePageState, slotIndex: number): boolean {
  const pageIndex = Math.floor(slotIndex / pageState.pageSize);
  return pageState.loadingPages.has(pageIndex);
}
```

### 6.7 Correctness Test Cases

#### Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| E1 | Scroll to bottom of 100k-row tree | Only pages in viewport + overscan are loaded. No full materialization. |
| E2 | Expand node while page load is in-flight for parent | Parent's page load completes normally. Newly expanded node triggers its own load sequence. |
| E3 | Collapse and re-expand same node rapidly | Children remain in `nodes` from first load. No duplicate load requests. |
| E4 | Filter applied with no matches | Projection becomes empty. `rowCount = 0`. Scroll resets to top. |
| E5 | Filter shows node at depth 5 | All 4 ancestors are visible (in `ancestorOfMatchIds`), properly indented. |
| E6 | Expand node that has exactly `pageSize` children | Exactly 1 page. No off-by-one. All children visible. |
| E7 | Expand node with 0 children (confirmed leaf after load) | Node marked `isLeaf = true`. No placeholder rows. Chevron removed. |
| E8 | Page load returns fewer items than `pageSize` (last page) | Remaining placeholder slots removed. `totalCount` updated. |
| E9 | Root-level paging with 500 items, pageSize 50 | 10 pages. Initial load of page 0. Scroll to see page 5 triggers load of pages 4, 5, 6 (with overscan). |
| E10 | `itemSize` changed at runtime | Projection unchanged. Scroll position recalculated. Viewport range re-dispatched. |

#### Race Conditions

| # | Scenario | Expected Behavior |
|---|---|---|
| R1 | Rapid scroll: pages 0,1,2,3 requested, user scrolls past before 0 completes | Pages 0-3 complete normally (data stored). Pages 4-7 are now requested for new viewport. No duplicates. |
| R2 | Filter changes while page 3 is loading | Page 3 response arrives. Guard check: `requestId` still in `inflightRequests` → NO, because filter change invalidated all inflight. Response rejected. Filter recomputation triggers fresh page loads if needed. |
| R3 | Two `VIEWPORT_RANGE_CHANGED` events in same microtask | Engine processes both sequentially. Second event's page computation sees first event's inflight pages. No duplicate commands. |
| R4 | Expand node A, immediately expand node B (both need loads) | Both `LOAD_CHILDREN` commands emitted. Completions dispatched independently. Projection recomputed after each. |
| R5 | Navigate to pinned item while filter is active | Navigation clears filter first (or operates on unfiltered tree). Path resolution proceeds. If target doesn't match filter, filter is cleared to show target. |
| R6 | Collapse parent whose page is loading | Inflight request for collapsed parent's page is NOT cancelled (data is useful on re-expand). But if a filter change also happens, it IS invalidated. |
| R7 | Page load succeeds but parent was removed from tree | Guard: `nodeId` not in `nodes` → response rejected. Error not emitted (graceful discard). |
| R8 | `LOAD_FAILED` for page 2, then immediate retry while page 3 also fails | Each failure tracked independently in `failedPages`. Retry for page 2 creates new requestId. Page 3 failure recorded separately. |

---

## 7. Roadmap and Tests

### 7.1 Incremental Build Plan

#### Milestone 1: Core Contracts (Week 1)

**Scope:** Types only, no implementation.

**Deliverables:**
- `packages/tree-core/src/lib/types/tree-adapter.ts`
- `packages/tree-core/src/lib/types/tree-config.ts`
- `packages/tree-core/src/lib/types/tree-filter.ts`
- `packages/tree-core/src/lib/types/tree-errors.ts`
- `packages/tree-core/src/lib/types/tree-events.ts`
- `packages/tree-core/src/lib/types/tree-commands.ts`
- `packages/tree-core/src/lib/types/tree-state.ts`
- `packages/tree-core/src/index.ts` (exports)
- `packages/tree-core/package.json`, `tsconfig.lib.json`

**Acceptance criteria:**
- `pnpm build` succeeds for `@tree-core`.
- All types compile. No `any` leaks.
- Types are documented with JSDoc.

---

#### Milestone 2: Engine Core — Projection + Expansion (Week 2)

**Scope:** Basic tree operations without paging or filtering.

**Deliverables:**
- `packages/tree-core/src/lib/engine/state.ts` — `createTreeEngine`, `treeReducer`
- `packages/tree-core/src/lib/engine/projection.ts` — `computeProjection`
- `packages/tree-core/src/lib/engine/selectors.ts`
- Unit tests for:
  - Init with flat data → projection matches
  - Expand/collapse → projection updates
  - Nested expand → correct depth and order
  - Expand leaf → no-op (guard)
  - Collapse all → only roots visible

**Acceptance criteria:**
- Engine is instantiable and dispatchable from plain TypeScript.
- All unit tests pass.
- No framework imports in `@tree-core`.

---

#### Milestone 3: Selection + Filtering (Week 3)

**Scope:** Complete selection and client-side filtering modules.

**Deliverables:**
- `packages/tree-core/src/lib/engine/selection.ts`
- `packages/tree-core/src/lib/engine/filtering.ts`
- Unit tests for:
  - Single select, toggle, range
  - Select in `none` mode → no-op
  - Filter with matches → ancestors visible
  - Filter with no matches → empty projection
  - Clear filter → full projection restored
  - Change filter while expanded → correct recalculation
  - Children loaded while filter active → new nodes filtered

**Acceptance criteria:**
- Selection behavior correct for all modes.
- Filtering produces correct visibility with ancestor preservation.

---

#### Milestone 4: Paging + Range Loading (Week 3–4)

**Scope:** Page-aware virtualization, placeholder rows, async dedup.

**Deliverables:**
- `packages/tree-core/src/lib/engine/paging.ts`
- Unit tests for:
  - Page computation from viewport range
  - Deduplication of in-flight pages
  - Stale response rejection (requestId guard)
  - Page completion → placeholders replaced
  - Filter change → inflight invalidated
  - Last page with fewer items → totalCount adjusted
  - Multiple parents with different page sizes

**Acceptance criteria:**
- Correctness test cases E1–E10 pass.
- Race condition test cases R1–R8 pass.
- Zero duplicate load commands under any event sequence.

---

#### Milestone 5: Keyboard Navigation (Week 4)

**Scope:** Full keyboard support + focus model.

**Deliverables:**
- `packages/tree-core/src/lib/engine/navigation.ts`
- Unit tests for:
  - Arrow up/down movement
  - Arrow right expand / move to child
  - Arrow left collapse / move to parent
  - Home/End jump
  - PageUp/PageDown by page size
  - Space toggles selection
  - Focus stays in bounds after filter/collapse
  - Typeahead find (optional)

**Acceptance criteria:**
- Keyboard behavior matches WAI-ARIA TreeView pattern.
- `SCROLL_TO_INDEX` emitted when focus moves outside viewport.

---

#### Milestone 6: Pinned Navigation (Week 5)

**Scope:** Async multi-step path resolution and navigation.

**Deliverables:**
- `packages/tree-core/src/lib/engine/pinned-navigation.ts`
- Unit tests for:
  - Path resolved → ancestors expanded → target focused
  - Path resolution failure → error emitted
  - Branch load failure mid-navigation → error emitted
  - Navigation cancelled mid-flight → state cleaned up
  - Navigate to already-visible node → immediate focus

**Acceptance criteria:**
- Pinned navigation works with and without page hints.
- All failure modes produce correct error payloads.

---

#### Milestone 7: Angular Wrapper (Week 5–6)

**Scope:** `TreeExplorerComponent` + `TreeItemComponent` + `TreeStateService`.

**Deliverables:**
- `packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.ts`
- `packages/tree-explorer/src/lib/components/tree-item/tree-item.component.ts`
- `packages/tree-explorer/src/lib/services/tree-state.service.ts`
- `packages/tree-explorer/src/index.ts` (no async-tree export)
- Integration tests for:
  - Render tree from data + adapter
  - Expand/collapse via click
  - Keyboard navigation within rendered tree
  - Virtual scroll renders correct rows on scroll
  - Page loads triggered on scroll
  - Filter input updates projection
  - Selection emits output event
  - Context menu opens on right-click (no domain logic)
  - Pinned item navigation

**Acceptance criteria:**
- `<tree-explorer>` is the single entry point.
- `async-tree` does not exist in codebase.
- All Storybook stories render correctly.
- `pnpm build && pnpm test` green.

---

#### Milestone 8: Storybook + Perf Validation (Week 6–7)

**Scope:** Story coverage + performance benchmarks.

**Deliverables:**
- Stories:
  - `Basic Usage` — flat + nested
  - `Virtual Scroll` — 10k nodes
  - `Page Aware` — paged parent with 500 children
  - `Filtering (100+ elements)` — client-side filter
  - `Pinned Items` — async navigation
  - `Errors & Edge Cases` — load failures, retries
  - `Keyboard Navigation` — focus traversal demo
- Performance tests (headless browser):
  - Initial render of 10k nodes: < 100ms
  - Scroll through 100k nodes: no dropped frames (60fps target)
  - Expand node with 1000 children (paged): first page renders < 50ms
  - Filter 50k nodes: result renders < 200ms
  - Memory: no leaks after expand/collapse/filter cycle (100 iterations)

**Acceptance criteria:**
- All stories render without errors.
- Performance tests pass thresholds.
- No memory leaks detected.

---

### 7.2 Test Plan

#### Unit Tests (Pure Engine — No DOM)

Location: `packages/tree-core/src/lib/engine/**/*.spec.ts`

```typescript
// Example: projection.spec.ts
describe('computeProjection', () => {
  it('should flatten a simple tree with expanded nodes', () => {
    const state = createTestState({
      nodes: { a: node('a', null, ['b', 'c']), b: node('b', 'a'), c: node('c', 'a') },
      rootIds: ['a'],
      expandedIds: new Set(['a']),
    });
    const projection = computeProjection(state);
    expect(projection.map(r => r.nodeId)).toEqual(['a', 'b', 'c']);
    expect(projection.map(r => r.depth)).toEqual([0, 1, 1]);
  });

  it('should not show children of collapsed nodes', () => {
    const state = createTestState({
      nodes: { a: node('a', null, ['b']), b: node('b', 'a') },
      rootIds: ['a'],
      expandedIds: new Set(), // collapsed
    });
    const projection = computeProjection(state);
    expect(projection.map(r => r.nodeId)).toEqual(['a']);
  });

  it('should show ancestors of filtered matches', () => {
    const state = createTestState({
      nodes: { a: node('a', null, ['b']), b: node('b', 'a', ['c']), c: node('c', 'b') },
      rootIds: ['a'],
      expandedIds: new Set(['a', 'b']),
      filterQuery: { text: 'c', mode: 'contains', caseSensitive: false },
      matchedIds: new Set(['c']),
      ancestorOfMatchIds: new Set(['a', 'b']),
    });
    const projection = computeProjection(state);
    expect(projection.map(r => r.nodeId)).toEqual(['a', 'b', 'c']);
    expect(projection.find(r => r.nodeId === 'c')!.isMatchedByFilter).toBe(true);
  });

  it('should insert placeholder rows for unloaded pages', () => {
    const state = createTestState({
      nodes: { p: node('p', null, ['c0'], 100) }, // 100 children, only c0 loaded
      rootIds: ['p'],
      expandedIds: new Set(['p']),
      pageStates: { p: { pageSize: 50, totalCount: 100, loadedPages: new Set([0]), loadingPages: new Map(), failedPages: new Map() } },
      config: { ...DEFAULT_TREE_CONFIG, pageAware: { enabled: true, defaultPageSize: 50 } },
    });
    const projection = computeProjection(state);
    // p + 100 children slots (some real, some placeholder)
    expect(projection.length).toBe(101);
    expect(projection.filter(r => r.isPlaceholder).length).toBe(99); // 100 - 1 loaded
  });
});

// Example: paging.spec.ts
describe('computeRequiredPages', () => {
  it('should not request already-loaded pages', () => {
    const state = createTestState({
      pageStates: { dept: { pageSize: 50, totalCount: 200, loadedPages: new Set([0, 1]), loadingPages: new Map(), failedPages: new Map() } },
      // projection has placeholders at indices mapping to page 2
    });
    const { commands } = computeRequiredPages(state, 100, 149, 0);
    expect(commands.every(c => c.type === 'LOAD_PAGE' && c.pageIndex >= 2)).toBe(true);
  });

  it('should not request in-flight pages', () => {
    const state = createTestState({
      pageStates: { dept: { pageSize: 50, totalCount: 200, loadedPages: new Set([0]), loadingPages: new Map([[1, 'req-1']]), failedPages: new Map() } },
    });
    const { commands } = computeRequiredPages(state, 50, 99, 0);
    expect(commands).toEqual([]); // page 1 already in-flight
  });
});

// Example: selection.spec.ts
describe('handleSelect', () => {
  it('should enforce single-select mode', () => {
    const state = createTestState({
      selectedIds: new Set(['a']),
      config: { ...DEFAULT_TREE_CONFIG, selection: { mode: 'single', showCheckboxes: false } },
    });
    const { state: next } = handleSelect(state, 'b', 'single');
    expect([...next.selectedIds]).toEqual(['b']);
  });

  it('should no-op when selection is disabled', () => {
    const state = createTestState({
      config: { ...DEFAULT_TREE_CONFIG, selection: { mode: 'none', showCheckboxes: false } },
    });
    const { state: next } = handleSelect(state, 'a', 'single');
    expect(next.selectedIds.size).toBe(0);
  });
});

// Example: race condition tests — paging.spec.ts
describe('stale response handling', () => {
  it('should reject page load response after filter change', () => {
    // 1. Setup: page 2 is loading with requestId "req-5"
    let state = createTestState({
      inflightRequests: { 'req-5': { requestId: 'req-5', type: 'loadPage', nodeId: 'dept', pageIndex: 2, createdAt: 1 } },
    });

    // 2. Filter changes → invalidates all inflight
    const { state: filtered } = treeReducer(state, { type: 'SET_FILTER', query: { text: 'x', mode: 'contains', caseSensitive: false } });
    expect(filtered.inflightRequests).toEqual({}); // all cleared

    // 3. Stale response arrives
    const { state: afterStale, commands } = treeReducer(filtered, {
      type: 'PAGE_LOADED', requestId: 'req-5', nodeId: 'dept', pageIndex: 2, items: [], totalCount: 100,
    });
    // No state change — stale response rejected
    expect(afterStale.pageStates).toEqual(filtered.pageStates);
    expect(commands).toEqual([]);
  });

  it('should handle rapid scroll without duplicate page requests', () => {
    let state = createTestState(/* with paged root, 500 items */);

    // Simulate rapid viewport changes
    const { state: s1, commands: c1 } = treeReducer(state, { type: 'VIEWPORT_RANGE_CHANGED', startIndex: 0, endIndex: 20, overscan: 5 });
    const { state: s2, commands: c2 } = treeReducer(s1, { type: 'VIEWPORT_RANGE_CHANGED', startIndex: 50, endIndex: 70, overscan: 5 });
    const { state: s3, commands: c3 } = treeReducer(s2, { type: 'VIEWPORT_RANGE_CHANGED', startIndex: 100, endIndex: 120, overscan: 5 });

    // Verify no duplicate page requests across all commands
    const allPageRequests = [...c1, ...c2, ...c3].filter(c => c.type === 'LOAD_PAGE' || c.type === 'LOAD_ROOT_PAGE');
    const pageKeys = allPageRequests.map(c => `${c.type === 'LOAD_PAGE' ? c.nodeId : '__root__'}:${c.pageIndex}`);
    const uniqueKeys = new Set(pageKeys);
    expect(pageKeys.length).toBe(uniqueKeys.size); // no duplicates
  });
});
```

#### Integration Tests (Web Component — DOM)

Location: `packages/tree-explorer/src/lib/components/tree-explorer/tree-explorer.component.spec.ts`

```typescript
describe('TreeExplorerComponent', () => {
  it('should render tree items from provided data', async () => {
    const { fixture } = await setup({ data: flatData, adapter: simpleAdapter });
    const items = fixture.nativeElement.querySelectorAll('tree-item');
    expect(items.length).toBeGreaterThan(0);
  });

  it('should expand node on chevron click and show children', async () => {
    const { fixture, getItems, clickChevron } = await setup({ data: nestedData, adapter });
    expect(getItems().length).toBe(1); // only root
    await clickChevron('root');
    expect(getItems().length).toBe(3); // root + 2 children
  });

  it('should handle keyboard arrow-down navigation', async () => {
    const { fixture, pressKey, getFocusedNodeId } = await setup({ data: flatData, adapter });
    await pressKey('ArrowDown');
    expect(getFocusedNodeId()).toBe('item-1');
  });

  it('should trigger page load on scroll into unloaded region', async () => {
    const loadPage = jasmine.createSpy('loadPage').and.returnValue(Promise.resolve({ items: [], totalCount: 200, pageIndex: 1 }));
    const { fixture, scrollToIndex } = await setup({
      data: { items: page0Items, totalCount: 200 },
      adapter: { ...adapter, loadPage },
      config: { pageAware: { enabled: true, defaultPageSize: 50 } },
    });
    await scrollToIndex(60); // into page 1 territory
    expect(loadPage).toHaveBeenCalledWith(null, 1, 50);
  });

  it('should emit selectionChange on item click', async () => {
    const { fixture, clickItem, selectionChangeSpy } = await setup({ data: flatData, adapter });
    await clickItem('item-0');
    expect(selectionChangeSpy).toHaveBeenCalledWith(['item-0']);
  });

  it('should display context menu on right-click without domain logic', async () => {
    const { fixture, rightClickItem, getContextMenu } = await setup({
      data: flatData,
      adapter,
      config: { contextMenu: { enabled: true } },
    });
    await rightClickItem('item-0');
    expect(getContextMenu()).toBeTruthy();
  });
});
```

#### Performance Tests (Headless Browser)

Location: `packages/tree-explorer/src/perf/` or `scripts/perf/`

```typescript
// perf-test-harness.ts
describe('Performance', () => {
  it('should render 10k flat nodes within 100ms', async () => {
    const data = generateFlatNodes(10_000);
    const start = performance.now();
    const { fixture } = await setup({ data, adapter, config: { virtualization: { enabled: true, itemSize: 36, mode: 'always', autoThreshold: 0 } } });
    fixture.detectChanges();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('should maintain 60fps during continuous scroll of 100k nodes', async () => {
    const data = generateFlatNodes(100_000);
    const { fixture, viewport } = await setup({ data, adapter });
    const frameDrops = await measureScrollPerformance(viewport, { distance: 50_000, speed: 'fast' });
    expect(frameDrops).toBeLessThan(5); // allow <5 dropped frames
  });

  it('should not leak memory after 100 expand/collapse cycles', async () => {
    const data = generateNestedNodes(1_000, 3); // 1000 nodes, depth 3
    const { fixture, toggleExpand } = await setup({ data, adapter });
    const baselineHeap = getHeapUsage();
    for (let i = 0; i < 100; i++) {
      await toggleExpand('root');
    }
    const finalHeap = getHeapUsage();
    // Allow 10% growth for GC timing variance
    expect(finalHeap).toBeLessThan(baselineHeap * 1.1);
  });
});
```

#### Range-Loading Correctness Tests

Location: `packages/tree-core/src/lib/engine/paging.spec.ts`

```typescript
describe('Range-loading correctness', () => {
  describe('stale responses', () => {
    it('should discard page response received after filter change', /* covered above */);
    it('should discard page response for collapsed parent', () => { /* ... */ });
    it('should discard children response for removed node', () => { /* ... */ });
    it('should accept page response if node is still expanded', () => { /* ... */ });
  });

  describe('rapid scroll', () => {
    it('should not emit duplicate page requests across 10 rapid viewport changes', () => { /* ... */ });
    it('should eventually load all pages visible in final viewport position', () => { /* ... */ });
    it('should handle viewport moving backward (scroll up)', () => { /* ... */ });
  });

  describe('filter mid-load', () => {
    it('should invalidate all inflight on SET_FILTER', () => { /* ... */ });
    it('should recompute pages needed after filter applied', () => { /* ... */ });
    it('should handle CLEAR_FILTER while filter-triggered loads are inflight', () => { /* ... */ });
    it('should correctly show filtered results even when pages were partially loaded', () => { /* ... */ });
  });

  describe('expand during scroll', () => {
    it('should correctly shift page indices when node expands above viewport', () => { /* ... */ });
    it('should load children page 0 on expand of paged node', () => { /* ... */ });
    it('should handle simultaneous expand and viewport change', () => { /* ... */ });
  });

  describe('boundary conditions', () => {
    it('should handle empty tree (0 nodes)', () => { /* ... */ });
    it('should handle single root node', () => { /* ... */ });
    it('should handle deeply nested tree (depth 50)', () => { /* ... */ });
    it('should handle node with exactly 1 page of children', () => { /* ... */ });
    it('should handle last page with fewer items than pageSize', () => { /* ... */ });
    it('should handle totalCount = 0 after load', () => { /* ... */ });
    it('should handle totalCount increasing between page loads', () => { /* ... */ });
  });
});
```

---

## Appendix A: File Layout Summary

```
packages/tree-core/
├── src/
│   ├── lib/
│   │   ├── engine/
│   │   │   ├── state.ts              # createTreeEngine, treeReducer, top-level orchestration
│   │   │   ├── projection.ts         # computeProjection, DFS flattening, placeholder insertion
│   │   │   ├── paging.ts             # computeRequiredPages, page dedup, invalidation
│   │   │   ├── filtering.ts          # computeFilterSets, match/ancestor computation
│   │   │   ├── selection.ts          # handleSelect, range selection, anchor management
│   │   │   ├── navigation.ts         # keyboard focus movement, scroll-to-index
│   │   │   ├── pinned-navigation.ts  # multi-step async navigation orchestration
│   │   │   ├── selectors.ts          # pure selector functions
│   │   │   ├── invariants.ts         # dev-mode invariant assertions
│   │   │   ├── state.spec.ts
│   │   │   ├── projection.spec.ts
│   │   │   ├── paging.spec.ts
│   │   │   ├── filtering.spec.ts
│   │   │   ├── selection.spec.ts
│   │   │   ├── navigation.spec.ts
│   │   │   └── pinned-navigation.spec.ts
│   │   └── types/
│   │       ├── tree-adapter.ts
│   │       ├── tree-config.ts
│   │       ├── tree-filter.ts
│   │       ├── tree-errors.ts
│   │       ├── tree-events.ts
│   │       ├── tree-commands.ts
│   │       └── tree-state.ts
│   └── index.ts
├── package.json
├── tsconfig.lib.json
└── README.md

packages/tree-explorer/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── tree-explorer/
│   │   │   │   ├── tree-explorer.component.ts
│   │   │   │   ├── tree-explorer.component.html
│   │   │   │   ├── tree-explorer.component.scss
│   │   │   │   └── tree-explorer.component.spec.ts
│   │   │   └── tree-item/
│   │   │       ├── tree-item.component.ts
│   │   │       └── tree-item.component.spec.ts
│   │   └── services/
│   │       └── tree-state.service.ts
│   └── index.ts                      # exports TreeExplorerComponent ONLY — no async-tree
├── package.json
├── tsconfig.lib.json
└── README.md
```

## Appendix B: Keyboard Navigation Map

| Key | Behavior | Engine Event |
|---|---|---|
| `ArrowDown` | Move focus to next visible row | `KEY_ARROW_DOWN` |
| `ArrowUp` | Move focus to previous visible row | `KEY_ARROW_UP` |
| `ArrowRight` | If collapsed: expand. If expanded: move to first child. If leaf: no-op. | `KEY_ARROW_RIGHT` |
| `ArrowLeft` | If expanded: collapse. If collapsed/leaf: move to parent. | `KEY_ARROW_LEFT` |
| `Home` | Move focus to first visible row | `KEY_HOME` |
| `End` | Move focus to last visible row | `KEY_END` |
| `Enter` | Activate node (host-defined action) | `KEY_ENTER` |
| `Space` | Toggle selection on focused node | `KEY_SPACE` |
| `PageDown` | Move focus down by N rows (N = visible page size) | `KEY_PAGE_DOWN` |
| `PageUp` | Move focus up by N rows | `KEY_PAGE_UP` |
| Printable char | Typeahead: find next node starting with char | `KEY_TYPEAHEAD` |

**Focus model:** `aria-activedescendant` on container. The tree container holds `tabindex="0"`. Individual rows have `id` attributes. `aria-activedescendant` on the container points to the focused row's ID. This avoids focus instability during virtual scroll row recycling.

## Appendix C: Invariant Enforcement

```typescript
export function assertInvariants(state: TreeState): void {
  // 1. No orphan nodes
  for (const id of state.rootIds) {
    if (!(id in state.nodes)) throw new TreeInvariantError('orphan-root', { rootIds: state.rootIds });
  }

  // 2. Selection subset
  for (const id of state.selectedIds) {
    if (!(id in state.nodes)) throw new TreeInvariantError('selected-missing-node', { selectedIds: [...state.selectedIds] });
  }

  // 3. Expansion subset
  for (const id of state.expandedIds) {
    if (!(id in state.nodes)) throw new TreeInvariantError('expanded-missing-node', { expandedIds: [...state.expandedIds] });
    if (state.nodes[id].isLeaf) throw new TreeInvariantError('expanded-leaf', { nodeId: id });
  }

  // 4. Inflight consistency
  for (const [, ps] of Object.entries(state.pageStates)) {
    for (const [, reqId] of ps.loadingPages) {
      if (!(reqId in state.inflightRequests)) throw new TreeInvariantError('loading-page-no-inflight', { requestId: reqId });
    }
  }

  // 5. Focus bounds
  if (state.projection.length > 0 && (state.focusIndex < 0 || state.focusIndex >= state.projection.length)) {
    throw new TreeInvariantError('focus-out-of-bounds', { focusIndex: state.focusIndex, projectionLength: state.projection.length });
  }
}
```
