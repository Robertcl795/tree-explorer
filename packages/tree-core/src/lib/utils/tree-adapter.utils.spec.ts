import { createTreeNode, mapSourcesToNodes } from './tree-adapter.utils';
import { TreeAdapter } from '../types/tree-adapter';

interface Source {
  id: string;
  name: string;
  disabled?: boolean;
}

describe('tree-adapter.utils', () => {
  it('uses adapter.transform when provided', () => {
    const adapter: TreeAdapter<Source, Source> = {
      getId: (source) => source.id,
      getLabel: (data) => data.name,
      transform: (source, ctx, data) => ({
        id: `node-${source.id}`,
        parentId: ctx.parentId,
        level: ctx.level,
        data,
        isLeaf: true,
      }),
    };

    const node = createTreeNode(adapter, { id: 'a', name: 'A' }, { parentId: null, level: 0 });

    expect(node.id).toBe('node-a');
    expect(node.level).toBe(0);
  });

  it('maps sources to nodes with disabled flag', () => {
    const adapter: TreeAdapter<Source, Source> = {
      getId: (source) => source.id,
      getLabel: (data) => data.name,
      isDisabled: (data) => !!data.disabled,
    };

    const nodes = mapSourcesToNodes(adapter, [
      { id: 'a', name: 'A', disabled: true },
      { id: 'b', name: 'B' },
    ]);

    expect(nodes[0].disabled).toBe(true);
    expect(nodes[1].disabled).toBe(false);
  });
});

