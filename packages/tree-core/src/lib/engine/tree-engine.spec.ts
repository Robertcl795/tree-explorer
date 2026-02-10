import { TreeEngine } from './tree-engine';
import {
  DEFAULT_TREE_CONFIG,
  SELECTION_MODES,
  VIRTUALIZATION_MODES,
} from '../types/tree-config';
import { TreeAdapter } from '../types/tree-adapter';
import { TreeNode } from '../types/tree-node';

type Item = { id: string; label: string; disabled?: boolean };

const adapter: TreeAdapter<Item> = {
  getId: (source) => source.id,
  getLabel: (data) => data.label,
  isDisabled: (data) => !!data.disabled,
};

const node = (
  id: string,
  label: string,
  opts?: Partial<TreeNode<Item>>,
): TreeNode<Item> => ({
  id,
  level: 0,
  data: { id, label },
  isLeaf: true,
  childrenIds: [],
  ...opts,
});

describe('TreeEngine', () => {
  let engine: TreeEngine<Item>;

  beforeEach(() => {
    engine = new TreeEngine<Item>();
    engine.configure(DEFAULT_TREE_CONFIG);
  });

  it('initializes and flattens roots', () => {
    engine.init([node('a', 'A')]);
    const rows = engine.getVisibleRows(adapter, DEFAULT_TREE_CONFIG);
    expect(rows.map((row) => row.id)).toEqual(['a']);
  });

  it('expands nodes and requests lazy load', () => {
    engine.configure({ virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 32 } });
    engine.init([
      node('a', 'A', { isLeaf: false, childrenIds: undefined }),
    ]);

    const shouldLoad = engine.toggleExpand('a', true);
    expect(shouldLoad).toBe(true);
    expect(engine.loadingIds.has('a')).toBe(true);
  });

  it('marks children loaded', () => {
    engine.init([
      node('a', 'A', { isLeaf: false, childrenIds: undefined }),
    ]);

    engine.setChildrenLoaded('a', [
      node('b', 'B', { parentId: 'a', level: 1 }),
    ]);

    const rows = engine.getVisibleRows(adapter, DEFAULT_TREE_CONFIG);
    expect(rows.some((row) => row.id === 'b')).toBe(false);

    engine.toggleExpand('a', false);
    const expandedRows = engine.getVisibleRows(adapter, DEFAULT_TREE_CONFIG);
    expect(expandedRows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('handles selection modes', () => {
    engine.configure({ selection: { mode: SELECTION_MODES.SINGLE } });
    engine.init([node('a', 'A'), node('b', 'B')]);

    engine.selectToggle('a');
    engine.selectToggle('b');

    const rows = engine.getVisibleRows(adapter, DEFAULT_TREE_CONFIG);
    const selectedIds = rows.filter((row) => row.selected).map((row) => row.id);
    expect(selectedIds).toEqual(['b']);
  });

  it('selects all descendants when toggling an indeterminate parent', () => {
    engine.configure({ selection: { mode: SELECTION_MODES.MULTI, hierarchical: true } });
    engine.init([
      node('root', 'Root', { isLeaf: false, childrenIds: ['docs'] }),
      node('docs', 'Documents', { parentId: 'root', level: 1, isLeaf: false, childrenIds: ['d1', 'd2', 'd3'] }),
      node('d1', 'D1', { parentId: 'docs', level: 2 }),
      node('d2', 'D2', { parentId: 'docs', level: 2 }),
      node('d3', 'D3', { parentId: 'docs', level: 2 }),
    ]);

    engine.selectToggle('docs');
    engine.selectToggle('d2');

    const before = engine.getVisibleRows(adapter, DEFAULT_TREE_CONFIG);
    const docsBefore = before.find((row) => row.id === 'docs');
    expect(docsBefore?.indeterminate).toBe(true);

    engine.selectToggle('docs');

    const after = engine.getVisibleRows(adapter, DEFAULT_TREE_CONFIG);
    const docsAfter = after.find((row) => row.id === 'docs');
    expect(docsAfter?.selected).toBe(true);
    expect(docsAfter?.indeterminate).toBe(false);
    expect(after.find((row) => row.id === 'd1')?.selected).toBe(true);
    expect(after.find((row) => row.id === 'd2')?.selected).toBe(true);
    expect(after.find((row) => row.id === 'd3')?.selected).toBe(true);
  });

  it('expands ancestor path for a node', () => {
    engine.init([
      node('root', 'Root', { isLeaf: false, childrenIds: ['a'] }),
      node('a', 'A', { parentId: 'root', level: 1, isLeaf: false, childrenIds: ['b'] }),
      node('b', 'B', { parentId: 'a', level: 2 }),
    ]);

    engine.expandPath('b');
    expect(engine.expandedIds.has('root')).toBe(true);
    expect(engine.expandedIds.has('a')).toBe(true);
  });

  it('creates placeholders and replaces them when a page loads', () => {
    engine.init([
      node('parent', 'Parent', { isLeaf: false, childrenIds: undefined }),
    ]);
    engine.setPagination('parent', { enabled: true, pageSize: 2 });
    engine.markPageInFlight('parent', 0);

    engine.applyPagedChildren(
      'parent',
      { pageIndex: 0, pageSize: 2 },
      [
        node('c0', 'Child 0', { parentId: 'parent', level: 1 }),
        node('c1', 'Child 1', { parentId: 'parent', level: 1 }),
      ],
      5,
    );

    engine.toggleExpand('parent', false);
    const rows = engine.getVisibleRows(adapter, DEFAULT_TREE_CONFIG);

    expect(rows.map((row) => row.id)).toEqual([
      'parent',
      'c0',
      'c1',
      '__tree_placeholder__parent__2',
      '__tree_placeholder__parent__3',
      '__tree_placeholder__parent__4',
    ]);

    const placeholderRows = rows.filter((row) => row.placeholder);
    expect(placeholderRows.length).toBe(3);
    expect(placeholderRows.every((row) => row.disabled)).toBe(true);
  });

  it('ensures missing pages only for the requested range', () => {
    engine.init([
      node('parent', 'Parent', { isLeaf: false, childrenIds: undefined }),
    ]);
    engine.setPagination('parent', { enabled: true, pageSize: 10 });

    engine.applyPagedChildren(
      'parent',
      { pageIndex: 0, pageSize: 10 },
      Array.from({ length: 10 }, (_, i) =>
        node(`c-${i}`, `Child ${i}`, { parentId: 'parent', level: 1 }),
      ),
      100,
    );

    const pages = engine.ensureRangeLoaded('parent', { start: 45, end: 56 });
    expect(pages).toEqual([4, 5]);

    const duplicate = engine.ensureRangeLoaded('parent', { start: 45, end: 56 });
    expect(duplicate).toEqual([]);
  });

  it('marks placeholder rows with error state when a page fails', () => {
    engine.init([
      node('parent', 'Parent', { isLeaf: false, childrenIds: undefined }),
    ]);
    engine.setPagination('parent', { enabled: true, pageSize: 2 });

    engine.applyPagedChildren(
      'parent',
      { pageIndex: 0, pageSize: 2 },
      [
        node('c0', 'Child 0', { parentId: 'parent', level: 1 }),
        node('c1', 'Child 1', { parentId: 'parent', level: 1 }),
      ],
      6,
    );

    engine.toggleExpand('parent', false);
    engine.markPageInFlight('parent', 2);
    engine.setPageError('parent', 2, new Error('boom'));

    const rows = engine.getVisibleRows(adapter, DEFAULT_TREE_CONFIG);
    const failedRows = rows.filter((row) => row.placeholder && row.error);
    expect(failedRows.map((row) => row.placeholderIndex)).toEqual([4, 5]);
  });

  it('filters rows by query and keeps matching ancestors visible', () => {
    engine.init([
      node('root', 'Root', { isLeaf: false, childrenIds: ['docs', 'team'] }),
      node('docs', 'Documents', { parentId: 'root', level: 1, isLeaf: false, childrenIds: ['budget'] }),
      node('team', 'Team', { parentId: 'root', level: 1 }),
      node('budget', 'Budget FY26', { parentId: 'docs', level: 2 }),
    ]);
    engine.toggleExpand('root', false);
    engine.toggleExpand('docs', false);

    engine.setFilter('budget', adapter);
    const rows = engine.getFilteredFlatList(adapter, DEFAULT_TREE_CONFIG);

    expect(rows.map((row) => row.id)).toEqual(['root', 'docs', 'budget']);
  });

  it('supports adapter matches and highlight ranges', () => {
    const queryAdapter: TreeAdapter<Item> = {
      ...adapter,
      matches: (data, query) => {
        const text = query.text?.toLowerCase() ?? '';
        return data.label.toLowerCase().startsWith(text);
      },
      highlightRanges: (label, query) => {
        const text = query.text ?? '';
        return text
          ? [{ start: 0, end: Math.min(label.length, text.length) }]
          : [];
      },
    };

    engine.init([node('r1', 'Report')]);
    engine.setFilter({ text: 'rep', mode: 'contains' }, queryAdapter);
    const rows = engine.getFilteredFlatList(queryAdapter, DEFAULT_TREE_CONFIG);

    expect(rows.length).toBe(1);
    expect(rows[0]?.highlightRanges).toEqual([{ start: 0, end: 3 }]);
  });

  it('auto-expands matching ancestors when filtering config enables it', () => {
    engine.configure({
      filtering: {
        autoExpandMatches: true,
      },
    });
    engine.init([
      node('root', 'Root', { isLeaf: false, childrenIds: ['docs'] }),
      node('docs', 'Documents', { parentId: 'root', level: 1, isLeaf: false, childrenIds: ['budget'] }),
      node('budget', 'Budget FY26', { parentId: 'docs', level: 2 }),
    ]);

    engine.setFilter('budget', adapter);
    const rows = engine.getFilteredFlatList(adapter, DEFAULT_TREE_CONFIG);

    expect(rows.map((row) => row.id)).toEqual(['root', 'docs', 'budget']);
    expect(engine.expandedIds.has('root')).toBe(true);
    expect(engine.expandedIds.has('docs')).toBe(true);
  });

  it('clears hidden selection when selection policy is clearHidden', () => {
    engine.configure({
      selection: { mode: SELECTION_MODES.MULTI },
      filtering: {
        selectionPolicy: 'clearHidden',
      },
    });
    engine.init([
      node('root', 'Root', { isLeaf: false, childrenIds: ['a', 'b'] }),
      node('a', 'Alpha', { parentId: 'root', level: 1 }),
      node('b', 'Bravo', { parentId: 'root', level: 1 }),
    ]);
    engine.toggleExpand('root', false);
    engine.selectToggle('b');

    engine.setFilter('alpha', adapter);

    expect(Array.from(engine.selectedIds)).toEqual([]);
  });

  it('keeps legacy isVisible as the baseline visibility gate', () => {
    const guardedAdapter: TreeAdapter<Item> = {
      ...adapter,
      isVisible: (data) => data.id !== 'secret',
    };

    engine.init([
      node('public', 'Public File'),
      node('secret', 'Secret File'),
    ]);
    engine.setFilter('secret', guardedAdapter);

    const rows = engine.getFilteredFlatList(guardedAdapter, DEFAULT_TREE_CONFIG);
    expect(rows.map((row) => row.id)).toEqual([]);
  });
});
