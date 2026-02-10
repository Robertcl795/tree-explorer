import { Meta, StoryObj } from '@storybook/angular';
import {
  SELECTION_MODES,
  TREE_DENSITY,
  TreeConfig,
  VIRTUALIZATION_MODES,
} from '@tree-core';
import { ObjectTreeAdapter, TreeExplorerComponent } from '../public-api';
import { createTreeStory } from './tree-explorer.utils';

type FilterNode = {
  id: string;
  name: string;
  children?: FilterNode[];
};

const filteringData: FilterNode[] = [
  {
    id: 'workspace',
    name: 'Workspace',
    children: [
      {
        id: 'docs',
        name: 'Documents',
        children: [
          { id: 'budget', name: 'Budget FY26.xlsx' },
          { id: 'notes', name: 'Notes.md' },
          { id: 'roadmap', name: 'Roadmap Q3.docx' },
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
      {
        id: 'archive',
        name: 'Archive',
        children: [
          { id: 'budget-2024', name: 'Budget FY24.xlsx' },
          { id: 'budget-2025', name: 'Budget FY25.xlsx' },
        ],
      },
    ],
  },
];

const adapter = new ObjectTreeAdapter<FilterNode>();

const baseConfig: Partial<TreeConfig<FilterNode>> = {
  selection: { mode: SELECTION_MODES.MULTI },
  display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: true },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 36 },
};

const meta: Meta<TreeExplorerComponent<any, any>> = {
  title: 'Tree/Filtering',
  component: TreeExplorerComponent,
  argTypes: {
    filterQuery: {
      control: 'text',
      description: 'Client-side filter input forwarded to TreeEngine.setFilter',
    },
  },
};

export default meta;

type Story = StoryObj<TreeExplorerComponent<any, any>>;

export const ClientSideSearch: Story = {
  ...createTreeStory({
    data: filteringData,
    adapter,
    config: {
      ...baseConfig,
      filtering: {
        showParentsOfMatches: true,
        autoExpandMatches: true,
        selectionPolicy: 'keep',
      },
    },
    filterQuery: 'budget',
  }),
  parameters: {
    docs: {
      description: {
        story: 'Client-side filtering over loaded nodes. Change `filterQuery` in Controls to test different searches.',
      },
    },
  },
};

export const DirectMatchesOnly: Story = {
  ...createTreeStory({
    data: filteringData,
    adapter,
    config: {
      ...baseConfig,
      filtering: {
        showParentsOfMatches: false,
        autoExpandMatches: true,
        selectionPolicy: 'keep',
      },
    },
    filterQuery: 'budget',
  }),
  parameters: {
    docs: {
      description: {
        story: 'Policy variant: show only direct matches (`showParentsOfMatches=false`).',
      },
    },
  },
};

export const ClearHiddenSelectionPolicy: Story = {
  ...createTreeStory({
    data: filteringData,
    adapter,
    config: {
      ...baseConfig,
      filtering: {
        showParentsOfMatches: true,
        autoExpandMatches: true,
        selectionPolicy: 'clearHidden',
      },
    },
    filterQuery: 'profile',
  }),
  parameters: {
    docs: {
      description: {
        story: 'Policy variant: `selectionPolicy=clearHidden` for pruning filtered-out selections.',
      },
    },
  },
};
