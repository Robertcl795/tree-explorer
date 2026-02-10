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
  PageRequest,
  PageResult,
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

type EdgeNode = {
  id: string;
  name: string;
  hasChildren?: boolean;
};

const EDGE_PAGE_SIZE = 20;
const EDGE_TOTAL = 120;
const ROOT_ID = 'edge-root';

function isPageRequest(value: unknown): value is PageRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybe = value as { pageIndex?: unknown; pageSize?: unknown };
  return typeof maybe.pageIndex === 'number' && typeof maybe.pageSize === 'number';
}

@Component({
  selector: 'initial-load-error-edge-story',
  standalone: true,
  imports: [CommonModule, TreeExplorerComponent],
  template: `
    <div style="display:grid; grid-template-columns: 1fr 320px; gap: 12px; height: 80vh; padding: 12px; box-sizing: border-box; background: #f7f8f9;">
      <div style="border: 1px solid #d7dce0; border-radius: 10px; overflow: hidden; background: #fff;">
        <tree-explorer
          [data]="data()"
          [adapter]="adapter"
          [config]="config"
          (loadError)="onLoadError($event)"
          style="height: 100%; display: block;">
        </tree-explorer>
      </div>
      <aside style="border: 1px solid #d7dce0; border-radius: 10px; background: #fff; padding: 12px; font-family: Roboto, sans-serif; font-size: 13px;">
        <button type="button" (click)="retry()" data-testid="retry-initial" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer; margin-bottom: 10px;">
          Retry Initial Load
        </button>
        <p data-testid="requests" style="margin: 0 0 6px;">Requests made: {{ requests() }}</p>
        <p data-testid="inflight" style="margin: 0 0 6px;">In-flight: {{ inflight() ? 'yes' : 'no' }}</p>
        <p data-testid="errors" style="margin: 0 0 6px;">Errored states: {{ erroredStatesText() || 'none' }}</p>
        <p data-testid="navigation" style="margin: 0;">Navigation outcome: n/a</p>
      </aside>
    </div>
  `,
})
class InitialLoadErrorEdgeStoryComponent {
  public readonly attempt = signal(0);
  public readonly requests = signal(0);
  public readonly inflight = signal(false);
  public readonly erroredStates = signal<string[]>([]);
  public readonly erroredStatesText = computed(() => this.erroredStates().join(', '));
  public readonly data = signal<EdgeNode[] | Promise<EdgeNode[]>>([]);

  public readonly adapter: TreeAdapter<EdgeNode, EdgeNode> = {
    getId: (source) => source.id,
    getLabel: (data) => data.name,
  };

  public readonly config: Partial<TreeConfig<EdgeNode>> = {
    display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: true },
    virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 34 },
  };

  constructor() {
    this.data.set(this.buildSource());
  }

  public retry(): void {
    this.attempt.update((value) => value + 1);
    this.erroredStates.set([]);
    this.data.set(this.buildSource());
  }

  public onLoadError(error: TreeLoadError): void {
    this.erroredStates.update((states) => [...states, error.scope]);
  }

  private buildSource(): Promise<EdgeNode[]> {
    this.requests.update((value) => value + 1);
    this.inflight.set(true);

    return new Promise<EdgeNode[]>((resolve, reject) => {
      setTimeout(() => {
        this.inflight.set(false);
        if (this.attempt() === 0) {
          reject(new Error('Initial load failed'));
          return;
        }

        resolve([{ id: ROOT_ID, name: 'Recovered Root', hasChildren: false }]);
      }, 120);
    });
  }
}

@Component({
  selector: 'page-aware-error-edge-story',
  standalone: true,
  imports: [CommonModule, TreeExplorerComponent],
  template: `
    <div style="display:grid; grid-template-columns: 1fr 340px; gap: 12px; height: 80vh; padding: 12px; box-sizing: border-box; background: #f7f8f9;">
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
      <aside style="border: 1px solid #d7dce0; border-radius: 10px; background: #fff; padding: 12px; font-family: Roboto, sans-serif; font-size: 13px;">
        <div style="display:flex; gap:8px; margin-bottom: 10px; flex-wrap: wrap;">
          <button type="button" (click)="expandRoot()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Expand Root</button>
          <button type="button" (click)="scrollToPage2()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Scroll To Page 2</button>
          <button type="button" data-testid="retry-pages" (click)="retryFailedPages()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Retry Failed Pages</button>
        </div>
        <p data-testid="requests" style="margin: 0 0 6px;">Requests made: {{ requestedPagesText() || 'none' }}</p>
        <p data-testid="inflight" style="margin: 0 0 6px;">In-flight: {{ inFlightPagesText() || 'none' }}</p>
        <p data-testid="errors" style="margin: 0 0 6px;">Errored states: {{ erroredPagesText() || 'none' }}</p>
        <p data-testid="navigation" style="margin: 0;">Navigation outcome: n/a</p>
      </aside>
    </div>
  `,
})
class PageAwareErrorEdgeStoryComponent {
  public readonly tree = viewChild<TreeExplorerComponent<EdgeNode, EdgeNode>>('tree');
  public readonly mode = input<'initial-page' | 'page-2'>('initial-page');

  public readonly data: EdgeNode[] = [{ id: ROOT_ID, name: 'Paged Root', hasChildren: true }];
  public readonly retryEnabled = signal(false);
  public readonly requestedPages = signal<number[]>([]);
  public readonly inFlightPages = signal<number[]>([]);
  public readonly erroredPages = signal<number[]>([]);

  public readonly requestedPagesText = computed(() =>
    this.requestedPages().slice().sort((a, b) => a - b).join(', '),
  );
  public readonly inFlightPagesText = computed(() =>
    this.inFlightPages().slice().sort((a, b) => a - b).join(', '),
  );
  public readonly erroredPagesText = computed(() =>
    this.erroredPages().slice().sort((a, b) => a - b).join(', '),
  );

  public readonly config: Partial<TreeConfig<EdgeNode>> = {
    display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: false },
    virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 34 },
  };

  public readonly adapter: TreeAdapter<EdgeNode, EdgeNode> = {
    getId: (source) => source.id,
    getLabel: (data) => data.name,
    hasChildren: (data) => !!data.hasChildren,
    getPagination: (node) =>
      node.id === ROOT_ID
        ? {
            enabled: true,
            pageSize: EDGE_PAGE_SIZE,
            pageIndexing: 'zero-based',
            initialTotalCount: EDGE_TOTAL,
          }
        : undefined,
    loadChildren: (node, reqOrSource): Promise<PageResult<EdgeNode>> => {
      if (node.id !== ROOT_ID) {
        return Promise.resolve({ items: [], totalCount: 0 });
      }

      const request = isPageRequest(reqOrSource)
        ? reqOrSource
        : { pageIndex: 0, pageSize: EDGE_PAGE_SIZE };
      this.requestedPages.update((pages) =>
        pages.includes(request.pageIndex) ? pages : [...pages, request.pageIndex],
      );
      this.inFlightPages.update((pages) =>
        pages.includes(request.pageIndex) ? pages : [...pages, request.pageIndex],
      );

      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.inFlightPages.update((pages) => pages.filter((page) => page !== request.pageIndex));
          const shouldFailInitial =
            this.mode() === 'initial-page' &&
            request.pageIndex === 0 &&
            !this.retryEnabled();
          const shouldFailPageTwo =
            this.mode() === 'page-2' &&
            request.pageIndex === 2 &&
            !this.retryEnabled();

          if (shouldFailInitial || shouldFailPageTwo) {
            this.erroredPages.update((pages) =>
              pages.includes(request.pageIndex) ? pages : [...pages, request.pageIndex],
            );
            reject(new Error(`Failed page ${request.pageIndex}`));
            return;
          }

          this.erroredPages.update((pages) => pages.filter((page) => page !== request.pageIndex));
          const offset = request.pageIndex * request.pageSize;
          const end = Math.min(offset + request.pageSize, EDGE_TOTAL);
          const items = Array.from({ length: Math.max(0, end - offset) }, (_, index) => ({
            id: `edge-child-${offset + index}`,
            name: `Edge Child ${offset + index}`,
            hasChildren: false,
          }));

          resolve({
            items,
            totalCount: EDGE_TOTAL,
          });
        }, 120);
      });
    },
  };

  public onLoadError(error: TreeLoadError): void {
    if (typeof error.pageIndex === 'number') {
      const failedPage = error.pageIndex;
      this.erroredPages.update((pages) =>
        pages.includes(failedPage) ? pages : [...pages, failedPage],
      );
    }
  }

  public expandRoot(): void {
    const tree = this.tree();
    const root = tree?.visibleRows()[0];
    if (!tree || !root) {
      return;
    }

    if (!root.expanded) {
      tree.onToggleExpand(new MouseEvent('click'), root);
      return;
    }

    // Retry initial-page failures by collapse+expand.
    if (this.mode() === 'initial-page') {
      tree.onToggleExpand(new MouseEvent('click'), root);
      queueMicrotask(() => {
        const refreshedRoot = tree.visibleRows()[0];
        if (refreshedRoot && !refreshedRoot.expanded) {
          tree.onToggleExpand(new MouseEvent('click'), refreshedRoot);
        }
      });
    }
  }

  public scrollToPage2(): void {
    this.expandRoot();
    const tree = this.tree();
    const viewport = tree?.viewport();
    if (!tree || !viewport) {
      return;
    }

    const targetIndex = 50;
    queueMicrotask(() => {
      viewport.scrollToIndex(targetIndex);
      tree.ensureViewportRangeLoaded();
    });
  }

  public retryFailedPages(): void {
    this.retryEnabled.set(true);
    if (this.mode() === 'initial-page') {
      this.expandRoot();
      return;
    }

    const tree = this.tree();
    tree?.ensureViewportRangeLoaded();
  }
}

@Component({
  selector: 'pinned-navigation-edge-story',
  standalone: true,
  imports: [CommonModule, TreeExplorerComponent],
  template: `
    <div style="display:grid; grid-template-columns: 1fr 340px; gap: 12px; height: 80vh; padding: 12px; box-sizing: border-box; background: #f7f8f9;">
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
      <aside style="border: 1px solid #d7dce0; border-radius: 10px; background: #fff; padding: 12px; font-family: Roboto, sans-serif; font-size: 13px;">
        <button type="button" data-testid="navigate-pinned" (click)="navigatePinned()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer; margin-bottom: 10px;">
          Navigate Pinned Target
        </button>
        <p data-testid="requests" style="margin: 0 0 6px;">Requests made: {{ requestsText() || 'none' }}</p>
        <p data-testid="inflight" style="margin: 0 0 6px;">In-flight: {{ inFlightText() || 'none' }}</p>
        <p data-testid="errors" style="margin: 0 0 6px;">Errored states: {{ errorsText() || 'none' }}</p>
        <p data-testid="navigation" style="margin: 0;">Navigation outcome: {{ navigationOutcome() }}</p>
      </aside>
    </div>
  `,
})
class PinnedNavigationEdgeStoryComponent {
  public readonly tree = viewChild<TreeExplorerComponent<EdgeNode, EdgeNode>>('tree');
  public readonly mode = input<'success' | 'failure'>('success');
  public readonly data: EdgeNode[] = [{ id: 'root', name: 'Root', hasChildren: true }];

  public readonly requests = signal<string[]>([]);
  public readonly inFlight = signal<string[]>([]);
  public readonly errors = signal<string[]>([]);
  public readonly navigationOutcome = signal('idle');
  public readonly requestsText = computed(() => this.requests().join(', '));
  public readonly inFlightText = computed(() => this.inFlight().join(', '));
  public readonly errorsText = computed(() => this.errors().join(', '));

  public readonly config: Partial<TreeConfig<EdgeNode>> = {
    selection: { mode: SELECTION_MODES.SINGLE },
    display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: true },
    virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 34 },
    pinned: {
      enabled: true,
      entries: [
        { entryId: 'pin-target', nodeId: 'target-node', label: 'Target Node', order: 0 } satisfies TreePinnedEntry,
      ],
      onNavigate: () => this.navigationOutcome.set('success'),
    },
  };

  public readonly adapter: TreeAdapter<EdgeNode, EdgeNode> = {
    getId: (source) => source.id,
    getLabel: (data) => data.name,
    hasChildren: (data) => !!data.hasChildren,
    resolvePathToNode: (targetId) => ({
      targetId,
      steps: [
        { nodeId: 'root', parentId: null },
        { nodeId: 'folder-a', parentId: 'root' },
        { nodeId: 'target-node', parentId: 'folder-a' },
      ],
    }),
    loadChildren: async (node: TreeNode<EdgeNode>) => {
      const requestKey = node.id;
      this.requests.update((values) => [...values, requestKey]);
      this.inFlight.update((values) => [...values, requestKey]);

      await new Promise((resolve) => setTimeout(resolve, 90));
      this.inFlight.update((values) => values.filter((value) => value !== requestKey));

      if (this.mode() === 'failure' && node.id === 'folder-a') {
        this.errors.update((values) => [...values, `load:${node.id}`]);
        throw new Error('Folder load failed');
      }

      if (node.id === 'root') {
        return [{ id: 'folder-a', name: 'Folder A', hasChildren: true }];
      }

      if (node.id === 'folder-a') {
        return [{ id: 'target-node', name: 'Target Node', hasChildren: false }];
      }

      return [];
    },
  };

  public onLoadError(error: TreeLoadError): void {
    if (error.scope === 'navigation') {
      this.navigationOutcome.set(`failure:${error.reason ?? 'unknown'}`);
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
  title: 'Tree/Errors & edge cases',
  component: TreeExplorerComponent,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj;

export const InitialLoadError: Story = {
  name: 'Initial load error',
  render: () => ({
    template: '<initial-load-error-edge-story />',
    moduleMetadata: {
      imports: [InitialLoadErrorEdgeStoryComponent],
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByTestId('errors')).toHaveTextContent('root');
    });

    await userEvent.click(canvas.getByTestId('retry-initial'));
    await waitFor(async () => {
      await expect(canvas.getByTestId('errors')).toHaveTextContent('none');
    });
  },
};

export const PageAwareInitialPageFails: Story = {
  name: 'Page-aware: initial page fails',
  render: () => ({
    template: '<page-aware-error-edge-story mode="initial-page" />',
    moduleMetadata: {
      imports: [PageAwareErrorEdgeStoryComponent],
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /expand root/i }));
    await waitFor(async () => {
      await expect(canvas.getByTestId('errors')).toHaveTextContent('0');
    });

    await userEvent.click(canvas.getByTestId('retry-pages'));
    await waitFor(async () => {
      await expect(canvas.getByTestId('errors')).toHaveTextContent('none');
    });
  },
};

export const PageAwarePage2Fails: Story = {
  name: 'Page-aware: page 2 fails',
  render: () => ({
    template: '<page-aware-error-edge-story mode="page-2" />',
    moduleMetadata: {
      imports: [PageAwareErrorEdgeStoryComponent],
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /expand root/i }));
    await userEvent.click(await canvas.findByRole('button', { name: /scroll to page 2/i }));
    await waitFor(async () => {
      await expect(canvas.getByTestId('errors')).toHaveTextContent('2');
    });

    await userEvent.click(canvas.getByTestId('retry-pages'));
    await waitFor(async () => {
      await expect(canvas.getByTestId('errors')).toHaveTextContent('none');
    });
  },
};

export const PinnedNavigatesWithAsyncLoad: Story = {
  name: 'Pinned: navigates successfully via async branch load',
  render: () => ({
    template: '<pinned-navigation-edge-story mode="success" />',
    moduleMetadata: {
      imports: [PinnedNavigationEdgeStoryComponent],
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByTestId('navigate-pinned'));
    await waitFor(async () => {
      await expect(canvas.getByTestId('navigation')).toHaveTextContent('success');
    });
  },
};

export const PinnedNavigationFailsGracefully: Story = {
  name: 'Pinned: cannot reach target',
  render: () => ({
    template: '<pinned-navigation-edge-story mode="failure" />',
    moduleMetadata: {
      imports: [PinnedNavigationEdgeStoryComponent],
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
