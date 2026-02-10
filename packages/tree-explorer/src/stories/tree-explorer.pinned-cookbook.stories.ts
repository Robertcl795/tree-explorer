import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  SELECTION_MODES,
  TREE_DENSITY,
  TreeAdapter,
  TreeConfig,
  TreeLoadError,
  TreeNode,
  TreePinnedEntry,
  VIRTUALIZATION_MODES,
} from '@tree-core';
import { TreeExplorerComponent } from '../public-api';

type PinnedDemoNode = {
  id: string;
  name: string;
  icon: string;
  hasChildren: boolean;
};

const ROOT_ID = 'workspace';
const LEVEL1_COUNT = 5;
const LEVEL2_COUNT = 5;
const LEVEL3_COUNT = 5;
const LEVEL4_COUNT = 1;
const TARGET_PATH = { l1: 4, l2: 4, l3: 4, l4: 0 };

const level1Id = (l1: number) => `l1-${l1}`;
const level2Id = (l1: number, l2: number) => `${level1Id(l1)}-l2-${l2}`;
const level3Id = (l1: number, l2: number, l3: number) => `${level2Id(l1, l2)}-l3-${l3}`;
const level4Id = (l1: number, l2: number, l3: number, l4: number) => `${level3Id(l1, l2, l3)}-l4-${l4}`;

const TARGET_ID = level4Id(TARGET_PATH.l1, TARGET_PATH.l2, TARGET_PATH.l3, TARGET_PATH.l4);
const FAILURE_NODE_ID = level2Id(TARGET_PATH.l1, TARGET_PATH.l2);
const TOTAL_ITEMS = LEVEL1_COUNT * LEVEL2_COUNT * LEVEL3_COUNT * LEVEL4_COUNT;

const level1Pattern = /^l1-(\d+)$/;
const level2Pattern = /^l1-(\d+)-l2-(\d+)$/;
const level3Pattern = /^l1-(\d+)-l2-(\d+)-l3-(\d+)$/;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildChildren(nodeId: string): PinnedDemoNode[] {
  if (nodeId === ROOT_ID) {
    return Array.from({ length: LEVEL1_COUNT }, (_, l1) => ({
      id: level1Id(l1),
      name: `Group ${l1}`,
      icon: 'folder',
      hasChildren: true,
    }));
  }

  const level1Match = nodeId.match(level1Pattern);
  if (level1Match) {
    const l1 = Number(level1Match[1]);
    return Array.from({ length: LEVEL2_COUNT }, (_, l2) => ({
      id: level2Id(l1, l2),
      name: `Team ${l1}.${l2}`,
      icon: 'group',
      hasChildren: true,
    }));
  }

  const level2Match = nodeId.match(level2Pattern);
  if (level2Match) {
    const l1 = Number(level2Match[1]);
    const l2 = Number(level2Match[2]);
    return Array.from({ length: LEVEL3_COUNT }, (_, l3) => ({
      id: level3Id(l1, l2, l3),
      name: `Project ${l1}.${l2}.${l3}`,
      icon: 'folder_open',
      hasChildren: true,
    }));
  }

  const level3Match = nodeId.match(level3Pattern);
  if (level3Match) {
    const l1 = Number(level3Match[1]);
    const l2 = Number(level3Match[2]);
    const l3 = Number(level3Match[3]);
    return Array.from({ length: LEVEL4_COUNT }, (_, l4) => ({
      id: level4Id(l1, l2, l3, l4),
      name: `File ${l1}.${l2}.${l3}.${l4}`,
      icon: 'description',
      hasChildren: false,
    }));
  }

  return [];
}

@Component({
  selector: 'pinned-cookbook-large-story',
  standalone: true,
  imports: [CommonModule, TreeExplorerComponent],
  template: `
    <div style="display:grid; grid-template-columns: 1fr 360px; gap: 12px; height: 80vh; padding: 12px; box-sizing: border-box; background: #f7f8f9;">
      <div style="border: 1px solid #d7dce0; border-radius: 10px; overflow: hidden; background: #fff;">
        <tree-explorer
          #tree
          [data]="data"
          [adapter]="adapter"
          [config]="config"
          (loadError)="onLoadError($event)"
          style="height: 100%; display: block;">
        </tree-explorer>
      </div>

      <aside style="border: 1px solid #d7dce0; border-radius: 10px; background: #fff; padding: 12px; box-sizing: border-box; font-family: Roboto, sans-serif; font-size: 13px;">
        <button
          type="button"
          data-testid="navigate-pinned"
          (click)="navigatePinned()"
          style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer; margin-bottom: 10px;">
          Navigate pinned target
        </button>
        <p style="margin: 0 0 8px;"><strong>Pinned navigation debug</strong></p>
        <p style="margin: 0 0 6px;">Tree depth: 4 levels</p>
        <p style="margin: 0 0 6px;">Leaf items: {{ totalItems }}</p>
        <p data-testid="requests" style="margin: 0 0 6px;">Requests made: {{ requestsText() || 'none' }}</p>
        <p data-testid="inflight" style="margin: 0 0 6px;">In-flight: {{ inFlightText() || 'none' }}</p>
        <p data-testid="errors" style="margin: 0 0 6px;">Errored states: {{ errorsText() || 'none' }}</p>
        <p data-testid="selected" style="margin: 0 0 6px;">Selected rows: {{ selectedText() }}</p>
        <p data-testid="navigation" style="margin: 0;">Navigation outcome: {{ navigationOutcome() }}</p>
      </aside>
    </div>
  `,
})
class PinnedCookbookLargeStoryComponent {
  public readonly tree = viewChild<TreeExplorerComponent<PinnedDemoNode, PinnedDemoNode>>('tree');
  public readonly mode = input<'success' | 'failure'>('success');
  public readonly totalItems = TOTAL_ITEMS;
  public readonly data: PinnedDemoNode[] = [
    { id: ROOT_ID, name: 'Workspace', icon: 'home', hasChildren: true },
  ];

  public readonly requests = signal<string[]>([]);
  public readonly inFlight = signal<string[]>([]);
  public readonly errors = signal<string[]>([]);
  public readonly navigationOutcome = signal('idle');

  public readonly requestsText = computed(() => this.requests().join(', '));
  public readonly inFlightText = computed(() => this.inFlight().join(', '));
  public readonly errorsText = computed(() => this.errors().join(', '));
  public readonly selectedText = computed(() => {
    const tree = this.tree();
    if (!tree) {
      return 'none';
    }
    const selected = tree.visibleRows()
      .filter((row) => row.selected)
      .map((row) => row.id);
    return selected.length > 0 ? selected.join(', ') : 'none';
  });

  public readonly config: Partial<TreeConfig<PinnedDemoNode>> = {
    selection: { mode: SELECTION_MODES.SINGLE },
    display: { indentPx: 22, density: TREE_DENSITY.NORMAL, showIcons: true },
    virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 34 },
    pinned: {
      enabled: true,
      entries: [
        {
          entryId: 'pin-deep-target',
          nodeId: TARGET_ID,
          label: 'Deep target',
          icon: 'description',
          order: 0,
        } satisfies TreePinnedEntry,
      ],
      onNavigate: (nodeId) => this.navigationOutcome.set(`success:${nodeId}`),
    },
  };

  public readonly adapter: TreeAdapter<PinnedDemoNode, PinnedDemoNode> = {
    getId: (source) => source.id,
    getLabel: (data) => data.name,
    getIcon: (data) => data.icon,
    hasChildren: (data) => data.hasChildren,
    resolvePathToNode: (targetId) => {
      if (targetId !== TARGET_ID) {
        return null;
      }

      return {
        targetId,
        steps: [
          { nodeId: ROOT_ID, parentId: null },
          { nodeId: level1Id(TARGET_PATH.l1), parentId: ROOT_ID },
          { nodeId: level2Id(TARGET_PATH.l1, TARGET_PATH.l2), parentId: level1Id(TARGET_PATH.l1) },
          {
            nodeId: level3Id(TARGET_PATH.l1, TARGET_PATH.l2, TARGET_PATH.l3),
            parentId: level2Id(TARGET_PATH.l1, TARGET_PATH.l2),
          },
          {
            nodeId: level4Id(TARGET_PATH.l1, TARGET_PATH.l2, TARGET_PATH.l3, TARGET_PATH.l4),
            parentId: level3Id(TARGET_PATH.l1, TARGET_PATH.l2, TARGET_PATH.l3),
          },
        ],
      };
    },
    loadChildren: async (node: TreeNode<PinnedDemoNode>) => {
      const requestKey = node.id;
      this.requests.update((values) => [...values, requestKey]);
      this.inFlight.update((values) => [...values, requestKey]);

      await delay(90);
      this.inFlight.update((values) => values.filter((value) => value !== requestKey));

      if (this.mode() === 'failure' && node.id === FAILURE_NODE_ID) {
        this.errors.update((values) => [...values, `load:${node.id}`]);
        throw new Error('Nested branch load failed');
      }

      return buildChildren(node.id);
    },
  };

  public onLoadError(error: TreeLoadError): void {
    if (error.scope === 'navigation') {
      this.navigationOutcome.set(`failure:${error.reason ?? 'unknown'}`);
      return;
    }

    if (error.scope === 'children' && error.nodeId) {
      this.errors.update((values) => [...values, `${error.scope}:${error.nodeId}`]);
    }
  }

  public navigatePinned(): void {
    const tree = this.tree();
    const pinned = tree?.pinnedItems()[0];
    if (!tree || !pinned) {
      return;
    }

    this.navigationOutcome.set('in-progress');
    tree.onPinnedClick(new MouseEvent('click'), pinned);
  }
}

const meta: Meta = {
  title: 'Tree/Pinned items',
  component: TreeExplorerComponent,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj;

export const NestedAutoNavigation: Story = {
  name: 'Nested auto navigation (4 levels, 125 items)',
  render: () => ({
    template: '<pinned-cookbook-large-story mode="success" />',
    moduleMetadata: {
      imports: [PinnedCookbookLargeStoryComponent],
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByTestId('navigate-pinned'));
    await waitFor(async () => {
      await expect(canvas.getByTestId('navigation')).toHaveTextContent('success');
      await expect(canvas.getByTestId('selected')).toHaveTextContent(TARGET_ID);
    });
  },
};

export const NestedAutoNavigationLoadFailure: Story = {
  name: 'Nested auto navigation: load failure',
  render: () => ({
    template: '<pinned-cookbook-large-story mode="failure" />',
    moduleMetadata: {
      imports: [PinnedCookbookLargeStoryComponent],
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByTestId('navigate-pinned'));
    await waitFor(async () => {
      await expect(canvas.getByTestId('navigation')).toHaveTextContent('failure');
    });
  },
};
