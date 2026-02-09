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

type UserNode = {
  id: string;
  kind: 'user';
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

type DomainNode = UserNode | PostNode;

const ROOT_USERS = 1000;
const POSTS_PER_USER = 1000;
const PAGE_SIZE = 50;
const FIRST_USER_ID = 'user-0';

const roots: UserNode[] = Array.from({ length: ROOT_USERS }, (_, index) => ({
  id: `user-${index}`,
  kind: 'user',
  name: `User ${index}`,
  hasChildren: true,
}));

function isPageRequest(value: unknown): value is PageRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybe = value as { pageIndex?: unknown; pageSize?: unknown };
  return typeof maybe.pageIndex === 'number' && typeof maybe.pageSize === 'number';
}

function mockPostsApi(userId: string, request: PageRequest): Promise<PageResult<DomainNode>> {
  const offset = request.pageIndex * request.pageSize;
  const end = Math.min(offset + request.pageSize, POSTS_PER_USER);

  const items: PostNode[] = Array.from({ length: Math.max(0, end - offset) }, (_, index) => {
    const absoluteIndex = offset + index;
    return {
      id: `${userId}-post-${absoluteIndex}`,
      kind: 'post',
      userId,
      title: `Post ${absoluteIndex}`,
      hasChildren: false,
    };
  });

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        items: items as DomainNode[],
        totalCount: POSTS_PER_USER,
      });
    }, 110);
  });
}

@Component({
  selector: 'nested-page-aware-story-host',
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

      <aside style="height: 100%; border: 1px solid #d7dce0; border-radius: 10px; background: #fff; padding: 12px; box-sizing: border-box; font-family: 'Roboto', sans-serif; font-size: 13px; color: #1f2a37;">
        <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
          <button type="button" (click)="expandFirstUser()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Expand First User</button>
          <button type="button" (click)="scrollFirstUserPostsNearBottom()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Scroll First User Near Bottom</button>
          <button type="button" (click)="scrollTop()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Scroll Top</button>
        </div>

        <p style="margin: 0 0 8px 0;"><strong>Nested page-aware debug</strong></p>
        <p style="margin: 0 0 8px 0;" data-testid="visible-rows">Visible rows: {{ visibleRowsCount() }}</p>
        <p style="margin: 0 0 8px 0;" data-testid="requested-first-user">First user requested pages: {{ firstUserRequestedPagesText() || 'none' }}</p>
        <p style="margin: 0 0 8px 0;">First user cached pages: {{ firstUserCachedPagesText() || 'none' }}</p>
        <p style="margin: 0 0 8px 0;">First user in-flight pages: {{ firstUserInFlightPagesText() || 'none' }}</p>
        <p style="margin: 0 0 8px 0;">Total requests: {{ requestedPages().length }}</p>
        <p style="margin: 0 0 8px 0;">Root users: {{ data.length }}</p>
        <p style="margin: 0;">Posts per user: {{ postsPerUser }}</p>
      </aside>
    </div>
  `,
})
class NestedPageAwareVirtualScrollStoryComponent {
  public readonly tree = viewChild<TreeExplorerComponent<DomainNode, DomainNode>>('tree');

  public readonly data = roots;
  public readonly postsPerUser = POSTS_PER_USER;

  public readonly requestedPages = signal<string[]>([]);
  public readonly inFlightPages = signal<string[]>([]);
  public readonly cachedPages = signal<string[]>([]);

  public readonly firstUserRequestedPagesText = computed(() =>
    this.extractUserPages(this.requestedPages(), FIRST_USER_ID).join(', '),
  );

  public readonly firstUserInFlightPagesText = computed(() =>
    this.extractUserPages(this.inFlightPages(), FIRST_USER_ID).join(', '),
  );

  public readonly firstUserCachedPagesText = computed(() =>
    this.extractUserPages(this.cachedPages(), FIRST_USER_ID).join(', '),
  );

  public readonly config: Partial<TreeConfig<DomainNode>> = {
    display: { indentPx: 22, density: TREE_DENSITY.NORMAL, showIcons: true },
    virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 34 },
  };

  public readonly adapter: TreeAdapter<DomainNode, DomainNode> = {
    getId: (source) => source.id,
    getLabel: (data) => data.kind === 'user' ? data.name : data.title,
    getIcon: (data) => data.kind === 'user' ? 'person' : 'description',
    hasChildren: (data) => data.kind === 'user',
    getPagination: (node) => {
      if (node.data.kind === 'user') {
        return { enabled: true, pageSize: PAGE_SIZE, pageIndexing: 'zero-based' };
      }
      return undefined;
    },
    loadChildren: (node, reqOrSource): Promise<PageResult<DomainNode>> => {
      if (node.data.kind !== 'user') {
        return Promise.resolve({ items: [], totalCount: 0 });
      }

      const request = isPageRequest(reqOrSource)
        ? reqOrSource
        : { pageIndex: 0, pageSize: PAGE_SIZE };

      const key = `${node.id}:${request.pageIndex}`;
      this.requestedPages.update((pages) => pages.includes(key) ? pages : [...pages, key]);
      this.inFlightPages.update((pages) => pages.includes(key) ? pages : [...pages, key]);

      return mockPostsApi(node.id, request).then((result) => {
        this.inFlightPages.update((pages) => pages.filter((value) => value !== key));
        this.cachedPages.update((pages) => pages.includes(key) ? pages : [...pages, key]);
        return result;
      });
    },
  };

  public expandFirstUser(): void {
    const tree = this.tree();
    if (!tree) {
      return;
    }

    const firstUserRow = tree.visibleRows().find((row) => row.id === FIRST_USER_ID);
    if (!firstUserRow || firstUserRow.expanded || firstUserRow.isLeaf) {
      return;
    }

    tree.onToggleExpand(new MouseEvent('click'), firstUserRow);
  }

  public scrollFirstUserPostsNearBottom(): void {
    const tree = this.tree();
    const viewport = tree?.viewport();
    if (!tree || !viewport) {
      return;
    }

    const rows = tree.visibleRows();
    const firstUserIndex = rows.findIndex((row) => row.id === FIRST_USER_ID);
    if (firstUserIndex < 0) {
      return;
    }

    const targetIndex = Math.max(0, Math.min(rows.length - 1, firstUserIndex + POSTS_PER_USER));
    viewport.checkViewportSize();
    viewport.scrollToIndex(targetIndex);
    queueMicrotask(() => viewport.scrollToIndex(targetIndex));
  }

  public scrollTop(): void {
    this.tree()?.viewport()?.scrollToIndex(0);
  }

  public visibleRowsCount(): number {
    return this.tree()?.visibleRows().length ?? 0;
  }

  private extractUserPages(entries: string[], userId: string): number[] {
    return entries
      .filter((entry) => entry.startsWith(`${userId}:`))
      .map((entry) => Number(entry.split(':')[1]))
      .filter((page) => Number.isFinite(page))
      .sort((a, b) => a - b);
  }
}

const meta: Meta<NestedPageAwareVirtualScrollStoryComponent> = {
  title: 'Tree/Page-aware nested virtual scroll',
  component: NestedPageAwareVirtualScrollStoryComponent,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<NestedPageAwareVirtualScrollStoryComponent>;

export const UsersAndPosts: Story = {};
