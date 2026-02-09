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
});
