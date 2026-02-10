import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { Meta, StoryObj } from '@storybook/angular';
import {
  PageRequest,
  PageResult,
  TreeAdapter,
  TreeConfig,
  TREE_DENSITY,
  VIRTUALIZATION_MODES,
} from '@tree-core';
import { TreeExplorerComponent } from '../public-api';

type CountryNode = {
  id: string;
  kind: 'country';
  name: string;
  hasChildren: true;
};

type UserNode = {
  id: string;
  kind: 'user';
  countryId: string;
  name: string;
  hasChildren: true;
};

type PostNode = {
  id: string;
  kind: 'post';
  userId: string;
  title: string;
  hasChildren: false;
};

type DomainNode = CountryNode | UserNode | PostNode;

const COUNTRIES = 100;
const USERS_PER_COUNTRY = 1000;
const POSTS_PER_USER = 1000;
const PAGE_SIZE = 100;

function isPageRequest(value: unknown): value is PageRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const maybe = value as { pageIndex?: unknown; pageSize?: unknown };
  return typeof maybe.pageIndex === 'number' && typeof maybe.pageSize === 'number';
}

@Component({
  selector: 'three-level-page-aware-host',
  standalone: true,
  imports: [CommonModule, TreeExplorerComponent],
  template: `
    <div style="display: grid; grid-template-columns: 1fr 360px; gap: 12px; height: 80vh; padding: 12px; box-sizing: border-box; background: #f7f8f9;">
      <div style="height: 100%; border: 1px solid #d7dce0; border-radius: 10px; overflow: hidden; background: #fff;">
        <tree-explorer
          #tree
          [data]="data"
          [adapter]="adapter"
          [config]="config"
          style="height: 100%; display: block;">
        </tree-explorer>
      </div>

      <aside style="height: 100%; border: 1px solid #d7dce0; border-radius: 10px; background: #fff; padding: 12px; box-sizing: border-box; font-family: Roboto, sans-serif; font-size: 13px;">
        <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
          <button type="button" (click)="expandFirstCountry()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Expand first country</button>
          <button type="button" (click)="scrollNearBottom()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Scroll near bottom</button>
        </div>

        <p style="margin: 0 0 8px;"><strong>3-level page-aware debug</strong></p>
        <p style="margin: 0 0 8px;" data-testid="requests">Requests: {{ requestsText() || 'none' }}</p>
        <p style="margin: 0 0 8px;" data-testid="in-flight">In-flight: {{ inFlightText() || 'none' }}</p>
        <p style="margin: 0 0 8px;" data-testid="cached">Cached: {{ cachedText() || 'none' }}</p>
        <p style="margin: 0;">Visible rows: {{ visibleRowsCount() }}</p>
      </aside>
    </div>
  `,
})
class ThreeLevelPageAwareStoryComponent {
  public readonly tree = viewChild<TreeExplorerComponent<DomainNode, DomainNode>>('tree');

  public readonly data: CountryNode[] = Array.from({ length: COUNTRIES }, (_, index) => ({
    id: `country-${index}`,
    kind: 'country',
    name: `Country ${index}`,
    hasChildren: true,
  }));

  public readonly requests = signal<string[]>([]);
  public readonly inFlight = signal<string[]>([]);
  public readonly cached = signal<string[]>([]);

  public readonly requestsText = computed(() => this.requests().join(', '));
  public readonly inFlightText = computed(() => this.inFlight().join(', '));
  public readonly cachedText = computed(() => this.cached().join(', '));

  public readonly config: Partial<TreeConfig<DomainNode>> = {
    display: { indentPx: 22, density: TREE_DENSITY.NORMAL, showIcons: true },
    virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 34 },
  };

  public readonly adapter: TreeAdapter<DomainNode, DomainNode> = {
    getId: (source) => source.id,
    getLabel: (data) =>
      data.kind === 'country'
        ? data.name
        : data.kind === 'user'
          ? data.name
          : data.title,
    getIcon: (data) =>
      data.kind === 'country'
        ? 'public'
        : data.kind === 'user'
          ? 'person'
          : 'description',
    hasChildren: (data) => data.kind !== 'post',
    getPagination: (node) => {
      if (node.data.kind === 'country' || node.data.kind === 'user') {
        return { enabled: true, pageSize: PAGE_SIZE, pageIndexing: 'zero-based' };
      }
      return undefined;
    },
    loadChildren: (node, reqOrSource): Promise<PageResult<DomainNode>> => {
      const request = isPageRequest(reqOrSource)
        ? reqOrSource
        : { pageIndex: 0, pageSize: PAGE_SIZE };
      const key = `${node.id}:${request.pageIndex}`;

      this.requests.update((items) => (items.includes(key) ? items : [...items, key]));
      this.inFlight.update((items) => (items.includes(key) ? items : [...items, key]));

      return new Promise((resolve) => {
        setTimeout(() => {
          this.inFlight.update((items) => items.filter((item) => item !== key));
          this.cached.update((items) => (items.includes(key) ? items : [...items, key]));

          if (node.data.kind === 'country') {
            const offset = request.pageIndex * request.pageSize;
            const end = Math.min(offset + request.pageSize, USERS_PER_COUNTRY);
            const countryName = node.data.name;
            const items: UserNode[] = Array.from({ length: Math.max(0, end - offset) }, (_, index) => {
              const absolute = offset + index;
              return {
                id: `${node.id}-user-${absolute}`,
                kind: 'user',
                countryId: node.id,
                name: `User ${absolute} (${countryName})`,
                hasChildren: true,
              };
            });
            resolve({
              items: items as DomainNode[],
              totalCount: USERS_PER_COUNTRY,
            });
            return;
          }

          if (node.data.kind === 'user') {
            const offset = request.pageIndex * request.pageSize;
            const end = Math.min(offset + request.pageSize, POSTS_PER_USER);
            const items: PostNode[] = Array.from({ length: Math.max(0, end - offset) }, (_, index) => {
              const absolute = offset + index;
              return {
                id: `${node.id}-post-${absolute}`,
                kind: 'post',
                userId: node.id,
                title: `Post ${absolute}`,
                hasChildren: false,
              };
            });
            resolve({
              items: items as DomainNode[],
              totalCount: POSTS_PER_USER,
            });
            return;
          }

          resolve({ items: [], totalCount: 0 });
        }, 140);
      });
    },
  };

  public expandFirstCountry(): void {
    const tree = this.tree();
    const firstCountry = tree?.visibleRows()[0];
    if (!tree || !firstCountry || firstCountry.expanded) {
      return;
    }
    tree.onToggleExpand(new MouseEvent('click'), firstCountry);
  }

  public scrollNearBottom(): void {
    const tree = this.tree();
    const viewport = tree?.viewport();
    if (!tree || !viewport) {
      return;
    }

    const rows = tree.visibleRows();
    const targetIndex = Math.max(0, rows.length - 1);
    viewport.checkViewportSize();
    viewport.scrollToIndex(targetIndex);
    queueMicrotask(() => viewport.scrollToIndex(targetIndex));
  }

  public visibleRowsCount(): number {
    return this.tree()?.visibleRows().length ?? 0;
  }
}

const meta: Meta<ThreeLevelPageAwareStoryComponent> = {
  title: 'Tree/Virtual scroll/Page aware',
  component: ThreeLevelPageAwareStoryComponent,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<ThreeLevelPageAwareStoryComponent>;

export const CountriesUsersPosts: Story = {};
CountriesUsersPosts.storyName = '3 levels (100 countries, 1000 users, 1000 posts)';
