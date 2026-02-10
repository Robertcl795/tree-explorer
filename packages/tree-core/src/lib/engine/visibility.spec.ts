import { TreeAdapter } from '../types/tree-adapter';
import { TreeNode } from '../types/tree-node';
import { DEFAULT_TREE_FILTERING_CONFIG } from '../types/tree-filter';
import { createInitialTreeState } from './utils';
import { buildProjection, resolveIsLeaf } from './visibility';

type Item = { id: string; label: string; type?: 'file' | 'folder' };

const node = (
  id: string,
  label: string,
  opts?: Partial<TreeNode<Item>>,
): TreeNode<Item> => ({
  id,
  level: 0,
  data: { id, label },
  childrenIds: undefined,
  ...opts,
});

const baseAdapter: TreeAdapter<Item> = {
  getId: (source) => source.id,
  getLabel: (data) => data.label,
};

describe('visibility module', () => {
  it('gives adapter.isLeaf precedence over node.isLeaf', () => {
    const adapter: TreeAdapter<Item> = {
      ...baseAdapter,
      isLeaf: () => false,
    };

    const result = resolveIsLeaf(
      adapter,
      node('doc', 'Doc', { isLeaf: true }),
    );

    expect(result).toBe(false);
  });

  it('projects visible rows with placeholder-safe defaults', () => {
    const state = createInitialTreeState<Item>();
    state.nodes.set(
      'root',
      node('root', 'Root', { isLeaf: false, childrenIds: ['child'] }),
    );
    state.nodes.set(
      'child',
      node('child', 'Child', { parentId: 'root', level: 1, isLeaf: true, childrenIds: [] }),
    );
    state.expanded.add('root');

    const projection = buildProjection({
      state,
      pagedChildren: new Map(),
      adapter: baseAdapter,
      config: {},
      flattened: [
        { id: 'root', level: 0, childrenIds: ['child'], isVisible: true },
        { id: 'child', parentId: 'root', level: 1, childrenIds: [], isVisible: true },
      ],
      filterQuery: null,
      filterConfig: {
        ...DEFAULT_TREE_FILTERING_CONFIG,
      },
    });

    expect(projection.orderedIds).toEqual(['root', 'child']);
    expect(projection.rowsById.get('child')?.isLeaf).toBe(true);
    expect(projection.rowsById.get('root')?.expanded).toBe(true);
  });
});
