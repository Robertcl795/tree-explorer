import { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  SELECTION_MODES,
  TREE_DENSITY,
  TreeAdapter,
  TreeConfig,
  VIRTUALIZATION_MODES,
} from '@tree-core';
import { TreeExplorerComponent } from '../public-api';

type FilterNode = {
  id: string;
  name: string;
  hasChildren?: boolean;
  children?: FilterNode[];
};

function buildClientDataset(totalPerFolder = 50): FilterNode[] {
  const folder = (id: string, prefix: string) => ({
    id,
    name: `${prefix} Folder`,
    children: Array.from({ length: totalPerFolder }, (_, index) => ({
      id: `${id}-item-${index}`,
      name: index % 3 === 0 ? `Budget ${prefix} ${index}` : `${prefix} Item ${index}`,
    })),
  });

  return [
    {
      id: 'workspace',
      name: 'Workspace',
      children: [
        folder('finance', 'Finance'),
        folder('ops', 'Ops'),
        folder('team', 'Team'),
      ],
    },
  ];
}

const clientData = buildClientDataset(50); // 150+ rows

const hybridRoots: FilterNode[] = [
  { id: 'hybrid-root', name: 'Hybrid Root', hasChildren: true },
];

const hybridChildren: Record<string, FilterNode[]> = {
  'hybrid-root': Array.from({ length: 140 }, (_, index) => ({
    id: `hybrid-node-${index}`,
    name: index % 4 === 0 ? `Budget Hybrid ${index}` : `Hybrid Node ${index}`,
    hasChildren: false,
  })),
};

const serverDirectMatchesData: FilterNode[] = Array.from({ length: 120 }, (_, index) => ({
  id: `server-direct-${index}`,
  name: `Budget Server Result ${index}`,
}));

const serverPolicyData: FilterNode[] = Array.from({ length: 120 }, (_, index) => ({
  id: `server-policy-${index}`,
  name: index % 2 === 0 ? `Budget Policy ${index}` : `Policy Result ${index}`,
}));

const clientAdapter: TreeAdapter<FilterNode, FilterNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getChildren: (data) => data.children,
};

const hybridAdapter: TreeAdapter<FilterNode, FilterNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  hasChildren: (data) => !!data.hasChildren,
  loadChildren: async (node) => hybridChildren[node.id] ?? [],
};

const serverAdapter: TreeAdapter<FilterNode, FilterNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getChildren: (data) => data.children,
};

const baseConfig: Partial<TreeConfig<FilterNode>> = {
  selection: { mode: SELECTION_MODES.MULTI },
  display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: true },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 36 },
};

const renderFilteringStory = (args: any) => ({
  props: { ...args, filterQuery: args.filterQuery ?? '' },
  template: `
    <div style="height: 80vh; padding: 12px; box-sizing: border-box; background: #f7f8f9;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-family: Roboto, sans-serif;">
        <label for="tree-filter-input" style="font-size: 13px; color: #253041;">Search</label>
        <input
          id="tree-filter-input"
          data-testid="filter-input"
          type="text"
          [value]="filterQuery || ''"
          (input)="filterQuery = $any($event.target).value"
          placeholder="Type to filter..."
          style="flex: 1; min-width: 220px; padding: 7px 10px; border: 1px solid #c9d1d9; border-radius: 6px; background: #fff;" />
        <button
          type="button"
          data-testid="clear-filter"
          (click)="filterQuery = ''"
          style="padding: 7px 10px; border: 1px solid #c9d1d9; border-radius: 6px; background: #fff; cursor: pointer;">
          Clear
        </button>
      </div>

      <div style="display: flex; gap: 12px; margin-bottom: 8px; font: 13px Roboto, sans-serif; color: #334155;">
        <span data-testid="active-query">Active query: {{ filterQuery || '(none)' }}</span>
        <span data-testid="visible-rows">Visible rows: {{ tree.visibleRows().length }}</span>
      </div>

      <div style="height: calc(100% - 84px); border: 1px solid #d7dce0; border-radius: 10px; overflow: hidden; background: #fff;">
        <tree-explorer
          #tree
          [data]="data"
          [adapter]="adapter"
          [config]="config"
          [filterQuery]="filterQuery"
          style="height: 100%; display: block">
        </tree-explorer>
      </div>
    </div>
  `,
});

const meta: Meta<TreeExplorerComponent<any, any>> = {
  title: 'Tree/Filtering (100+ elements)',
  component: TreeExplorerComponent,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<TreeExplorerComponent<any, any>>;

export const ClientMode: Story = {
  args: {
    data: clientData,
    adapter: clientAdapter,
    config: {
      ...baseConfig,
      filtering: {
        mode: 'client',
        showParentsOfMatches: true,
        autoExpandMatches: true,
        selectionPolicy: 'keep',
      },
    },
    filterQuery: 'budget',
  },
  render: renderFilteringStory,
};
ClientMode.storyName = 'Client mode';

export const Hybrid: Story = {
  args: {
    data: hybridRoots,
    adapter: hybridAdapter,
    config: {
      ...baseConfig,
      filtering: {
        mode: 'hybrid',
        showParentsOfMatches: true,
        autoExpandMatches: true,
        selectionPolicy: 'keep',
      },
    },
    filterQuery: 'budget',
  },
  render: renderFilteringStory,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByTestId('filter-input');
    await userEvent.clear(input);
    await userEvent.type(input, 'budget');

    const rootLabel = await canvas.findByText('Hybrid Root');
    const rootRow = rootLabel.closest('.tree-item');
    const caret = rootRow?.querySelector('button.caret-button');
    if (!caret) {
      throw new Error('Missing caret button for Hybrid Root');
    }
    await userEvent.click(caret as HTMLButtonElement);

    await waitFor(async () => {
      await expect(canvas.getByText('Budget Hybrid 0')).toBeVisible();
    });
  },
};
Hybrid.storyName = 'Hybrid';

export const ServerDirectMatches: Story = {
  args: {
    data: serverDirectMatchesData,
    adapter: serverAdapter,
    config: {
      ...baseConfig,
      filtering: {
        mode: 'server',
        showParentsOfMatches: false,
        autoExpandMatches: false,
        selectionPolicy: 'keep',
      },
    },
    filterQuery: 'budget',
  },
  render: renderFilteringStory,
};
ServerDirectMatches.storyName = 'Server: Direct matches';

export const ServerClearHiddenSelectionPolicy: Story = {
  args: {
    data: serverPolicyData,
    adapter: serverAdapter,
    config: {
      ...baseConfig,
      filtering: {
        mode: 'server',
        showParentsOfMatches: true,
        autoExpandMatches: false,
        selectionPolicy: 'clearHidden',
      },
    },
    filterQuery: 'budget',
  },
  render: renderFilteringStory,
};
ServerClearHiddenSelectionPolicy.storyName = 'Server: Clear hidden selection policy';
