# Architecture

## Philosophy

1. Start from the data source and UX constraints.
2. Keep adapters responsible for domain projection and backend protocol details.
3. Keep `TreeEngine` responsible for state, flattening, and load orchestration.
4. Keep UI wrappers thin and deterministic.
5. Treat placeholders as first-class nodes for virtualization correctness.

## Component Diagram

```mermaid
flowchart LR
  subgraph App
    DS[Domain Data Source]
    ADP[TreeAdapter]
  end

  subgraph Core[@tree-core]
    ENG[TreeEngine]
    CFG[TreeConfig]
    TYPES[TreeNode / TreeRowViewModel]
  end

  subgraph Angular[@tree-explorer]
    C[TreeExplorerComponent]
    S[TreeStateService]
    R[TreeItemComponent]
    VS[CDK Virtual Scroll]
  end

  DS --> ADP
  ADP --> S
  CFG --> S
  S --> ENG
  ENG --> TYPES
  TYPES --> C
  C --> VS
  VS --> R
  C -->|container-level menu/actions| C
```

## I/O Contracts

- Input to wrappers:
  - `data`, `adapter`, `config`
- Input to engine:
  - mapped `TreeNode` graph, pagination metadata, expand/select/range events
- Output from engine:
  - `TreeRowViewModel[]`, loading/error/select state
- Output from wrappers:
  - UI interaction events for host application

## Adapter Boundaries

- Allowed in adapter:
  - backend request shapes
  - ID/label/icon mapping
  - pagination mode and page size
- Not allowed in adapter:
  - UI layout/state logic
- Not allowed in wrapper/core:
  - app-specific domain policy

## Sequence: Expand + Page-Aware Loading

```mermaid
sequenceDiagram
  participant U as User
  participant C as TreeExplorerComponent
  participant S as TreeStateService
  participant E as TreeEngine
  participant A as Adapter
  participant API as Backend API

  U->>C: Expand parent node
  C->>S: toggleExpand(row)
  S->>E: setPagination(parentId, pageSize)
  S->>E: toggleExpand(parentId, canLoadChildren)
  S->>E: markPageInFlight(parentId, 0)
  S->>A: loadChildren(parent, page 0)
  A->>API: GET /children?page=0&size=N
  API-->>A: items + X-Total-Count
  A-->>S: PageResult(items,totalCount)
  S->>E: applyPagedChildren(page0,totalCount)
  E-->>C: visible rows include placeholders

  C->>S: ensureRangeLoaded(start,end) on viewport range change
  S->>E: ensureRangeLoaded(parentId, childRange)
  E-->>S: missing page indices (deduped)
  loop per page
    S->>A: loadChildren(parent,pageK)
    A->>API: GET /children?page=K&size=N
    API-->>A: items + totalCount
    A-->>S: PageResult
    S->>E: applyPagedChildren(pageK)
  end
  E-->>C: placeholders replaced in-place
```

## TreeEngine API Map

```mermaid
flowchart TD
  A[init(nodes)] --> B[getVisibleRows]
  C[toggleExpand] --> D{children known?}
  D -- no --> E[mark loading]
  E --> F[wrapper loads children]
  F --> G[setChildrenLoaded]

  H[setPagination] --> I[markPageInFlight]
  I --> J[applyPagedChildren]
  J --> K[fixed-length childrenIds]
  K --> B

  L[ensureRangeLoaded] --> M[missing pages only]
  M --> I

  N[setPageError/clearPageError] --> B
  O[selection APIs] --> B
  P[expandPath] --> B
```

## Performance Design Rules

- Stable row IDs are mandatory.
- Placeholder nodes must be cheap and immutable by default.
- Range loading must dedupe in-flight requests by `(parentId,pageIndex)`.
- Virtualization uses fixed row heights and fixed-length lists to preserve scroll metrics.
