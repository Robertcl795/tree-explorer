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

  it('treats indeterminate parent toggle as check-all', () => {
    const tree = new Map<string, TreeUtilNode>([
      ['root', { id: 'root', parentId: null, childrenIds: ['docs'], level: 0 }],
      ['docs', { id: 'docs', parentId: 'root', childrenIds: ['d1', 'd2', 'd3'], level: 1 }],
      ['d1', { id: 'd1', parentId: 'docs', childrenIds: undefined, level: 2 }],
      ['d2', { id: 'd2', parentId: 'docs', childrenIds: undefined, level: 2 }],
      ['d3', { id: 'd3', parentId: 'docs', childrenIds: undefined, level: 2 }],
    ]);

    const afterSelectAllDocs = new Set<string>(['root', 'docs', 'd1', 'd2', 'd3']);
    const afterUnselectOneChild = toggleHierarchicalSelection('d2', tree, afterSelectAllDocs);
    const afterToggleDocs = toggleHierarchicalSelection('docs', tree, afterUnselectOneChild);

    expect(afterToggleDocs.has('docs')).toBe(true);
    expect(afterToggleDocs.has('d1')).toBe(true);
    expect(afterToggleDocs.has('d2')).toBe(true);
    expect(afterToggleDocs.has('d3')).toBe(true);
  });

  it('calculates indeterminate states', () => {
    const selected = new Set<string>(['b']);
    const state = calculateHierarchicalSelection(nodes, selected);
    expect(state.indeterminate.has('a')).toBe(true);
  });

  it('does not keep parent indeterminate when its only child is deselected', () => {
    const singleChildNodes = new Map<string, TreeUtilNode>([
      ['root', { id: 'root', parentId: null, childrenIds: ['child'], level: 0 }],
      ['child', { id: 'child', parentId: 'root', childrenIds: undefined, level: 1 }],
    ]);

    const selected = new Set<string>(['root']);
    const state = calculateHierarchicalSelection(singleChildNodes, selected);

    expect(state.selected.has('root')).toBe(false);
    expect(state.indeterminate.has('root')).toBe(false);
  });
});
