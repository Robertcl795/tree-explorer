# Angular Guide: TreeExplorer Host Implementation

Architecture alignment: `docs/diagrams_angular.md` and `guided-plan.md`.

## 1) Host Architecture Alignment
- `TreeExplorerComponent` is the single Angular host entry point.
- `TreeEngine` in `@tree-core` owns state transitions, commands, selectors.
- `TreeItemComponent` is presentational-only and emits intents upward.
- `TreeAdapter` is the only domain boundary.
- Host flow is fixed: UI intents -> `TreeExplorerComponent` -> `TreeEngine` -> derived outputs -> rendering.

## 2) Angular-First Strategy (Signals-first, deterministic)
- Use `signal` for mutable host state (`snapshot`, viewport metrics, menu state).
- Use `computed` for derived values (`windowRange`, spacer sizes, visible indexes).
- Use explicit handler methods for all intents; no implicit execution paths.
- Use RxJS only for command stream orchestration where async concurrency is required.
- Keep transitions traceable: every render update is caused by explicit `dispatchIntent` and command completion dispatch.

## 3) Explicit Command Runner Model
- Command runner is invoked from intent dispatch results.
- Commands are queued and executed with bounded concurrency.
- Adapter responses are converted into explicit completion events.
- Completion events are dispatched back into engine; stale events are dropped by `epoch` + `requestId` checks.

```ts
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { EMPTY, Subject, from } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import {
  createTreeEngine,
  type EngineCommand,
  type EngineEvent,
  type EngineSnapshot,
  type TreeAdapter,
  type TreeConfig,
} from '@tree-core';

@Component({
  selector: 'td-tree-explorer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'role': 'tree',
    '[attr.aria-multiselectable]': "config().selection.mode === 'multi' ? 'true' : 'false'",
    '[attr.aria-activedescendant]': 'activeDescendantId()',
    'tabindex': '0',
  },
  templateUrl: './tree-explorer.component.html',
})
export class TreeExplorerComponent<TNode> {
  readonly adapter = input.required<TreeAdapter<TNode>>();
  readonly config = input.required<TreeConfig>();

  readonly selectionChange = output<readonly string[]>();
  readonly loadError = output<{ scope: string; reason: string }>();
  readonly contextAction = output<{ actionId: string; nodeId: string | null }>();

  private readonly engine = createTreeEngine<TNode>();
  private readonly commandQueue = new Subject<EngineCommand>();

  readonly snapshot = signal<EngineSnapshot>(this.engine.snapshot());
  readonly activeDescendantId = computed(() => this.snapshot().activeId ?? null);

  constructor() {
    this.commandQueue
      .pipe(mergeMap((command) => this.runCommand(command), 4))
      .subscribe((completionEvent) => {
        if (!completionEvent) return;
        this.dispatchIntent(completionEvent);
      });
  }

  dispatchIntent(event: EngineEvent): void {
    const { snapshot, commands } = this.engine.dispatch(event);
    this.snapshot.set(snapshot);
    for (const command of commands) this.commandQueue.next(command);
  }

  private runCommand(command: EngineCommand) {
    switch (command.type) {
      case 'LoadPage':
        return from(this.adapter().loadPage!(command.pageKey, command.filter)).pipe(
          map((result) => ({
            type: 'PageLoaded',
            pageKey: command.pageKey,
            epoch: command.epoch,
            requestId: command.requestId,
            data: result.items,
            totalCount: result.totalCount,
          }) as const),
          catchError((error) => from([{
            type: 'LoadFailed',
            epoch: command.epoch,
            requestId: command.requestId,
            error: { scope: 'page', reason: String(error) },
          } as const])),
        );

      case 'LoadChildren':
        return from(this.adapter().getChildren(command.nodeId)).pipe(
          map((items) => ({
            type: 'ChildrenLoaded',
            nodeId: command.nodeId,
            epoch: command.epoch,
            requestId: command.requestId,
            data: items,
          }) as const),
          catchError((error) => from([{
            type: 'LoadFailed',
            epoch: command.epoch,
            requestId: command.requestId,
            error: { scope: 'children', reason: String(error) },
          } as const])),
        );

      default:
        return EMPTY;
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    this.dispatchIntent({
      type: 'NavKey',
      key: event.key as any,
      shift: event.shiftKey,
      ctrl: event.ctrlKey || event.metaKey,
    });
  }
}
```

## 4) Viewport and Range Handling (Native APIs + Handlers)
- Use fixed row height for deterministic index math.
- Use `ResizeObserver` to track viewport size.
- Use `requestAnimationFrame` throttling for scroll range updates.
- Optionally use `AbortController` for host-side cancellation orchestration.

```ts
readonly rowHeight = 32;
readonly overscan = 20;
readonly scrollTop = signal(0);
readonly viewportHeight = signal(0);

readonly windowRange = computed(() => {
  const first = Math.floor(this.scrollTop() / this.rowHeight);
  const visibleCount = Math.ceil(this.viewportHeight() / this.rowHeight);
  const start = Math.max(0, first - this.overscan);
  const end = Math.min(this.snapshot().totalCount, first + visibleCount + this.overscan);
  return { start, end };
});

onViewportScroll(scrollTop: number): void {
  requestAnimationFrame(() => {
    this.scrollTop.set(scrollTop);
    const { start, end } = this.windowRange();
    this.dispatchIntent({ type: 'ViewportChanged', start, end, overscan: this.overscan });
  });
}

connectResizeObserver(element: HTMLElement): () => void {
  const ro = new ResizeObserver((entries) => {
    const height = entries[0]?.contentRect.height ?? 0;
    this.viewportHeight.set(height);
  });
  ro.observe(element);
  return () => ro.disconnect();
}
```

## 5) Semantic HTML, ARIA Tree Pattern, Keyboard Behavior
- Container: `role="tree"`, focusable, `aria-activedescendant`.
- Rows: `role="treeitem"`, `aria-level`, `aria-expanded`, `aria-selected`.
- Group wrappers: `role="group"` when needed.
- Keyboard support: Arrow keys, Home/End, PageUp/PageDown, Enter, Space.
- Context menu invocation: right-click and keyboard invocation handled in `TreeExplorerComponent`.

```html
<section
  class="tree-root"
  [style.--row-height.px]="rowHeight"
  [style.--tree-indent.px]="16"
>
  <div class="tree-spacer-top" [style.height.px]="windowRange().start * rowHeight"></div>

  <ng-container *ngFor="let i of visibleIndexes()">
    <div
      role="treeitem"
      class="tree-row"
      [attr.id]="snapshot().rowKeyAt(i)"
      [attr.aria-level]="snapshot().rowAt(i)?.depth"
      [attr.aria-expanded]="snapshot().rowAt(i)?.expandable ? snapshot().rowAt(i)?.expanded : null"
      [attr.aria-selected]="snapshot().rowAt(i)?.selected ? 'true' : 'false'"
      [attr.data-active]="snapshot().rowAt(i)?.active ? 'true' : 'false'"
      [attr.data-loading]="snapshot().rowAt(i)?.status === 'loading' ? 'true' : 'false'"
      [style.padding-inline-start.px]="(snapshot().rowAt(i)?.depth ?? 0) * 16"
      (click)="onRowClick(i, $event)"
      (contextmenu)="onContextMenu(i, $event)"
    >
      <tree-item [row]="snapshot().rowAt(i)" (toggleExpand)="onToggleExpand($event)"></tree-item>
    </div>
  </ng-container>

  <div class="tree-spacer-bottom" [style.height.px]="(snapshot().totalCount - windowRange().end) * rowHeight"></div>
</section>
```

## 6) Two App Integration Examples (Adapter + Config Only)

### App A
- Selection enabled (`multi`), context menu enabled, pinned disabled.

```ts
export const appAConfig: TreeConfig = {
  virtualization: { enabled: true, mode: 'always', itemSize: 32, overscan: 20 },
  pageAware: { enabled: true, defaultPageSize: 200 },
  selection: { mode: 'multi' },
  contextMenu: { enabled: true },
  pinned: { enabled: false, label: 'Pinned' },
  keyboard: { enabled: true },
  filtering: { mode: 'client', debounceMs: 300 },
};
```

### App B
- Selection disabled (`none`), context menu disabled, pinned enabled.

```ts
export const appBConfig: TreeConfig = {
  virtualization: { enabled: true, mode: 'always', itemSize: 28, overscan: 24 },
  pageAware: { enabled: true, defaultPageSize: 200 },
  selection: { mode: 'none' },
  contextMenu: { enabled: false },
  pinned: { enabled: true, label: 'Pinned' },
  keyboard: { enabled: true },
  filtering: { mode: 'client', debounceMs: 300 },
};
```

Both apps keep the same `TreeExplorerComponent` internals. Only adapter + config differ.

## 7) Minimal Styling Strategy (CSS Variables + Attributes)
- Keep behavior in TS and semantics in HTML.
- Drive visual states through classes/data-attrs:
  - `data-active`, `data-loading`, `data-expanded`, `data-hidden`
- Drive dimensions/spacing via CSS vars:
  - `--row-height`, `--tree-indent`, `--tree-focus-ring`, `--tree-loading-opacity`
- Avoid style conditionals in engine logic.

## 8) Compliance Checklist
- [ ] `TreeExplorerComponent` is the only host entry point.
- [ ] `TreeItemComponent` remains presentational-only.
- [ ] All adapter/domain calls happen through command execution.
- [ ] Async completions are stale-safe via `epoch` + `requestId`.
- [ ] Context menu ownership and invocation handling stay in host component.
- [ ] Pinned behavior is session-per-instance.
- [ ] No forbidden patterns are introduced.

## Success Checkpoints
- Determinism: event replay yields identical snapshots/commands.
- Range correctness: no duplicate `(epoch,pageKey)` loads and 100% stale-drop in race suites.
- Performance: DOM row ceiling and 500K smooth-scroll gates pass.
- Accessibility: keyboard traversal and ARIA tree semantics pass integration checks.
