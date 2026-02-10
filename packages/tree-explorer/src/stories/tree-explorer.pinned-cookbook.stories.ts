import { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import {
  SELECTION_MODES,
  TREE_DENSITY,
  TreeAdapter,
  TreeConfig,
  TreePinnedEntry,
  TreePinnedStore,
  VIRTUALIZATION_MODES,
} from '@tree-core';
import { TreeExplorerComponent } from '../public-api';

type PinnedNode = {
  id: string;
  name: string;
  icon?: string;
  children?: PinnedNode[];
};

const data: PinnedNode[] = [
  {
    id: 'workspace',
    name: 'Workspace',
    icon: 'folder',
    children: [
      {
        id: 'documents',
        name: 'Documents',
        icon: 'folder_open',
        children: [
          { id: 'budget-fy26', name: 'Budget FY26.xlsx', icon: 'description' },
          { id: 'budget-fy27', name: 'Budget FY27.xlsx', icon: 'description' },
          { id: 'audit-log', name: 'Audit Log.md', icon: 'article' },
        ],
      },
      {
        id: 'teams',
        name: 'Teams',
        icon: 'group',
        children: [
          { id: 'team-radar', name: 'Team Radar', icon: 'insights' },
          { id: 'oncall-rotation', name: 'On-call Rotation', icon: 'schedule' },
        ],
      },
    ],
  },
];

const adapter: TreeAdapter<PinnedNode, PinnedNode> = {
  getId: (source) => source.id,
  getLabel: (dataItem) => dataItem.name,
  getChildren: (dataItem) => dataItem.children,
  getIcon: (dataItem) => dataItem.icon,
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const renderCookbook = (args: any) => {
  const persistedState = {
    nextId: 200,
    entries: [
      { entryId: 'pin-100', nodeId: 'audit-log', label: 'Audit Log.md', icon: 'article', order: 0 },
      { entryId: 'pin-101', nodeId: 'team-radar', label: 'Team Radar', icon: 'insights', order: 1 },
    ] as TreePinnedEntry[],
    calls: [] as string[],
  };

  const props: any = {
    ...args,
    filterQuery: args.filterQuery ?? '',
    selectedNodeIds: [] as string[],
    storeCalls: [] as string[],
    persistedPinnedSnapshot: [] as string[],
  };

  const syncDebug = () => {
    props.persistedPinnedSnapshot = [...persistedState.entries]
      .sort((left, right) => left.order - right.order)
      .map((entry) => `${entry.entryId} -> ${entry.nodeId} (order ${entry.order})`);
    props.storeCalls = [...persistedState.calls];
  };

  const recordCall = (message: string) => {
    persistedState.calls.push(message);
    syncDebug();
  };

  const pinnedStore: TreePinnedStore<PinnedNode> = {
    loadPinned: async () => {
      recordCall('GET /pinned');
      await delay(80);
      return [...persistedState.entries]
        .sort((left, right) => left.order - right.order)
        .map((entry) => ({ ...entry }));
    },
    addPinned: async (node) => {
      recordCall(`POST /pinned nodeId=${node.id}`);
      await delay(60);
      const persisted: TreePinnedEntry = {
        entryId: `pin-${persistedState.nextId++}`,
        nodeId: node.id,
        label: node.data.name,
        icon: node.data.icon,
        order: persistedState.entries.length,
      };
      persistedState.entries = [...persistedState.entries, persisted];
      syncDebug();
      return persisted;
    },
    removePinned: async (entry) => {
      recordCall(`DELETE /pinned/${entry.entryId}`);
      await delay(50);
      persistedState.entries = persistedState.entries
        .filter((candidate) => candidate.entryId !== entry.entryId)
        .map((candidate, index) => ({ ...candidate, order: index }));
      syncDebug();
    },
    reorderPinned: async (entries) => {
      recordCall(
        `POST /pinned/reorder [${entries.map((entry) => entry.entryId).join(', ')}]`,
      );
      await delay(40);
      persistedState.entries = entries.map((entry, index) => ({
        ...entry,
        order: index,
      }));
      syncDebug();
    },
  };

  props.onSelectionChange = (event: any) => {
    props.selectedNodeIds = event.nodes.map((node: any) => node.id);
  };

  props.storyConfig = {
    ...args.config,
    pinned: {
      enabled: true,
      label: 'Pinned',
      dnd: { enabled: true },
      store: pinnedStore,
      onNavigate: (nodeId: string) => recordCall(`NAVIGATE nodeId=${nodeId}`),
      contextActions: [
        {
          id: 'inspect-pinned',
          label: (item: PinnedNode) => `Inspect ${item.name}`,
          icon: () => 'info',
        },
      ],
    },
  } satisfies Partial<TreeConfig<PinnedNode>>;

  syncDebug();

  return {
    props,
    template: `
      <div style="height: 84vh; padding: 12px; box-sizing: border-box; background: #f5f7fb; font-family: Roboto, sans-serif;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <label for="pinned-filter" style="font-size: 13px; color: #1f2937;">Search</label>
          <input
            id="pinned-filter"
            data-testid="filter-input"
            type="text"
            [value]="filterQuery || ''"
            (input)="filterQuery = $any($event.target).value"
            placeholder="Filter tree rows..."
            style="flex: 1; min-width: 220px; padding: 8px 10px; border: 1px solid #c8d0dc; border-radius: 6px; background: #fff;" />
          <button
            type="button"
            data-testid="clear-filter"
            (click)="filterQuery = ''"
            style="padding: 8px 10px; border: 1px solid #c8d0dc; border-radius: 6px; background: #fff; cursor: pointer;">
            Clear
          </button>
        </div>

        <div style="display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 12px; height: calc(100% - 58px);">
          <div style="border: 1px solid #d8dde6; border-radius: 10px; overflow: hidden; background: #fff;">
            <tree-explorer
              #tree
              [data]="data"
              [adapter]="adapter"
              [config]="storyConfig"
              [filterQuery]="filterQuery"
              (selectionChange)="onSelectionChange($event)"
              style="height: 100%; display: block;">
            </tree-explorer>
          </div>

          <aside style="border: 1px solid #d8dde6; border-radius: 10px; background: #fff; padding: 10px; overflow: auto;">
            <h4 style="margin: 0 0 8px; font-size: 14px; color: #0f172a;">Debug Panel</h4>
            <div data-testid="selected-ids" style="font-size: 12px; color: #334155; margin-bottom: 10px;">
              Selected: {{ selectedNodeIds.length > 0 ? selectedNodeIds.join(', ') : '(none)' }}
            </div>

            <div style="font-size: 12px; color: #0f172a; font-weight: 600; margin-bottom: 4px;">Persisted pinned</div>
            <ul data-testid="persisted-pinned" style="margin: 0 0 12px; padding-left: 16px; font-size: 12px; color: #334155;">
              @for (entry of persistedPinnedSnapshot; track entry) {
                <li>{{ entry }}</li>
              }
            </ul>

            <div style="font-size: 12px; color: #0f172a; font-weight: 600; margin-bottom: 4px;">Store calls</div>
            <ul data-testid="store-calls" style="margin: 0; padding-left: 16px; font-size: 12px; color: #334155;">
              @for (call of storeCalls; track call) {
                <li>{{ call }}</li>
              }
            </ul>

            <p style="margin: 12px 0 0; font-size: 12px; color: #64748b; line-height: 1.4;">
              Right-click rows (or use the row menu) to Star/Unstar. Drag pinned rows to reorder.
            </p>
          </aside>
        </div>
      </div>
    `,
  };
};

const meta: Meta<TreeExplorerComponent<PinnedNode, PinnedNode>> = {
  title: 'Tree/Cookbook',
  component: TreeExplorerComponent,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<TreeExplorerComponent<PinnedNode, PinnedNode>>;

export const PinnedItemsStarNavigate: Story = {
  name: 'Pinned items (star + navigate)',
  args: {
    data,
    adapter,
    config: {
      selection: { mode: SELECTION_MODES.SINGLE },
      display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: true },
      virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 36 },
      filtering: {
        mode: 'client',
        showParentsOfMatches: true,
        autoExpandMatches: true,
      },
    } satisfies Partial<TreeConfig<PinnedNode>>,
    filterQuery: '',
  },
  render: renderCookbook,
  parameters: {
    docs: {
      description: {
        story:
          'Cookbook for pinned items with mocked GET/POST/DELETE/reorder calls, root-level pinned shortcuts, and navigate-to-original behavior.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await canvas.findByText('Pinned');
    await expect(canvas.getByTestId('store-calls')).toBeInTheDocument();
  },
};
