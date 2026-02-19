# Lit Adaptation Guide

Reference baseline: `docs/diagrams_angular.md` and `docs/ARCHITECTURE_OVERVIEW.md`.
Diagram references: `docs/diagrams_angular.md` sections "A) End-to-end Angular flow" and "B) Scroll / range -> page-aware loads".

## Goal
Port Angular host glue to Lit host glue while keeping core engine, types, and invariants unchanged.

## What Changes
- Host runtime: Angular component lifecycle -> Lit element lifecycle.
- Render scheduling: Angular signals/CD -> Lit updates + requestAnimationFrame batching.
- Event emitters: Angular `output()` -> DOM `CustomEvent`.
- Storybook renderer: `@storybook/angular` -> `@storybook/web-components-vite`.

## What Must Stay Identical
- `@tree-core` reducer, modules, selectors, and commands.
- Adapter contract and domain ownership.
- Command-based async flow with `epoch` + `requestId` protection.
- Page-aware loading and dedupe registries.
- No visible-row cache and no direct node mutation.

## Mapping Table
| Concern | Angular Implementation | Lit Implementation |
|---|---|---|
| Snapshot state | `signal<EngineSnapshot>` | private field + `requestUpdate()` |
| Command stream | `Subject<EngineCommand>` + RxJS `mergeMap` | command queue array + async executor loop |
| Render batching | signal/computed updates | `requestAnimationFrame` batched flush |
| Lifecycle cleanup | `DestroyRef` / `takeUntilDestroyed` | `disconnectedCallback()` cancellation |
| Output events | `output()` emitters | `this.dispatchEvent(new CustomEvent(...))` |
| DOM intents | template bindings | `@event` handlers in Lit template |
| Storybook | Angular stories | Web Components stories |

## Porting Steps
1. Reuse engine creation and event/command union types from `@tree-core`.
2. Replace RxJS stream wiring with deterministic command queue executor.
3. Keep identical command execution semantics and stale guards.
4. Keep virtualization math and row window rules unchanged.
5. Keep context menu ownership in host element.
6. Rebuild host integration tests with web component test harness.

## Lit Host Glue Skeleton
```ts
import { LitElement, html } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import {
  createTreeEngine,
  type EngineCommand,
  type EngineEvent,
  type TreeAdapter,
  type TreeConfig,
} from '@tree-core';

@customElement('tree-explorer')
export class TreeExplorerElement<TNode> extends LitElement {
  @property({ attribute: false }) adapter!: TreeAdapter<TNode>;
  @property({ attribute: false }) config!: TreeConfig;

  @state() private snapshot = createTreeEngine<TNode>().snapshot();

  private engine = createTreeEngine<TNode>();
  private queue: EngineCommand[] = [];
  private running = false;

  private dispatchIntent(event: EngineEvent): void {
    const result = this.engine.dispatch(event);
    this.snapshot = result.snapshot;
    this.queue.push(...result.commands);
    void this.flushCommands();
  }

  private async flushCommands(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const command = this.queue.shift()!;
      const completion = await this.executeCommand(command);
      if (!completion) continue;
      const result = this.engine.dispatch(completion);
      this.snapshot = result.snapshot;
      this.queue.push(...result.commands);
    }
    this.running = false;
  }
}
```

## DOM Event Wiring Differences
- Angular usually binds handlers in template with typed method signatures.
- Lit uses `@click=${...}`, `@keydown=${...}`, and manual event typing.
- Keep translation layer identical: DOM event -> `EngineEvent`.

## Storybook Differences for Web Components
- Use story args for `adapter` and `config` object properties.
- Use deterministic synthetic adapters for 10k/100k/500k stories.
- Add interaction tests with `play` functions and keyboard/scroll simulation.

## Adaptation Checklist
- [ ] Engine package imported unchanged.
- [ ] Same commands emitted for equivalent intent sequences.
- [ ] Stale completion discard behavior parity verified.
- [ ] Virtual window DOM ceiling gate unchanged.
- [ ] No host-specific domain logic introduced.

## Success Checkpoints
- Event-sequence parity: Angular and Lit hosts emit identical command sequences for the same input stream.
- Stale completion discard rate is 100% for forced epoch-mismatch test fixtures.
- 500k synthetic scroll benchmark keeps Lit host within the same DOM row ceiling gate as Angular host.
