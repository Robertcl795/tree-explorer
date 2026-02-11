import { TreeNode } from '../types/tree-node';
import { createInitialTreeState } from './utils';
import { expandAncestorPath, toggleExpandState } from './expansion';

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

describe('expansion module', () => {
  it('marks node loading when expanding unresolved lazy node', () => {
    const state = createInitialTreeState<Item>();
    state.nodes.set(
      'a',
      node('a', 'A', { isLeaf: false, childrenIds: undefined }),
    );

    const result = toggleExpandState(state, 'a', true);

    expect(result.shouldLoadChildren).toBe(true);
    expect(result.nextState.expanded.has('a')).toBe(true);
    expect(result.nextState.loading.has('a')).toBe(true);
  });

  it('expands all loaded ancestors for path navigation', () => {
    const state = createInitialTreeState<Item>();
    state.nodes.set(
      'root',
      node('root', 'Root', { isLeaf: false, childrenIds: ['a'] }),
    );
    state.nodes.set(
      'a',
      node('a', 'A', { parentId: 'root', level: 1, isLeaf: false, childrenIds: ['b'] }),
    );
    state.nodes.set('b', node('b', 'B', { parentId: 'a', level: 2 }));

    const nextState = expandAncestorPath(state, 'b');
    expect(nextState.expanded.has('root')).toBe(true);
    expect(nextState.expanded.has('a')).toBe(true);
  });
});
