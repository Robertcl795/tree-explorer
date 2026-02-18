/**
 * @fileoverview Advanced Tree Explorer Stories
 */

import { Meta, StoryObj } from '@storybook/angular';
import {
  ObjectTreeAdapter,
  SELECTION_MODES,
  TREE_DENSITY,
  TreeAdapter,
  TreeConfig,
  TreeContextAction,
  VIRTUALIZATION_MODES,
} from '@tree-core';
import { TreeExplorerComponent } from '../public-api';
import { createTreeStory } from './tree-explorer.utils';

type BasicNode = {
  id: string;
  name: string;
  children?: BasicNode[];
};

const basicData: BasicNode[] = [
  {
    id: 'root',
    name: 'Workspace',
    children: [
      {
        id: 'docs',
        name: 'Documents',
        children: [
          { id: 'rpt', name: 'Report.pdf' },
          { id: 'inv', name: 'Invoice-2026.xlsx' },
          { id: 'notes', name: 'Notes.md' },
        ],
      },
      {
        id: 'img',
        name: 'Images',
        children: [
          { id: 'logo', name: 'logo.png' },
          { id: 'banner', name: 'banner.jpg' },
          { id: 'screen', name: 'screenshot.webp' },
        ],
      },
      {
        id: 'music',
        name: 'Music',
        children: [
          { id: 'trk-a', name: 'Track-A.mp3' },
          { id: 'trk-b', name: 'Track-B.flac' },
          { id: 'live', name: 'Live-Session.wav' },
        ],
      },
    ],
  },
];

type LazyNode = {
  id: string;
  name: string;
  hasChildren?: boolean;
};

const lazyRoots: LazyNode[] = [
  { id: 'catalog', name: 'Catalog', hasChildren: true },
];

const lazyAdapter: TreeAdapter<LazyNode, LazyNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  hasChildren: (data) => !!data.hasChildren,
  loadChildren: (node) => {
    if (node.id === 'catalog') {
      return Promise.resolve(
        Array.from({ length: 100 }, (_, index) => ({
          id: `catalog-item-${index}`,
          name: `Catalog Item ${index}`,
          hasChildren: false,
        })),
      );
    }
    return Promise.resolve([]);
  },
};

const contextActions: TreeContextAction<BasicNode>[] = [
  {
    id: 'open',
    label: (item) => `Open ${item.name}`,
    icon: () => 'open_in_new',
  },
  {
    id: 'rename',
    label: () => 'Rename',
    icon: () => 'edit',
  },
];

const multiSelectConfig: Partial<TreeConfig<BasicNode>> = {
  selection: { mode: SELECTION_MODES.MULTI, hierarchical: true },
  display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: true },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 36 },
};

const lazyConfig: Partial<TreeConfig<LazyNode>> = {
  selection: { mode: SELECTION_MODES.SINGLE },
  display: { indentPx: 24, density: TREE_DENSITY.COMPACT, showIcons: true },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 32 },
};

const meta: Meta<TreeExplorerComponent<any, any>> = {
  title: 'Tree/Basic Usage',
  component: TreeExplorerComponent,
};

export default meta;

export const Normal: StoryObj<TreeExplorerComponent<any, any>> = createTreeStory({
  data: basicData,
  adapter: new ObjectTreeAdapter<BasicNode>(),
  config: multiSelectConfig,
  actions: contextActions,
});
Normal.storyName = 'Normal';

export const LazyLoad100Items: StoryObj<TreeExplorerComponent<any, any>> = createTreeStory({
  data: lazyRoots,
  adapter: lazyAdapter,
  config: lazyConfig,
});
LazyLoad100Items.storyName = 'Lazy load (100 items)';
