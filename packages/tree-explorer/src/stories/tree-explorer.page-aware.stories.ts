import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  PageRequest,
  PageResult,
  TreeAdapter,
  TreeConfig,
  TREE_DENSITY,
  VIRTUALIZATION_MODES,
} from '@tree-core';
import { TreeExplorerComponent } from '../public-api';

type RootNode = {
  id: string;
  name: string;
  hasChildren: boolean;
};

type ChildNode = {
  id: string;
  name: string;
  hasChildren: false;
};

type DomainNode = RootNode | ChildNode;

const TOTAL_CHILDREN = 10000;
const PAGE_SIZE = 50;
const ROOT_ID = 'catalog';

function isPageRequest(value: unknown): value is PageRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybe = value as { pageIndex?: unknown; pageSize?: unknown };
  return typeof maybe.pageIndex === 'number' && typeof maybe.pageSize === 'number';
}

function mockChildrenApi(request: PageRequest): Promise<{
  body: ChildNode[];
  headers: Record<string, string>;
}> {
  const offset = request.pageIndex * request.pageSize;
  const end = Math.min(offset + request.pageSize, TOTAL_CHILDREN);

  const body = Array.from({ length: Math.max(0, end - offset) }, (_, index) => {
    const absoluteIndex = offset + index;
    return {
      id: `${ROOT_ID}-${absoluteIndex}`,
      name: `Record ${absoluteIndex}`,
      hasChildren: false as const,
    };
  });

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        body,
        headers: {
          'X-Total-Count': String(TOTAL_CHILDREN),
        },
      });
    }, 140);
  });
}

@Component({
  selector: 'page-aware-story-host',
  standalone: true,
  imports: [CommonModule, TreeExplorerComponent],
  template: `
    <div style="display: grid; grid-template-columns: 1fr 320px; gap: 12px; height: 80vh; padding: 12px; box-sizing: border-box; background: #f7f8f9;">
      <div style="height: 100%; border: 1px solid #d7dce0; border-radius: 10px; overflow: hidden; background: #fff;">
        <tree-explorer
          #tree
          [data]="roots"
          [adapter]="adapter"
          [config]="config"
          style="height: 100%; display: block;">
        </tree-explorer>
      </div>

      <aside style="height: 100%; border: 1px solid #d7dce0; border-radius: 10px; background: #fff; padding: 12px; box-sizing: border-box; font-family: 'Roboto', sans-serif; font-size: 13px; color: #1f2a37;">
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
          <button type="button" (click)="expandRoot()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Expand Root</button>
          <button type="button" (click)="scrollNearBottom()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Scroll Near Bottom</button>
          <button type="button" (click)="scrollTop()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Scroll Top</button>
        </div>

        <p style="margin: 0 0 8px 0;"><strong>Page-aware debug</strong></p>
        <p style="margin: 0 0 8px 0;" data-testid="requested-pages">Requested pages: {{ requestedPagesText() || 'none' }}</p>
        <p style="margin: 0 0 8px 0;" data-testid="in-flight-pages">In-flight pages: {{ inFlightPagesText() || 'none' }}</p>
        <p style="margin: 0 0 8px 0;" data-testid="cached-pages">Cached pages: {{ cachedPagesText() || 'none' }}</p>
        <p style="margin: 0 0 8px 0;">Cache size: {{ cacheSize() }}</p>
        <p style="margin: 0 0 8px 0;" data-testid="visible-rows">Visible rows: {{ visibleRowsCount() }}</p>
        <p style="margin: 0;" data-testid="total-count">Total count (X-Total-Count): {{ totalCount() ?? 'unknown' }}</p>
      </aside>
    </div>
  `,
})
class PageAwareVirtualScrollStoryComponent {
  public readonly tree = viewChild<TreeExplorerComponent<DomainNode, DomainNode>>('tree');

  public readonly roots: RootNode[] = [
    { id: ROOT_ID, name: 'Remote catalog (10000 rows)', hasChildren: true },
  ];

  public readonly requestedPages = signal<number[]>([]);
  public readonly inFlightPages = signal<number[]>([]);
  public readonly cachedPages = signal<number[]>([]);
  public readonly totalCount = signal<number | null>(null);

  public readonly requestedPagesText = computed(() =>
    this.requestedPages().slice().sort((a, b) => a - b).join(', '),
  );
  public readonly inFlightPagesText = computed(() =>
    this.inFlightPages().slice().sort((a, b) => a - b).join(', '),
  );
  public readonly cachedPagesText = computed(() =>
    this.cachedPages().slice().sort((a, b) => a - b).join(', '),
  );
  public readonly cacheSize = computed(() => this.cachedPages().length);

  public readonly config: Partial<TreeConfig<DomainNode>> = {
    display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: false },
    virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 34 },
  };

  public readonly adapter: TreeAdapter<DomainNode, DomainNode> = {
    getId: (source) => source.id,
    getLabel: (data) => data.name,
    hasChildren: (data) => !!data.hasChildren,
    getPagination: (node) => {
      if (node.id === ROOT_ID) {
        return { enabled: true, pageSize: PAGE_SIZE, pageIndexing: 'zero-based' };
      }
      return undefined;
    },
    loadChildren: (node, reqOrSource): Promise<PageResult<DomainNode>> => {
      if (node.id !== ROOT_ID) {
        return Promise.resolve({ items: [], totalCount: 0 });
      }

      const request = isPageRequest(reqOrSource)
        ? reqOrSource
        : { pageIndex: 0, pageSize: PAGE_SIZE };

      this.requestedPages.update((pages) =>
        pages.includes(request.pageIndex) ? pages : [...pages, request.pageIndex],
      );

      this.inFlightPages.update((pages) =>
        pages.includes(request.pageIndex) ? pages : [...pages, request.pageIndex],
      );

      return mockChildrenApi(request).then((response): PageResult<DomainNode> => {
        const parsedTotalCount = Number(response.headers['X-Total-Count']);

        this.totalCount.set(parsedTotalCount);
        this.inFlightPages.update((pages) => pages.filter((page) => page !== request.pageIndex));
        this.cachedPages.update((pages) =>
          pages.includes(request.pageIndex) ? pages : [...pages, request.pageIndex],
        );

        return {
          items: response.body as DomainNode[],
          totalCount: parsedTotalCount,
        };
      });
    },
  };

  public expandRoot(): void {
    const tree = this.tree();
    const firstRow = tree?.visibleRows()[0];
    if (tree && firstRow && !firstRow.expanded) {
      tree.onToggleExpand(new MouseEvent('click'), firstRow);
    }
  }

  public scrollNearBottom(): void {
    const tree = this.tree();
    const viewport = tree?.viewport();
    if (!viewport) {
      return;
    }

    const rows = tree?.visibleRows() ?? [];
    const targetIndex = Math.max(0, rows.length - 1);
    viewport.checkViewportSize();
    viewport.scrollToIndex(targetIndex);
    queueMicrotask(() => viewport.scrollToIndex(targetIndex));
  }

  public scrollTop(): void {
    const tree = this.tree();
    tree?.viewport()?.scrollToIndex(0);
  }

  public visibleRowsCount(): number {
    return this.tree()?.visibleRows().length ?? 0;
  }
}

const meta: Meta<PageAwareVirtualScrollStoryComponent> = {
  title: 'Tree/Virtual scroll/Page aware',
  component: PageAwareVirtualScrollStoryComponent,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<PageAwareVirtualScrollStoryComponent>;

export const Validation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const expandButton = await canvas.findByRole('button', {
      name: /expand root/i,
    });
    await userEvent.click(expandButton);

    const scrollButton = await canvas.findByRole('button', {
      name: /scroll near bottom/i,
    });

    await waitFor(async () => {
      const requestedPages = await canvas.findByTestId('requested-pages');
      await expect(requestedPages).toHaveTextContent('0');
    });

    await waitFor(async () => {
      const totalCount = await canvas.findByTestId('total-count');
      const cachedPages = await canvas.findByTestId('cached-pages');
      const visibleRows = await canvas.findByTestId('visible-rows');
      await expect(totalCount).toHaveTextContent(String(TOTAL_CHILDREN));
      await expect(cachedPages).toHaveTextContent('0');
      await expect(visibleRows).toHaveTextContent(String(TOTAL_CHILDREN + 1));
    });

    await userEvent.click(scrollButton);

    await waitFor(
      async () => {
        const requestedPages = await canvas.findByTestId('requested-pages');
        const text = requestedPages.textContent ?? '';
        const pages = Array.from(text.matchAll(/\d+/g)).map((match) => Number(match[0]));
        await expect(pages.some((page) => Number.isFinite(page) && page > 0)).toBe(true);
      },
      { timeout: 6000 },
    );
  },
};
Validation.storyName = 'Root level (10000 items)';
