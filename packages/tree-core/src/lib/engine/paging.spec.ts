import {
  applyPagedChildrenState,
  ensureRangeLoadedPages,
  markPageInFlightState,
  primePagedPlaceholdersState,
  setPaginationConfig,
} from './paging';
import { createInitialTreeState } from './utils';
import { TreePagedNodeState, TreeState } from './types';
import { TreeNode } from '../types/tree-node';

type Item = { id: string; label: string };

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

function createState(): {
  state: TreeState<Item>;
  pagedChildren: Map<string, TreePagedNodeState>;
} {
  const state = createInitialTreeState<Item>();
  state.nodes.set(
    'parent',
    node('parent', 'Parent', { isLeaf: false, childrenIds: undefined }),
  );
  const pagedChildren = new Map<string, TreePagedNodeState>();
  setPaginationConfig(pagedChildren, 'parent', {
    enabled: true,
    pageSize: 2,
    pageIndexing: 'zero-based',
  });
  return { state, pagedChildren };
}

describe('paging module', () => {
  it('loads only missing pages for requested range', () => {
    const { state, pagedChildren } = createState();
    const pagedState = pagedChildren.get('parent');
    expect(pagedState).toBeDefined();
    if (!pagedState) {
      return;
    }

    pagedState.totalCount = 100;
    let nextState = state;
    const mark0 = markPageInFlightState(nextState, pagedChildren, 'parent', 0);
    nextState = mark0.nextState;

    const result = ensureRangeLoadedPages(
      nextState,
      pagedChildren,
      'parent',
      { start: 45, end: 56 },
    );

    expect(result.pagesToLoad).toEqual([4, 5]);
  });

  it('patches only requested page slots while keeping existing loaded children', () => {
    const { state, pagedChildren } = createState();
    let nextState = state;

    nextState = applyPagedChildrenState(
      nextState,
      pagedChildren,
      'parent',
      { pageIndex: 0, pageSize: 2 },
      [
        node('c0', 'Child 0', { parentId: 'parent', level: 1 }),
        node('c1', 'Child 1', { parentId: 'parent', level: 1 }),
      ],
      6,
      [
        node('c0', 'Child 0', { parentId: 'parent', level: 1 }),
        node('c1', 'Child 1', { parentId: 'parent', level: 1 }),
      ],
    );

    nextState = applyPagedChildrenState(
      nextState,
      pagedChildren,
      'parent',
      { pageIndex: 2, pageSize: 2 },
      [
        node('c4', 'Child 4', { parentId: 'parent', level: 1 }),
        node('c5', 'Child 5', { parentId: 'parent', level: 1 }),
      ],
      6,
      [
        node('c4', 'Child 4', { parentId: 'parent', level: 1 }),
        node('c5', 'Child 5', { parentId: 'parent', level: 1 }),
      ],
    );

    const parent = nextState.nodes.get('parent');
    expect(parent?.childrenIds).toEqual([
      'c0',
      'c1',
      '__tree_placeholder__parent__2',
      '__tree_placeholder__parent__3',
      'c4',
      'c5',
    ]);
  });

  it('creates deterministic placeholder slots from an initial total count hint', () => {
    const { state, pagedChildren } = createState();
    const nextState = primePagedPlaceholdersState(
      state,
      pagedChildren,
      'parent',
      4,
    );
    const parent = nextState.nodes.get('parent');
    expect(parent?.childrenIds).toEqual([
      '__tree_placeholder__parent__0',
      '__tree_placeholder__parent__1',
      '__tree_placeholder__parent__2',
      '__tree_placeholder__parent__3',
    ]);
  });
});
