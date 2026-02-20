# Documentation Index

Use this sequence for implementation work. Each document has one responsibility and avoids overlap.

1. [`docs/ARCHITECTURE_OVERVIEW.md`](./ARCHITECTURE_OVERVIEW.md)
   Read first to lock the non-negotiable boundaries, invariants, and forbidden patterns before writing code.
2. [`docs/IMPLEMENTATION_GUIDE.md`](./IMPLEMENTATION_GUIDE.md)
   Use as the build order and PR boundary contract for criticality-first delivery (types -> engine -> host -> tests).
3. [`docs/ANGULAR_GUIDE.md`](./ANGULAR_GUIDE.md)
   Read when implementing the Angular host so intent wiring, command execution, and rendering stay architecture-compliant.
4. [`docs/TEST_PLAN_VITEST.md`](./TEST_PLAN_VITEST.md)
   Use during each implementation phase to add deterministic unit/integration/race tests with required coverage.
5. [`docs/PERFORMANCE_GATES.md`](./PERFORMANCE_GATES.md)
   Read before performance work and before merge to validate measurable virtualization and range-loading gates.
6. [`docs/STORYBOOK_GUIDE.md`](./STORYBOOK_GUIDE.md)
   Use when building the interactive verification harness for 10k/100k/500k scenarios and race stories.
7. [`docs/PUBLISHING_NPM.md`](./PUBLISHING_NPM.md)
   Use last to finalize package exports, build artifacts, and release readiness.
