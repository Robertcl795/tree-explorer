import { Meta, StoryObj } from '@storybook/angular';
import {
  SELECTION_MODES,
  TREE_DENSITY,
  TreeConfig,
  VIRTUALIZATION_MODES,
} from '@tree-core';
import { ObjectTreeAdapter, TreeExplorerComponent } from '../public-api';
import { createTreeStory } from './tree-explorer.utils';

type VirtualNode = {
  id: string;
  name: string;
  children?: VirtualNode[];
};

function buildFourLevelTree(): VirtualNode[] {
  const level1Count = 10;
  const level2Count = 10;
  const level3Count = 10;
  const level4Count = 1;

  return Array.from({ length: level1Count }, (_, l1) => ({
    id: `l1-${l1}`,
    name: `Level 1 - ${l1}`,
    children: Array.from({ length: level2Count }, (_, l2) => ({
      id: `l1-${l1}-l2-${l2}`,
      name: `Level 2 - ${l1}.${l2}`,
      children: Array.from({ length: level3Count }, (_, l3) => ({
        id: `l1-${l1}-l2-${l2}-l3-${l3}`,
        name: `Level 3 - ${l1}.${l2}.${l3}`,
        children: Array.from({ length: level4Count }, (_, l4) => ({
          id: `l1-${l1}-l2-${l2}-l3-${l3}-l4-${l4}`,
          name: `Item ${l1}-${l2}-${l3}-${l4}`,
        })),
      })),
    })),
  }));
}

const normalData = buildFourLevelTree();

const config: Partial<TreeConfig<VirtualNode>> = {
  selection: { mode: SELECTION_MODES.MULTI, hierarchical: true },
  display: { indentPx: 22, density: TREE_DENSITY.NORMAL, showIcons: true },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 34 },
};

const meta: Meta<TreeExplorerComponent<any, any>> = {
  title: 'Tree/Virtual scroll',
  component: TreeExplorerComponent,
};

export default meta;

export const Normal1000Items4LevelsNest: StoryObj<TreeExplorerComponent<any, any>> = createTreeStory({
  data: normalData,
  adapter: new ObjectTreeAdapter<VirtualNode>(),
  config,
});
Normal1000Items4LevelsNest.storyName = 'Normal (1000 items, 4 levels nest)';
