# Performance Gates

Reference baseline: `docs/diagrams_angular.md`, `docs/ARCHITECTURE_OVERVIEW.md`.

## Goal
Enforce measurable, repeatable performance gates for virtualization and page-aware correctness up to 500,000 items.

## Gate Table
| Gate | Metric | Pass Threshold | Fail Threshold | Measurement Method |
|---|---|---|---|---|
| DOM ceiling | Rendered row elements | <= visibleRows + overscanRows + 2 spacers | Any sustained excess > 20% | Integration test DOM count assertions |
| Scroll handler cost | Main-thread work per scroll handling tick | <= 2 ms p95 | > 4 ms p95 | Instrumented scroll benchmark with performance marks |
| Engine dispatch latency | `dispatch()` duration | <= 2 ms p95, <= 5 ms p99 | > 5 ms p95 | Vitest micro-benchmark harness |
| `rowAt(index)` latency | Selector lookup at scale | <= 1 ms p95, <= 3 ms p99 | > 3 ms p95 | Selector micro-benchmark harness |
| Allocation pressure | Heap growth during sustained scroll | < 10% growth over 60s warm run | >= 20% growth | Browser memory snapshots and GC traces |
| GC guardrail | Long GC pause duration | < 16 ms p99 | >= 50 ms | Browser performance profile |
| 500k smoothness | Frame continuity during scripted scroll | >= 55 FPS p95 | < 45 FPS p95 | Puppeteer scripted trace + frame stats |

## Measurement Harness: Synthetic 500k Adapter

### Requirements
- Deterministic node IDs: `node-${globalIndex}`.
- Deterministic labels/icons from index.
- Deterministic child/page relationships from index math.
- Configurable page size and artificial latency knobs.

### Harness shape
```ts
export function createSyntheticAdapter(total = 500_000, pageSize = 200): TreeAdapter<SyntheticNode> {
  return {
    getId: (n) => n.id,
    getLabel: (n) => n.label,
    getIcon: (n) => (n.depth % 2 === 0 ? 'folder' : 'insert_drive_file'),
    getRoots: async () => [{ id: 'root-0', label: 'Root', depth: 0 }],
    getChildren: async (id) => makeChildrenFor(id, pageSize),
    loadPage: async (pageKey, filter) => makePage(pageKey, pageSize, total, filter),
    filterMatch: (n, q) => n.label.includes(q),
    resolvePath: async (targetId) => resolveSyntheticPath(targetId),
  };
}
```

## Benchmark Execution Steps
1. Start Storybook perf story using synthetic 500k adapter.
2. Run scripted scroll sequence.
3. Capture performance marks, frame data, and DOM counts.
4. Run randomized invalidation script: scroll bursts + filter changes + expand/collapse.
5. Assert no stale merge and no DOM explosion.

## Example Scripted Scroll Sequence
- Scroll top -> 25% -> 50% -> 75% -> 99% in 2-second intervals.
- Perform 20 rapid wheel bursts in middle range.
- Apply filter at 60% scroll and continue scrolling.
- Clear filter and return to 10%.

## Correctness Checks During Perf Run
- Page requests align to viewport-derived ranges.
- Duplicate page requests are absent for same epoch.
- Stale completion count is non-zero only when invalidations occur, and stale completions never mutate current snapshot.
- Selection and active row remain stable through range churn.

## Allocation and GC Guardrails
- Avoid per-scroll creation of large temporary arrays.
- Reuse small structs where practical in host runtime.
- Keep projection memory in normalized ID maps and compact relation tables.
- Verify no persistent allocation of full visible row arrays.

## PR Perf Regression Checklist
- [ ] Added or changed code includes updated perf notes.
- [ ] Micro-benchmark deltas included in PR summary.
- [ ] DOM ceiling assertion run on 10k, 100k, 500k stories.
- [ ] Scroll p95 work time and FPS metrics attached.
- [ ] No new allocation hotspot in profile flame graph.
- [ ] No regression in stale-merge correctness assertions.
