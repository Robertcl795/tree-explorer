/**
 * @fileoverview Advanced Tree Explorer Stories
 */

import { Meta, StoryObj } from '@storybook/angular';
import {
  SELECTION_MODES,
  TREE_DENSITY,
  TreeAdapter,
  TreeConfig,
  TreeContextAction,
  VIRTUALIZATION_MODES,
} from '@tree-core';
import { ObjectTreeAdapter, TreeExplorerComponent } from '../public-api';
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
      { id: 'docs', name: 'Documents', children: [{ id: 'rpt', name: 'Report.pdf' }] },
      { id: 'img', name: 'Images', children: [{ id: 'logo', name: 'logo.png' }] },
    ],
  },
];

type LazyNode = {
  id: string;
  name: string;
  hasChildren?: boolean;
};

const lazyRoots: LazyNode[] = [
  { id: 'db', name: 'Databases', hasChildren: true },
  { id: 'fs', name: 'Files', hasChildren: true },
];

const lazyAdapter: TreeAdapter<LazyNode, LazyNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  hasChildren: (data) => !!data.hasChildren,
  loadChildren: (node) => {
    if (node.id === 'db') {
      return Promise.resolve([
        { id: 'db-a', name: 'Analytics', hasChildren: true },
        { id: 'db-b', name: 'Billing', hasChildren: false },
      ]);
    }
    if (node.id === 'db-a') {
      return Promise.resolve([
        { id: 'tbl-1', name: 'Sessions', hasChildren: false },
        { id: 'tbl-2', name: 'PageViews', hasChildren: false },
      ]);
    }
    return Promise.resolve([
      { id: `${node.id}-child-1`, name: 'Child 1', hasChildren: false },
      { id: `${node.id}-child-2`, name: 'Child 2', hasChildren: false },
    ]);
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
  title: 'Tree/Advanced',
  component: TreeExplorerComponent,
};

export default meta;

export const Basic: StoryObj<TreeExplorerComponent<any, any>> = createTreeStory({
  data: basicData,
  adapter: new ObjectTreeAdapter<BasicNode>(),
  config: multiSelectConfig,
  actions: contextActions,
});

export const LazyLoad: StoryObj<TreeExplorerComponent<any, any>> = createTreeStory({
  data: lazyRoots,
  adapter: lazyAdapter,
  config: lazyConfig,
});
