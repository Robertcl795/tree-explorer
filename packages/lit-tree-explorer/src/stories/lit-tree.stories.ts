import { html } from 'lit';
import type { Meta, StoryObj } from '@storybook/web-components';
import type { TreeAdapter, TreeConfig } from '@tree-core';
import '../tree-lit';

type BasicNode = { id: string; name: string; children?: BasicNode[] };

type LazyNode = { id: string; name: string; hasChildren?: boolean };

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
    return Promise.resolve([
      { id: `${node.id}-child-1`, name: 'Child 1', hasChildren: false },
      { id: `${node.id}-child-2`, name: 'Child 2', hasChildren: false },
    ]);
  },
};

const basicAdapter: TreeAdapter<BasicNode, BasicNode> = {
  getId: (source) => source.id,
  getLabel: (data) => data.name,
  getChildren: (data) => data.children,
};

const basicConfig: Partial<TreeConfig<BasicNode>> = {
  virtualization: { mode: 'auto', itemSize: 36 },
  pinned: { ids: ['docs'], label: 'Pinned' },
  dragDrop: true,
};

const lazyConfig: Partial<TreeConfig<LazyNode>> = {
  virtualization: { mode: 'auto', itemSize: 32 },
};

const meta: Meta = {
  title: 'Lit Tree/Examples',
  render: (args) => html`
    <div style="height: 500px; border: 1px solid #e0e0e0;">
      <td-tree-lit
        .data=${args.data}
        .adapter=${args.adapter}
        .config=${args.config}
      ></td-tree-lit>
    </div>
  `,
};

export default meta;

export const Basic: StoryObj = {
  args: {
    data: basicData,
    adapter: basicAdapter,
    config: basicConfig,
  },
};

export const LazyLoad: StoryObj = {
  args: {
    data: lazyRoots,
    adapter: lazyAdapter,
    config: lazyConfig,
  },
};
