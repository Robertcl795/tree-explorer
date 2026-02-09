# Tree Explorer Build & Distribution Guide

## 📦 Building the Library

### Prerequisites
- Node.js 18.19+
- Angular CLI 17+
- NPM or Yarn

### Build Commands

```bash
# Build the library
ng build tree-explorer

# Build with production optimizations
ng build tree-explorer --configuration production

# Build Storybook
ng run tree-explorer:build-storybook
```

### Build Output

The build creates the following structure in `dist/tree-explorer/`:

```
dist/tree-explorer/
├── index.d.ts              # Main type definitions
├── package.json            # Package configuration
├── README.md               # Documentation
├── lib/                    # Compiled library
│   ├── components/         # Component exports
│   ├── services/           # Service exports
│   ├── adapters/           # Adapter exports
│   ├── types/              # Type exports
│   └── tree-explorer.module.d.ts
├── esm2022/               # ES modules
├── fesm2022/              # Flat ES modules
└── bundles/               # UMD bundles
```

## 🚀 Publishing to NPM

### Preparation

1. **Update version** in `package.json`:
```json
{
  "version": "1.0.0"
}
```

2. **Build the library**:
```bash
ng build tree-explorer
```

3. **Navigate to dist folder**:
```bash
cd dist/tree-explorer
```

### Publishing

```bash
# Login to NPM (first time only)
npm login

# Publish to NPM
npm publish

# Publish with tag (for beta/alpha versions)
npm publish --tag beta
```

### Publishing Checklist

- [ ] All tests pass
- [ ] Documentation is updated
- [ ] Version number is incremented
- [ ] CHANGELOG.md is updated
- [ ] No lint errors
- [ ] Storybook builds successfully
- [ ] All public APIs are exported
- [ ] README is comprehensive

## 📋 Distribution Files

### Core Exports

| Export | Description | Usage |
|--------|-------------|-------|
| `TreeExplorerComponent` | Main tree component | Templates |
| `TreeItemComponent` | Individual tree item | Templates |
| `TreeExplorerModule` | NgModule wrapper | Module imports |
| `ObjectTreeAdapter` | Generic adapter | Data conversion |
| `BaseTreeAdapter` | Adapter base class | Custom adapters |
| `TreeStateService` | State management | Services |

### Type Definitions

All interfaces and types are exported:
- `TreeItem<T>`
- `FlatTreeItem<T>`
- `TreeConfig`
- `TreeContextMenuAction<T>`
- `TreeItemEvent<T>`
- `TreeSelectionEvent<T>`

### Bundle Sizes

| Bundle | Size (gzipped) | Description |
|--------|----------------|-------------|
| UMD | ~45KB | For script tags |
| ESM | ~35KB | For modern bundlers |
| Tree-shaken | ~15KB | Minimal usage |

## 🎯 Integration Testing

### Test Different Consumers

1. **Standalone Angular App**:
```typescript
import { TreeExplorerComponent } from 'tree-explorer';
```

2. **NgModule Angular App**:
```typescript
import { TreeExplorerModule } from 'tree-explorer';
```

3. **Angular Library**:
```typescript
// peerDependencies setup
export * from 'tree-explorer';
```

### Compatibility Matrix

| Angular Version | Supported | Notes |
|----------------|-----------|-------|
| 17.x | ✅ | Full support |
| 18.x | ✅ | Full support |
| 19.x | ✅ | Full support |
| 16.x | ❌ | Use v0.x |
| 15.x | ❌ | Use v0.x |

## 🔧 Troubleshooting Builds

### Common Issues

1. **"Cannot resolve dependency"**
   - Check peer dependencies
   - Verify Angular Material is installed

2. **"Type errors in stories"**
   - Exclude stories from lib build
   - Use proper TypeScript configuration

3. **"Bundle too large"**
   - Enable tree-shaking
   - Check for circular dependencies
   - Optimize imports

### Build Optimization

```json
// angular.json optimizations
{
  "projects": {
    "tree-explorer": {
      "architect": {
        "build": {
          "options": {
            "optimization": true,
            "sourceMap": false,
            "namedChunks": false,
            "extractLicenses": true,
            "vendorChunk": false,
            "buildOptimizer": true
          }
        }
      }
    }
  }
}
```

## 📊 Quality Gates

### Pre-publish Checklist

- [ ] All unit tests pass (`ng test`)
- [ ] No TypeScript errors (`ng build`)
- [ ] Storybook builds (`ng run tree-explorer:build-storybook`)
- [ ] No circular dependencies
- [ ] Bundle analyzer shows reasonable size
- [ ] All public APIs documented
- [ ] Breaking changes noted in CHANGELOG
