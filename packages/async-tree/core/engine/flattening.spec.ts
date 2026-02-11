import { createFlattenedNodesCache, getFlattenedNodesCached } from './flattening';
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

describe('flattening module', () => {
  it('reuses flattened result when node and expansion references are unchanged', () => {
    const nodes = new Map<string, TreeNode<Item>>([
      ['root', node('root', 'Root', { isLeaf: false, childrenIds: ['child'] })],
      ['child', node('child', 'Child', { parentId: 'root', level: 1 })],
    ]);
    const expanded = new Set<string>(['root']);
    const cache = createFlattenedNodesCache<Item>();

    const first = getFlattenedNodesCached(nodes, expanded, cache);
    const second = getFlattenedNodesCached(nodes, expanded, cache);

    expect(second).toBe(first);
    expect(second.map((entry) => entry.id)).toEqual(['root', 'child']);
  });

  it('recomputes when expansion reference changes', () => {
    const nodes = new Map<string, TreeNode<Item>>([
      ['root', node('root', 'Root', { isLeaf: false, childrenIds: ['child'] })],
      ['child', node('child', 'Child', { parentId: 'root', level: 1 })],
    ]);
    const cache = createFlattenedNodesCache<Item>();

    const collapsed = getFlattenedNodesCached(nodes, new Set(), cache);
    const expanded = getFlattenedNodesCached(nodes, new Set(['root']), cache);

    expect(expanded).not.toBe(collapsed);
    expect(collapsed.map((entry) => entry.id)).toEqual(['root']);
    expect(expanded.map((entry) => entry.id)).toEqual(['root', 'child']);
  });
});
