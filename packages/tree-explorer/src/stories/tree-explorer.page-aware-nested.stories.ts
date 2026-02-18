import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Meta, StoryObj } from '@storybook/angular';
import {
  PageRequest,
  PageResult,
  TreeAdapter,
  TreeConfig,
  TreeContextAction,
  TreeNode,
  TreePinnedEntry,
  TreeRowViewModel,
  TREE_DENSITY,
  VIRTUALIZATION_MODES,
} from '@tree-core';
import { TreeExplorerComponent } from '../public-api';

interface TreeNodeEvent<T> {
  node: TreeNode<T>;
  row: TreeRowViewModel<T>;
  event: Event;
}

interface TreeContextMenuEvent<T> {
  node: TreeNode<T>;
  row: TreeRowViewModel<T>;
  pinnedEntry?: TreePinnedEntry;
  target?: 'node' | 'pinned';
  action: TreeContextAction<T>;
  event: Event;
}

interface TreeDragEvent<T> {
  node: TreeNode<T>;
  row: TreeRowViewModel<T>;
  event: DragEvent;
}

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

const DEFAULT_ROOT_USERS = 1000;
const DEFAULT_POSTS_PER_USER = 1000;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_FIRST_USER_ID = 'user-0';
const DEFAULT_INITIAL_LOAD_DELAY_MS = 800;
const DEFAULT_CHILD_LOAD_DELAY_MS = 550;
const DEFAULT_ITEM_SIZE = 34;
const DEFAULT_INDENT_PX = 22;
const MAX_LOG_LINES = 10;

function toFiniteInt(value: unknown, fallback: number, min: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.floor(numeric));
}

function isPageRequest(value: unknown): value is PageRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybe = value as { pageIndex?: unknown; pageSize?: unknown };
  return typeof maybe.pageIndex === 'number' && typeof maybe.pageSize === 'number';
}

function wait<T>(value: T, delayMs: number): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), delayMs);
  });
}

@Component({
  selector: 'nested-page-aware-story-host',
  standalone: true,
  imports: [CommonModule, TreeExplorerComponent],
  template: `
    <div style="display: grid; grid-template-columns: 1fr 390px; gap: 12px; height: 80vh; padding: 12px; box-sizing: border-box; background: #f7f8f9;">
      <div style="height: 100%; border: 1px solid #d7dce0; border-radius: 10px; overflow: hidden; background: #fff;">
        <tree-explorer
          #tree
          [data]="data()"
          [adapter]="adapter"
          [config]="config()"
          (itemToggleExpand)="onItemToggleExpand($event)"
          (contextMenuAction)="onContextMenuAction($event)"
          (dragStart)="onDragEvent('dragStart', $event)"
          (drop)="onDragEvent('drop', $event)"
          (dragEnd)="onDragEvent('dragEnd', $event)"
          style="height: 100%; display: block;">
        </tree-explorer>
      </div>

      <aside style="height: 100%; border: 1px solid #d7dce0; border-radius: 10px; background: #fff; padding: 12px; box-sizing: border-box; font-family: 'Roboto', sans-serif; font-size: 13px; color: #1f2a37; display: grid; grid-template-rows: auto auto 1fr; gap: 8px;">
        <div style="display: flex; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
          <button type="button" (click)="expandTargetUser()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Expand Target User</button>
          <button type="button" (click)="scrollTargetUserPostsNearBottom()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Scroll Target User Near Bottom</button>
          <button type="button" (click)="scrollTop()" style="padding: 6px 10px; border: 1px solid #c7ced5; border-radius: 6px; background: #fff; cursor: pointer;">Scroll Top</button>
        </div>

        <div>
          <p style="margin: 0 0 8px 0;"><strong>Nested page-aware debug</strong></p>
          <p style="margin: 0 0 8px 0;" data-testid="visible-rows">Visible rows: {{ visibleRowsCount() }}</p>
          <p style="margin: 0 0 8px 0;">Focused user id: {{ focusedUserId() }}</p>
          <p style="margin: 0 0 8px 0;" data-testid="requested-target-user">Focused user requested pages: {{ focusedUserRequestedPagesText() || 'none' }}</p>
          <p style="margin: 0 0 8px 0;">Focused user cached pages: {{ focusedUserCachedPagesText() || 'none' }}</p>
          <p style="margin: 0 0 8px 0;">Focused user in-flight pages: {{ focusedUserInFlightPagesText() || 'none' }}</p>
          <p style="margin: 0 0 8px 0;">All requested page keys: {{ allRequestedPageKeysText() || 'none' }}</p>
          <p style="margin: 0 0 8px 0;">Total requests: {{ requestedPages().length }}</p>
          <p style="margin: 0 0 8px 0;">Root users: {{ rootUsers() }}</p>
          <p style="margin: 0 0 8px 0;">Posts per user: {{ postsPerUser() }}</p>
          <p style="margin: 0 0 8px 0;">Page size: {{ pageSize() }}</p>
          <p style="margin: 0 0 8px 0;">Target user id: {{ targetUserId() }}</p>
          <p style="margin: 0 0 8px 0;">Initial load delay: {{ initialLoadDelayMs() }}ms</p>
          <p style="margin: 0;">Children load delay: {{ childLoadDelayMs() }}ms</p>
        </div>

        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; overflow: auto; background: #fbfcfd;">
          <p style="margin: 0 0 6px 0;"><strong>Event Log</strong></p>
          <pre style="margin: 0; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace; font-size: 12px; line-height: 1.35;">{{ logText() || 'No events yet' }}</pre>
        </div>
      </aside>
    </div>
  `,
})
class NestedPageAwareVirtualScrollStoryComponent {
  public readonly tree = viewChild<TreeExplorerComponent<DomainNode, DomainNode>>('tree');

  public readonly rootUsers = input(DEFAULT_ROOT_USERS);
  public readonly postsPerUser = input(DEFAULT_POSTS_PER_USER);
  public readonly pageSize = input(DEFAULT_PAGE_SIZE);
  public readonly targetUserId = input(DEFAULT_FIRST_USER_ID);
  public readonly initialLoadDelayMs = input(DEFAULT_INITIAL_LOAD_DELAY_MS);
  public readonly childLoadDelayMs = input(DEFAULT_CHILD_LOAD_DELAY_MS);
  public readonly itemSize = input(DEFAULT_ITEM_SIZE);
  public readonly indentPx = input(DEFAULT_INDENT_PX);
  public readonly showIcons = input(true);

  public readonly data = signal<DomainNode[] | Promise<DomainNode[]>>([]);

  public readonly requestedPages = signal<string[]>([]);
  public readonly inFlightPages = signal<string[]>([]);
  public readonly cachedPages = signal<string[]>([]);
  public readonly logLines = signal<string[]>([]);
  public readonly lastRequestedUserId = signal<string | null>(null);

  public readonly logText = computed(() => this.logLines().join('\n'));

  public readonly focusedUserId = computed(() =>
    this.lastRequestedUserId() ?? this.targetUserId(),
  );

  public readonly focusedUserRequestedPagesText = computed(() =>
    this.extractUserPages(this.requestedPages(), this.focusedUserId()).join(', '),
  );

  public readonly focusedUserInFlightPagesText = computed(() =>
    this.extractUserPages(this.inFlightPages(), this.focusedUserId()).join(', '),
  );

  public readonly focusedUserCachedPagesText = computed(() =>
    this.extractUserPages(this.cachedPages(), this.focusedUserId()).join(', '),
  );

  public readonly allRequestedPageKeysText = computed(() =>
    this.requestedPages().slice().sort().join(', '),
  );

  public readonly actions: TreeContextAction<DomainNode>[] = [
    {
      id: 'user-details',
      label: () => 'Details',
      icon: () => 'info',
      visible: (item) => item.kind === 'user',
      handler: (node) => this.appendLog(`context handler: user details -> ${node.id}`),
    },
    {
      id: 'user-login',
      label: () => 'Login',
      icon: () => 'login',
      visible: (item) => item.kind === 'user',
      handler: (node) => this.appendLog(`context handler: user login -> ${node.id}`),
    },
    {
      id: 'post-print',
      label: () => 'Print',
      icon: () => 'print',
      visible: (item) => item.kind === 'post',
      handler: (node) => this.appendLog(`context handler: post print -> ${node.id}`),
    },
    {
      id: 'post-details',
      label: () => 'Details',
      icon: () => 'description',
      visible: (item) => item.kind === 'post',
      handler: (node) => this.appendLog(`context handler: post details -> ${node.id}`),
    },
  ];

  public readonly config = computed<Partial<TreeConfig<DomainNode>>>(() => ({
    display: {
      indentPx: this.getIndentPx(),
      density: TREE_DENSITY.NORMAL,
      showIcons: this.showIcons(),
    },
    virtualization: {
      mode: VIRTUALIZATION_MODES.AUTO,
      itemSize: this.getItemSize(),
    },
    dragDrop: true,
    actions: this.actions,
  }));

  public readonly adapter: TreeAdapter<DomainNode, DomainNode> = {
    getId: (source) => source.id,
    getLabel: (data) => data.kind === 'user' ? data.name : data.title,
    getIcon: (data) => data.kind === 'user' ? 'person' : 'description',
    getDragData: (data) => ({ id: data.id, kind: data.kind }),
    hasChildren: (data) => data.kind === 'user',
    getPagination: (node) => {
      if (node.data.kind === 'user') {
        return {
          enabled: true,
          pageSize: this.getPageSize(),
          pageIndexing: 'zero-based',
        };
      }
      return undefined;
    },
    loadChildren: (node, reqOrSource): Promise<PageResult<DomainNode>> => {
      if (node.data.kind !== 'user') {
        return Promise.resolve({ items: [], totalCount: 0 });
      }

      const resolvedPageSize = this.getPageSize();
      const request = isPageRequest(reqOrSource)
        ? reqOrSource
        : { pageIndex: 0, pageSize: resolvedPageSize };

      const key = `${node.id}:${request.pageIndex}`;
      this.lastRequestedUserId.set(node.id);
      this.appendLog(`request: ${key}`);
      this.requestedPages.update((pages) => pages.includes(key) ? pages : [...pages, key]);
      this.inFlightPages.update((pages) => pages.includes(key) ? pages : [...pages, key]);

      return this.mockPostsApi(node.id, request).then((result) => {
        this.appendLog(`resolved: ${key}`);
        this.inFlightPages.update((pages) => pages.filter((value) => value !== key));
        this.cachedPages.update((pages) => pages.includes(key) ? pages : [...pages, key]);
        return result;
      });
    },
  };

  constructor() {
    effect(() => {
      const count = this.getRootUsers();
      const delayMs = this.getInitialLoadDelayMs();

      this.resetDebugState();
      this.data.set(wait(this.buildUsers(count) as DomainNode[], delayMs));
    });
  }

  public onContextMenuAction(event: TreeContextMenuEvent<DomainNode>): void {
    this.appendLog(`context event: ${event.action.id} -> ${event.node.id}`);
  }

  public onItemToggleExpand(event: TreeNodeEvent<DomainNode>): void {
    this.lastRequestedUserId.set(event.node.id);
    this.appendLog(`expand: ${event.node.id}`);
  }

  public onDragEvent(type: 'dragStart' | 'drop' | 'dragEnd', event: TreeDragEvent<DomainNode>): void {
    this.appendLog(`${type}: ${event.node.id}`);
  }

  public expandTargetUser(): void {
    const tree = this.tree();
    const targetRow = this.getTargetUserRow();
    if (!tree || !targetRow) {
      this.appendLog('expand skipped: target user row not found');
      return;
    }

    if (targetRow.isLeaf) {
      this.appendLog(`expand skipped: ${targetRow.id} is leaf`);
      return;
    }

    this.lastRequestedUserId.set(targetRow.id);

    if (targetRow.expanded) {
      this.appendLog(`expand skipped: ${targetRow.id} already expanded`);
      return;
    }

    this.appendLog(`expand click: ${targetRow.id}`);
    tree.onToggleExpand(new MouseEvent('click'), targetRow);
    queueMicrotask(() => tree.ensureViewportRangeLoaded());
  }

  public scrollTargetUserPostsNearBottom(): void {
    this.expandTargetUser();
    this.waitForTargetChildrenThenScroll(0);
  }

  public scrollTop(): void {
    const tree = this.tree();
    const viewport = tree?.viewport();
    if (!tree || !viewport) {
      return;
    }

    viewport.scrollToIndex(0);
    queueMicrotask(() => tree.ensureViewportRangeLoaded());
  }

  public visibleRowsCount(): number {
    return this.tree()?.visibleRows().length ?? 0;
  }

  private getTargetUserRow() {
    const tree = this.tree();
    if (!tree) {
      return undefined;
    }

    const rows = tree.visibleRows();
    const targetId = this.targetUserId();

    return rows.find((row) => !row.placeholder && row.id === targetId)
      ?? rows.find((row) => !row.placeholder && !row.isLeaf && row.data?.kind === 'user');
  }

  private waitForTargetChildrenThenScroll(attempt: number): void {
    const tree = this.tree();
    const viewport = tree?.viewport();
    const targetRow = this.getTargetUserRow();
    if (!tree || !viewport || !targetRow) {
      return;
    }

    const rows = tree.visibleRows();
    const targetIndex = rows.findIndex((row) => row.id === targetRow.id);
    if (targetIndex < 0) {
      return;
    }

    const nextRow = rows[targetIndex + 1];
    const childrenReady = !!nextRow && nextRow.parentId === targetRow.id;

    if (!childrenReady) {
      if (attempt >= 40) {
        this.appendLog(`scroll timeout: children for ${targetRow.id} not materialized`);
        return;
      }

      setTimeout(() => this.waitForTargetChildrenThenScroll(attempt + 1), 100);
      return;
    }

    const targetChildrenIndices = rows
      .map((row, index) => row.parentId === targetRow.id ? index : -1)
      .filter((index) => index >= 0);

    const jumpSize = this.getPostsPerUser();
    const fallbackIndex = targetIndex + jumpSize;
    const childTailIndex = targetChildrenIndices.length > 0
      ? targetChildrenIndices[targetChildrenIndices.length - 1]
      : fallbackIndex;
    const scrollIndex = Math.max(
      0,
      Math.min(rows.length - 1, Math.max(targetIndex + 1, childTailIndex)),
    );

    this.appendLog(`scroll to index ${scrollIndex} for ${targetRow.id}`);
    viewport.checkViewportSize();
    viewport.scrollToIndex(scrollIndex);

    queueMicrotask(() => {
      viewport.scrollToIndex(scrollIndex);
      tree.ensureViewportRangeLoaded();
      setTimeout(() => tree.ensureViewportRangeLoaded(), 0);
      setTimeout(() => tree.ensureViewportRangeLoaded(), 120);
    });
  }

  private buildUsers(count: number): UserNode[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `user-${index}`,
      kind: 'user',
      name: `User ${index}`,
      hasChildren: true,
    }));
  }

  private mockPostsApi(userId: string, request: PageRequest): Promise<PageResult<DomainNode>> {
    const postsPerUser = this.getPostsPerUser();
    const offset = request.pageIndex * request.pageSize;
    const end = Math.min(offset + request.pageSize, postsPerUser);

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

    return wait(
      {
        items: items as DomainNode[],
        totalCount: postsPerUser,
      },
      this.getChildLoadDelayMs(),
    );
  }

  private getRootUsers(): number {
    return toFiniteInt(this.rootUsers(), DEFAULT_ROOT_USERS, 1);
  }

  private getPostsPerUser(): number {
    return toFiniteInt(this.postsPerUser(), DEFAULT_POSTS_PER_USER, 1);
  }

  private getPageSize(): number {
    return toFiniteInt(this.pageSize(), DEFAULT_PAGE_SIZE, 1);
  }

  private getInitialLoadDelayMs(): number {
    return toFiniteInt(this.initialLoadDelayMs(), DEFAULT_INITIAL_LOAD_DELAY_MS, 0);
  }

  private getChildLoadDelayMs(): number {
    return toFiniteInt(this.childLoadDelayMs(), DEFAULT_CHILD_LOAD_DELAY_MS, 0);
  }

  private getItemSize(): number {
    return toFiniteInt(this.itemSize(), DEFAULT_ITEM_SIZE, 24);
  }

  private getIndentPx(): number {
    return toFiniteInt(this.indentPx(), DEFAULT_INDENT_PX, 8);
  }

  private extractUserPages(entries: string[], userId: string): number[] {
    return entries
      .filter((entry) => entry.startsWith(`${userId}:`))
      .map((entry) => Number(entry.split(':')[1]))
      .filter((page) => Number.isFinite(page))
      .sort((a, b) => a - b);
  }

  private appendLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    this.logLines.update((lines) => [`[${timestamp}] ${message}`, ...lines].slice(0, MAX_LOG_LINES));
  }

  private resetDebugState(): void {
    this.requestedPages.set([]);
    this.inFlightPages.set([]);
    this.cachedPages.set([]);
    this.logLines.set([]);
    this.lastRequestedUserId.set(null);
  }
}

type NestedPageAwareStoryArgs = {
  rootUsers: number;
  postsPerUser: number;
  pageSize: number;
  targetUserId: string;
  initialLoadDelayMs: number;
  childLoadDelayMs: number;
  itemSize: number;
  indentPx: number;
  showIcons: boolean;
};

const meta: Meta<NestedPageAwareVirtualScrollStoryComponent> = {
  title: 'Tree/Virtual scroll/Page aware',
  component: NestedPageAwareVirtualScrollStoryComponent,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    rootUsers: { control: { type: 'number', min: 1, max: 5000, step: 100 } },
    postsPerUser: { control: { type: 'number', min: 1, max: 5000, step: 100 } },
    pageSize: { control: { type: 'number', min: 1, max: 500, step: 10 } },
    targetUserId: { control: 'text' },
    initialLoadDelayMs: { control: { type: 'number', min: 0, max: 5000, step: 50 } },
    childLoadDelayMs: { control: { type: 'number', min: 0, max: 5000, step: 50 } },
    itemSize: { control: { type: 'number', min: 24, max: 80, step: 2 } },
    indentPx: { control: { type: 'number', min: 8, max: 48, step: 2 } },
    showIcons: { control: 'boolean' },
  },
};

export default meta;

type Story = StoryObj<NestedPageAwareVirtualScrollStoryComponent & NestedPageAwareStoryArgs>;

export const UsersAndPosts: Story = {
  args: {
    rootUsers: DEFAULT_ROOT_USERS,
    postsPerUser: DEFAULT_POSTS_PER_USER,
    pageSize: DEFAULT_PAGE_SIZE,
    targetUserId: DEFAULT_FIRST_USER_ID,
    initialLoadDelayMs: DEFAULT_INITIAL_LOAD_DELAY_MS,
    childLoadDelayMs: 300,
    itemSize: DEFAULT_ITEM_SIZE,
    indentPx: DEFAULT_INDENT_PX,
    showIcons: true,
  },
};
UsersAndPosts.storyName = '(1000 users, 1000 posts)';
