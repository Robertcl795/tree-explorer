# Publishing to npm

## Package Strategy

### `@tree-core`
- Framework-agnostic engine and contracts.
- Exports only approved public APIs.

### `@tree-explorer`
- Angular host wrapper for `TreeExplorerComponent`.
- Re-exports only approved `@tree-core` contracts.

## Export Discipline

- Use explicit `exports` maps.
- Keep `index.ts` / `public-api.ts` as the only public entrypoints.
- Prevent deep-import dependency in docs and examples.
- Keep side-effects declarations accurate.

## Release Checklist

1. Build and type declarations
- [ ] Build succeeds for all published packages.
- [ ] `.d.ts` output aligns with documented public contracts.

2. API surface verification
- [ ] Adapter/config/events/commands/snapshot exports are intentional.
- [ ] No hidden or accidental exports.

3. Documentation alignment
- [ ] `README.md` points to canonical `docs/README.md`.
- [ ] Canonical docs reflect actual export surface.

4. Quality gates
- [ ] Vitest suites pass.
- [ ] Storybook harness scenarios pass.
- [ ] Performance gates pass.

5. Versioning and release notes
- [ ] Semver decision documented.
- [ ] Changelog entries describe API or behavior changes.

## Publish Gate Matrix

| Gate | Requirement |
|---|---|
| Build | Package builds with strict typing |
| API | Public exports match canonical docs |
| Tests | Core + integration + race suites pass |
| Performance | Threshold gates pass |
| Docs | Canonical docs complete and link-valid |
