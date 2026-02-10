import { TestBed } from '@angular/core/testing';
import {
  SELECTION_MODES,
  TreeAdapter,
  TreeConfig,
  TreePinnedEntry,
  TreePinnedStore,
} from '@tree-core';
import { TreeStateService } from './tree.service';

type Item = {
  id: string;
  name: string;
  children?: Item[];
};

const adapter: TreeAdapter<Item, Item> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getChildren: (data) => data.children,
};

const treeData: Item[] = [
  {
    id: 'root',
    name: 'Root',
    children: [{ id: 'child', name: 'Child' }],
  },
];

const flushMicrotasks = async (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('TreeStateService (Pinned)', () => {
  let service: TreeStateService<Item, Item>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TreeStateService],
    });

    service = TestBed.inject(TreeStateService<Item, Item>);
    service.setAdapter(adapter);
    service.setSources(treeData);
  });

  it('infers pinned feature enabled for legacy ids config', () => {
    service.setConfig({
      selection: { mode: SELECTION_MODES.SINGLE },
      pinned: {
        ids: ['child'],
      },
    } as TreeConfig<Item>);

    expect(service.pinnedConfig().enabled).toBeTrue();
    expect(service.pinnedItems().map((item) => item.entry.nodeId)).toEqual(['child']);
  });

  it('loads pinned entries from store on config initialization', async () => {
    const store: TreePinnedStore<Item> = {
      loadPinned: async () => [
        {
          entryId: 'pin-root',
          nodeId: 'root',
          order: 0,
        },
      ],
    };

    service.setConfig({
      pinned: {
        enabled: true,
        store,
      },
    } as TreeConfig<Item>);

    await flushMicrotasks();

    expect(service.pinnedEntries().map((entry) => entry.entryId)).toEqual([
      'pin-root',
    ]);
  });

  it('pins and unpins through store hooks', async () => {
    const calls: string[] = [];
    const store: TreePinnedStore<Item> = {
      addPinned: async (node) => {
        calls.push(`add:${node.id}`);
        return {
          entryId: `pin-${node.id}`,
          nodeId: node.id,
          order: 0,
        };
      },
      removePinned: async (entry) => {
        calls.push(`remove:${entry.entryId}`);
      },
    };

    service.setConfig({
      pinned: {
        enabled: true,
        store,
      },
    } as TreeConfig<Item>);

    const didPin = await service.pinNode('root');
    expect(didPin).toBeTrue();
    expect(service.pinnedEntries().some((entry) => entry.nodeId === 'root')).toBeTrue();

    const rootEntry = service.pinnedEntries().find((entry) => entry.nodeId === 'root');
    expect(rootEntry).toBeDefined();

    const didUnpin = await service.unpinEntry(rootEntry!.entryId);
    expect(didUnpin).toBeTrue();
    expect(service.pinnedEntries().some((entry) => entry.nodeId === 'root')).toBeFalse();
    expect(calls).toEqual(['add:root', `remove:${rootEntry!.entryId}`]);
  });

  it('reorders pinned entries and calls store.reorderPinned', async () => {
    const reorderCalls: TreePinnedEntry[][] = [];
    const store: TreePinnedStore<Item> = {
      reorderPinned: async (entries) => {
        reorderCalls.push(entries.map((entry) => ({ ...entry })));
      },
    };

    service.setConfig({
      pinned: {
        enabled: true,
        store,
        entries: [
          { entryId: 'entry-a', nodeId: 'root', order: 0 },
          { entryId: 'entry-b', nodeId: 'child', order: 1 },
        ],
      },
    } as TreeConfig<Item>);

    const changed = await service.reorderPinned(0, 1);

    expect(changed).toBeTrue();
    expect(service.pinnedEntries().map((entry) => entry.entryId)).toEqual([
      'entry-b',
      'entry-a',
    ]);
    expect(reorderCalls.length).toBe(1);
    expect(reorderCalls[0]?.map((entry) => entry.entryId)).toEqual([
      'entry-b',
      'entry-a',
    ]);
  });
});
