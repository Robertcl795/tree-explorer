import { Meta, StoryObj } from '@storybook/angular';
import {
  TREE_DENSITY,
  TreeConfig,
  VIRTUALIZATION_MODES,
} from '@tree-core';
import { ObjectTreeAdapter, TreeExplorerComponent } from '../public-api';
import { createTreeStory } from './tree-explorer.utils';

type LegacyNode = {
  id: string;
  name: string;
  children?: LegacyNode[];
};

const data: LegacyNode[] = [
  {
    id: 'legacy-root',
    name: 'Workspace',
    children: [
      { id: 'legacy-docs', name: 'Documents' },
      { id: 'legacy-images', name: 'Images' },
    ],
  },
];

const config: Partial<TreeConfig<LegacyNode>> = {
  display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: true },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 36 },
};

const meta: Meta<TreeExplorerComponent<any, any>> = {
  title: 'Tree/Advanced',
  component: TreeExplorerComponent,
  // Compatibility alias for persisted Storybook URLs/local state:
  // ?path=/story/tree-advanced--basic
  tags: ['hidden'],
};

export default meta;

export const Basic: StoryObj<TreeExplorerComponent<any, any>> = createTreeStory({
  data,
  adapter: new ObjectTreeAdapter<LegacyNode>(),
  config,
});
Basic.storyName = 'Basic (legacy alias)';
