import { SELECTION_MODES } from '../types/tree-config';
import { TreeNode } from '../types/tree-node';
import { selectOne, selectToggle } from './selection';

type Item = { id: string; label: string; disabled?: boolean };

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

describe('selection module', () => {
  it('enforces single selection mode', () => {
    const nodes = new Map<string, TreeNode<Item>>([
      ['a', node('a', 'A')],
      ['b', node('b', 'B')],
    ]);

    const selected = selectToggle(
      { mode: SELECTION_MODES.SINGLE },
      nodes,
      new Set(['a']),
      'b',
    );

    expect(Array.from(selected ?? []).sort()).toEqual(['b']);
  });

  it('rejects disabled nodes for selectOne', () => {
    const nodes = new Map<string, TreeNode<Item>>([
      ['a', node('a', 'A', { disabled: true })],
    ]);

    const selected = selectOne(
      { mode: SELECTION_MODES.SINGLE },
      nodes,
      'a',
    );

    expect(selected).toBeNull();
  });
});
