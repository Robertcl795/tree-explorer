# td-tree-explorer

This workspace contains a framework-agnostic tree core and an Angular wrapper.

## Packages

- @tree-core: pure TypeScript tree engine, types, and utilities
- @tree-explorer: Angular 20 wrapper with virtual scroll and context menu rendering
- @lit-tree-explorer: Lit wrapper with virtualized rendering

## Data flow

```
Sources -> TreeAdapter -> TreeNode[] -> TreeEngine -> TreeRowViewModel[] -> TreeExplorerComponent
```

## Public API

- @tree-core exports the adapter contract, types, and TreeEngine
- @tree-explorer exports TreeExplorerComponent and event types
- @lit-tree-explorer exports the Lit web component

## Development

- Build: `npm run build`
- Test: `npm test`

See the package READMEs for detailed usage examples.
