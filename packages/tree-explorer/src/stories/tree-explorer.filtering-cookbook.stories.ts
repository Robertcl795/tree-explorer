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

type CookbookNode = {
  id: string;
  name: string;
  hasChildren?: boolean;
  children?: CookbookNode[];
};

const clientData: CookbookNode[] = [
  {
    id: 'workspace',
    name: 'Workspace',
    children: [
      {
        id: 'docs',
        name: 'Documents',
        children: [
          { id: 'budget-fy26', name: 'Budget FY26.xlsx' },
          { id: 'budget-fy27', name: 'Budget FY27.xlsx' },
          { id: 'roadmap', name: 'Roadmap.md' },
        ],
      },
      {
        id: 'team',
        name: 'Team',
        children: [
          { id: 'alice', name: 'Alice Profile' },
          { id: 'bob', name: 'Bob Profile' },
        ],
      },
    ],
  },
];

const hybridRoots: CookbookNode[] = [
  { id: 'workspace-h', name: 'Budget Workspace', hasChildren: true },
];

const hybridChildren: Record<string, CookbookNode[]> = {
  'workspace-h': [
    { id: 'projects-h', name: 'Projects', hasChildren: true },
    { id: 'teams-h', name: 'Teams', hasChildren: true },
  ],
  'projects-h': [
    { id: 'q3-budget', name: 'Q3 Budget Review', hasChildren: false },
    { id: 'q4-plan', name: 'Q4 Planning', hasChildren: false },
  ],
  'teams-h': [
    { id: 'ops-handbook', name: 'Ops Handbook', hasChildren: false },
  ],
};

const serverFilteredData: CookbookNode[] = [
  { id: 'budget-actuals-s', name: 'Budget Actuals FY26.csv' },
  { id: 'budget-plan-s', name: 'Budget Plan FY27.xlsx' },
  { id: 'budget-metrics-s', name: 'Budget Metrics Dashboard' },
];

const clientAdapter: TreeAdapter<CookbookNode, CookbookNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getChildren: (data) => data.children,
};

const hybridAdapter: TreeAdapter<CookbookNode, CookbookNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  hasChildren: (data) => !!data.hasChildren,
  loadChildren: async (node) => hybridChildren[node.id] ?? [],
};

const serverAdapter: TreeAdapter<CookbookNode, CookbookNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getChildren: (data) => data.children,
};

const baseConfig: Partial<TreeConfig<CookbookNode>> = {
  selection: { mode: SELECTION_MODES.MULTI },
  display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: true },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 36 },
};

const renderCookbookStory = (args: any) => ({
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
  title: 'Tree/Filtering Cookbook',
  component: TreeExplorerComponent,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    filterQuery: {
      control: false,
      description: 'Bound to the in-story search input for live filtering.',
    },
  },
};

export default meta;

type Story = StoryObj<TreeExplorerComponent<any, any>>;

export const ClientModeLoadedNodes: Story = {
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
  render: renderCookbookStory,
  parameters: {
    docs: {
      description: {
        story:
          'Client mode cookbook: all relevant nodes are loaded in-memory and matching runs in core. Use the search bar to filter in real time.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByTestId('filter-input');
    await userEvent.clear(input);
    await userEvent.type(input, 'roadmap');

    await waitFor(async () => {
      await expect(canvas.getByTestId('active-query')).toHaveTextContent('roadmap');
      await expect(canvas.getByText('Roadmap.md')).toBeVisible();
      await expect(canvas.queryByText('Alice Profile')).toBeNull();
    });
  },
};

export const HybridModeLoadedPlusLazy: Story = {
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
  render: renderCookbookStory,
  parameters: {
    docs: {
      description: {
        story:
          'Hybrid mode cookbook: core filters loaded rows. Expand branches to load deeper nodes and observe matching updates in real time.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByTestId('filter-input');
    await userEvent.clear(input);
    await userEvent.type(input, 'budget');

    const workspaceLabel = await canvas.findByText('Budget Workspace');
    const workspaceRow = workspaceLabel.closest('.tree-item');
    const workspaceCaret = workspaceRow?.querySelector('button.caret-button');
    if (!workspaceCaret) {
      throw new Error('Missing caret button for Budget Workspace row');
    }
    await userEvent.click(workspaceCaret as HTMLButtonElement);

    const projectsLabel = await canvas.findByText('Projects');
    const projectsRow = projectsLabel.closest('.tree-item');
    const projectsCaret = projectsRow?.querySelector('button.caret-button');
    if (!projectsCaret) {
      throw new Error('Missing caret button for Projects row');
    }
    await userEvent.click(projectsCaret as HTMLButtonElement);

    await waitFor(async () => {
      await expect(canvas.getByText('Q3 Budget Review')).toBeVisible();
      await expect(canvas.queryByText('Q4 Planning')).toBeNull();
    });
  },
};

export const ServerModePrefilteredDataset: Story = {
  args: {
    data: serverFilteredData,
    adapter: serverAdapter,
    config: {
      ...baseConfig,
      filtering: {
        mode: 'server',
        showParentsOfMatches: true,
        autoExpandMatches: false,
        selectionPolicy: 'keep',
      },
    },
    filterQuery: 'budget',
  },
  render: renderCookbookStory,
  parameters: {
    docs: {
      description: {
        story:
          'Server mode cookbook: data is assumed pre-filtered by API/adapter. The search bar is still interactive, while core skips client-side query matching.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByTestId('filter-input');
    await userEvent.clear(input);
    await userEvent.type(input, 'no-such-item');

    await waitFor(async () => {
      await expect(canvas.getByTestId('active-query')).toHaveTextContent('no-such-item');
      await expect(canvas.getByText('Budget Plan FY27.xlsx')).toBeVisible();
      await expect(canvas.getByTestId('visible-rows')).toHaveTextContent('3');
    });
  },
};
