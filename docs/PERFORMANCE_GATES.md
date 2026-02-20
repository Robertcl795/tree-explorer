# Performance Gates

## Goal
Enforce measurable performance and correctness thresholds for virtualization and page-aware range loading at scale.

## Gate Table
| Gate | Metric | Pass Threshold | Fail Threshold | Verification |
|---|---|---|---|---|
| DOM ceiling | Rendered row elements | <= visible + overscan + spacers | Sustained excess > 20% | Integration DOM assertions |
| Engine dispatch latency | `dispatch()` duration | <= 2 ms p95, <= 5 ms p99 | > 5 ms p95 | Engine benchmark tests |
| Selector latency | `rowAt(index)` lookup | <= 1 ms p95, <= 3 ms p99 | > 3 ms p95 | Selector benchmark tests |
| Range-loading correctness | Needed page coverage | 0 missed visible pages | Any missed visible page | Paging correctness suites |
| Request dedupe | Duplicate page requests | 0 duplicates per `(epoch,parentId,pageIndex,pageSize)` | Any duplicate | Race/integration suites |
| Stale safety | Stale completion merges | 100% rejected | Any stale merge | Race suites |
| 500k smoothness | Scripted scroll continuity | >= 55 FPS p95 | < 45 FPS p95 | Browser trace harness |

## Synthetic Adapter Requirements

- Deterministic IDs and labels.
- Deterministic root and child pagination behavior.
- Parent-aware page request support: `{ parentId|null, pageIndex, pageSize }`.
- Configurable latency knobs for race simulation.

## Benchmark Scenarios

1. 10k baseline scroll and interaction run.
2. 100k stress run with rapid range changes.
3. 500k sustained run with mixed expand/filter/scroll churn.

## Correctness During Perf Runs

- Viewport-derived pages are requested accurately.
- No duplicate page requests for identical parent-aware keys.
- Stale responses never alter canonical state.
- Selection and active row state remain stable during churn.

## Regression Checklist

- [ ] All performance thresholds pass.
- [ ] Range-loading correctness remains intact at each scale tier.
- [ ] No memory leak trend under repeated scroll cycles.
