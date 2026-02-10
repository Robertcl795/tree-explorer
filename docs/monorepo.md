# Monorepo Workflow

This workspace is configured for a single root entrypoint using `pnpm` workspaces.

## Goals

- Single install entrypoint: run `pnpm install` at repo root.
- Single script entrypoint: run `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm storybook` from repo root.
- Consistent dependency graph and lockfile behavior.
- Workspace orchestration with `pnpm -r` and `--filter`.
- Explicit platform baseline: Angular `19.2.x` across workspace packages.

## Workspace Layout

- Root workspace file: `pnpm-workspace.yaml`
- Packages included: `packages/*`

## Install Strategy

Root `.npmrc` is set to:

```ini
node-linker=hoisted
shared-workspace-lockfile=true
strict-peer-dependencies=true
auto-install-peers=false
prefer-workspace-packages=true
save-workspace-protocol=rolling
```

Rationale:

- `node-linker=hoisted` gives a more single-project-like `node_modules` layout while still using pnpm’s content-addressed store.
- `shared-workspace-lockfile=true` keeps one lockfile for deterministic CI.
- `strict-peer-dependencies=true` catches dependency contract drift early.

## Platform Baseline

- Angular baseline: `19.2.x`
- Node baseline: `>=18`
- pnpm baseline: `9.x`

Upgrade policy:

1. Keep docs and package manifests aligned with baseline version.
2. Evaluate Angular 20 stable APIs in controlled branches first.
3. Promote baseline only after `typecheck`, `storybook:build`, and docs checks pass.

## Root Scripts

- `pnpm build`
  - Builds workspace in dependency order (`@tree-core` then `@tree-explorer`).
- `pnpm build:lit`
  - Optional build hook for `@lit-tree-explorer` POC.
- `pnpm test`
  - Runs unit tests for Angular packages.
- `pnpm lint`
  - Runs package lint scripts when present.
- `pnpm typecheck`
  - Runs package type checks.
- `pnpm storybook`
  - Runs Storybook for `@tree-explorer`.
- `pnpm storybook:build`
  - Builds Storybook for `@tree-explorer`.
- `pnpm storybook:lit`
  - Runs Lit Storybook.
- `pnpm storybook:build:lit`
  - Builds Lit Storybook.
- `pnpm clean`
  - Cleans dist and workspace artifacts.

## Package Script Model

Each package exposes package-local scripts (`build`, `test`, `typecheck`, etc.), but root scripts are the canonical entrypoint.

## CI Commands

Use these from a fresh clone:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm storybook:build
```

If the CI image has no Chrome binary, either install Chrome/Chromium or skip `pnpm test` in that environment.

If Lit Storybook is included in CI:

```bash
pnpm storybook:build:lit
```

## Notes

- This setup intentionally avoids introducing Nx/Turbo by default.
- If task caching is later required, it can be added without changing the root command contract.
