# Storybook Guide

## Objective
Use Storybook as an implementation-verification harness for behavior, race handling, and scale.

## Scope Rules
- Stories pass only `adapter` + `config` + host callbacks.
- No story-specific behavior that bypasses engine flow.
- Focus on correctness and scale, not visual polish.

## Required Story Groups

### Scale stories
- `Tree/Scale/10k`
- `Tree/Scale/100k`
- `Tree/Scale/500k`

### Interaction stories
- `Tree/Interactions/Expansion`
- `Tree/Interactions/Selection`
- `Tree/Interactions/Filtering`
- `Tree/Interactions/Navigation`
- `Tree/Interactions/Pinned`
- `Tree/Interactions/ContextMenu`

### Race and stale-protection stories
- `Tree/Race/ViewportChurn`
- `Tree/Race/FilterDuringLoad`
- `Tree/Race/ExpandDuringLoad`

## Story Requirements

- Include config controls for virtualization, page-aware mode, selection, context menu, and pinned.
- Include fixed `itemSize` and overscan controls.
- Use synthetic adapters with parent-aware page requests.
- Include interaction `play` tests where possible.

## Architecture Enforcement in Stories

- Verify flow: intents -> component -> engine -> derived rows -> render.
- Verify adapter calls are command-driven.
- Verify `totalCount` + `rowAt(index)` rendering contract.
- Verify stale responses are ignored under race scenarios.

## Completion Checklist

- [ ] 10k/100k/500k stories run without invariant breaks.
- [ ] Interaction stories cover expansion, selection, filtering, navigation, pinned, context menu.
- [ ] Race stories demonstrate stale-discard correctness.
- [ ] Story interactions do not depend on non-canonical code paths.
