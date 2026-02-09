import {
  TreeUtilNode,
  calculateHierarchicalSelection,
  flattenTree,
  getAncestorIds,
  getDescendantIds,
  getSelectionRange,
  toggleHierarchicalSelection,
} from './tree-utils';

describe('tree-utils', () => {
  let nodes: Map<string, TreeUtilNode>;

  beforeEach(() => {
    nodes = new Map([
      ['root', { id: 'root', parentId: null, childrenIds: ['a'], level: 0 }],
      ['a', { id: 'a', parentId: 'root', childrenIds: ['b', 'c'], level: 1 }],
      ['b', { id: 'b', parentId: 'a', childrenIds: undefined, level: 2 }],
      ['c', { id: 'c', parentId: 'a', childrenIds: undefined, level: 2 }],
    ]);
  });

  it('flattens nodes using expansion state', () => {
    const collapsed = flattenTree(nodes, new Set());
    expect(collapsed.map((n) => n.id)).toEqual(['root']);

    const expanded = flattenTree(nodes, new Set(['root', 'a']));
    expect(expanded.map((n) => n.id)).toEqual(['root', 'a', 'b', 'c']);
  });

  it('gets descendant ids', () => {
    expect(getDescendantIds('root', nodes)).toEqual(['a', 'b', 'c']);
    expect(getDescendantIds('b', nodes)).toEqual([]);
  });

  it('gets ancestor ids', () => {
    expect(getAncestorIds('c', nodes)).toEqual(['root', 'a']);
    expect(getAncestorIds('root', nodes)).toEqual([]);
  });

  it('calculates selection range', () => {
    const flattened = flattenTree(nodes, new Set(['root', 'a']));
    const range = getSelectionRange('a', 'c', flattened);
    expect(range).toEqual(['a', 'b', 'c']);
  });

  it('toggles hierarchical selection', () => {
    const selected = new Set<string>();
    const toggled = toggleHierarchicalSelection('a', nodes, selected);
    expect(Array.from(toggled)).toEqual(['a', 'b', 'c']);
  });

  it('calculates indeterminate states', () => {
    const selected = new Set<string>(['b']);
    const state = calculateHierarchicalSelection(nodes, selected);
    expect(state.indeterminate.has('a')).toBe(true);
  });
});

