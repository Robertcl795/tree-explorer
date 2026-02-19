# Publishing to npm

Reference baseline: `docs/diagrams_angular.md`, `docs/ARCHITECTURE_OVERVIEW.md`, `docs/PERFORMANCE_GATES.md`.

## Package Strategy

### `@tree-core`
- Pure TypeScript.
- Framework-agnostic.
- Exports only engine API, contracts, selectors, and types.
- No Angular/Lit imports.

### `@tree-explorer` (Angular wrapper)
- Wraps `@tree-core` in `TreeExplorerComponent`.
- Declares Angular and RxJS as peer dependencies.
- Exposes only public Angular component APIs and approved type re-exports.

### Optional `@tree-explorer/lit` package
- Separate wrapper package for Lit host glue.
- Depends on `@tree-core`.
- No Angular transitive dependencies.

## Build and Export Rules
- Use explicit `exports` map for all packages.
- Emit ESM + type declarations.
- Prevent deep-import reliance on internal files.
- Keep sideEffects declarations accurate for tree shaking.

## Recommended `package.json` Direction

### `@tree-core`
- `name`: `@tree-core`
- `type`: `module`
- `main`: `./dist/index.js`
- `types`: `./dist/index.d.ts`
- `exports`: `.` only plus approved subpath exports.

### `@tree-explorer`
- `name`: `@tree-explorer`
- `peerDependencies`: `@angular/core`, `@angular/common`, `rxjs`, `@tree-core`
- `exports`: root entry only, optional testing utilities subpath.

## Release Checklist

### SemVer policy
- Patch: internal fixes without API changes.
- Minor: backward-compatible public API additions.
- Major: breaking API or behavioral contract changes.

### Changelog requirements
- Include package-wise entries.
- Include migration notes for any breaking changes.
- Include architecture-impact summary when behavior changes.

### API stability checklist
- [ ] Public exports reviewed against previous release.
- [ ] Removed symbols flagged as breaking changes.
- [ ] Event/command union changes documented.
- [ ] Adapter contract changes documented with migration examples.

### Build artifact validation
- [ ] `pnpm -r build` passes.
- [ ] `npm pack --dry-run` passes for each package.
- [ ] Dist output contains `.js`, `.d.ts`, source maps where required.
- [ ] No private/internal files included in tarball.

### Tree-shaking validation (outline)
- Build a sample app importing only one selector/type.
- Verify unused modules are dropped in production build.
- Confirm no wrapper side-effects force full bundle retention.

### License and README requirements
- [ ] Package includes license reference.
- [ ] README has install, minimal usage, adapter contract, config toggles, and troubleshooting.
- [ ] README includes architecture flow and non-negotiable invariants.

## Publish Gate Matrix
| Gate | Required |
|---|---|
| Unit and integration tests | Yes |
| Storybook build | Yes |
| Perf gates including 500k harness | Yes |
| API diff review | Yes |
| Changelog and migration notes | Yes |
| `npm pack --dry-run` | Yes |

## Release Flow
1. Freeze release candidate branch and rerun full CI.
2. Run version bump via changesets or release tooling.
3. Generate changelog and validate API diff.
4. Publish `@tree-core` first.
5. Publish `@tree-explorer` next.
6. Publish optional Lit wrapper package last.
7. Tag release and publish release notes.

## Success Checkpoints
- `npm pack --dry-run` produces clean tarballs for all publishable packages.
- Public API diff has 0 untracked breaking changes at release cut.
- Performance gates from `docs/PERFORMANCE_GATES.md` are green for the release candidate.
