import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, isObservable } from 'rxjs';
import {
  DEFAULT_TREE_CONFIG,
  PageRequest,
  TreeAdapter,
  TreeChildrenResult,
  TreeConfig,
  TreeEngine,
  TreeFilterInput,
  TreeLoadError,
  TreeNode,
  TreeRowViewModel,
  mapSourcesToNodeGraph,
} from '@tree-core';
import { TREE_CONFIG } from '../tokens/tree.configs';

interface ResolvedLoadChildrenResult<TSource> {
  items: TSource[];
  totalCount?: number;
}

@Injectable()
export class TreeStateService<TSource, T = TSource> {
  private readonly engine = new TreeEngine<T>();
  private readonly stateVersion = signal(0);
  private readonly adapterRef = signal<TreeAdapter<TSource, T> | null>(null);
  private readonly configRef = signal<TreeConfig<T>>(
    DEFAULT_TREE_CONFIG as TreeConfig<T>,
  );
  private readonly rootLoading = signal(false);
  private readonly rootError = signal<TreeLoadError | null>(null);
  private readonly lastError = signal<TreeLoadError | null>(null);

  public readonly visibleRows = computed((): TreeRowViewModel<T>[] => {
    this.stateVersion();
    const adapter = this.adapterRef();
    if (!adapter) {
      return [];
    }
    return this.engine.getFilteredFlatList(adapter, this.configRef());
  });

  public readonly loading = computed(
    () => this.rootLoading() || this.engine.loadingIds.size > 0,
  );

  public readonly rootLoadError = computed(() => this.rootError());

  public readonly loadError = computed(() => this.lastError());

  public readonly selectedIds = computed(() => {
    this.stateVersion();
    return this.engine.selectedIds;
  });

  public readonly expandedIds = computed(() => {
    this.stateVersion();
    return this.engine.expandedIds;
  });

  constructor() {
    const injectedConfig = inject(TREE_CONFIG, { optional: true });
    if (injectedConfig) {
      const merged = {
        ...(DEFAULT_TREE_CONFIG as TreeConfig<T>),
        ...injectedConfig,
        display: {
          ...(DEFAULT_TREE_CONFIG.display as TreeConfig<T>['display']),
          ...injectedConfig.display,
        },
        virtualization: {
          ...(DEFAULT_TREE_CONFIG.virtualization as TreeConfig<T>['virtualization']),
          ...injectedConfig.virtualization,
        },
        filtering: {
          ...(DEFAULT_TREE_CONFIG.filtering as TreeConfig<T>['filtering']),
          ...injectedConfig.filtering,
        },
      };
      this.configRef.set(merged as TreeConfig<T>);
      this.engine.configure(merged as TreeConfig<T>);
    }
  }

  public setAdapter(adapter: TreeAdapter<TSource, T>): void {
    this.adapterRef.set(adapter);
    this.reapplyActiveFilter(adapter);
    this.bumpVersion();
  }

  public setConfig(config: TreeConfig<T>): void {
    const merged = {
      ...(DEFAULT_TREE_CONFIG as TreeConfig<T>),
      ...config,
      display: {
        ...(DEFAULT_TREE_CONFIG.display as TreeConfig<T>['display']),
        ...config.display,
      },
      virtualization: {
        ...(DEFAULT_TREE_CONFIG.virtualization as TreeConfig<T>['virtualization']),
        ...config.virtualization,
      },
      filtering: {
        ...(DEFAULT_TREE_CONFIG.filtering as TreeConfig<T>['filtering']),
        ...config.filtering,
      },
    };
    this.configRef.set(merged as TreeConfig<T>);
    this.engine.configure(merged as TreeConfig<T>);
    this.reapplyActiveFilter();
    this.bumpVersion();
  }

  public setFilter(filterQuery: TreeFilterInput): void {
    const adapter = this.adapterRef();
    if (!adapter) {
      return;
    }

    if (!this.engine.setFilter(filterQuery, adapter)) {
      return;
    }

    this.bumpVersion();
  }

  public clearFilter(): void {
    if (!this.engine.clearFilter()) {
      return;
    }

    this.bumpVersion();
  }

  public setSources(sources: TreeChildrenResult<TSource> | TSource[]): void {
    const adapter = this.adapterRef();
    if (!adapter) {
      return;
    }

    if (Array.isArray(sources)) {
      const graph = mapSourcesToNodeGraph(adapter, sources, null, 0);
      this.engine.init(graph.allNodes);
      this.reapplyActiveFilter(adapter);
      this.rootLoading.set(false);
      this.rootError.set(null);
      this.bumpVersion();
      return;
    }

    this.rootLoading.set(true);
    this.rootError.set(null);

    this.resolveChildrenResult(sources)
      .then((result) => {
        const graph = mapSourcesToNodeGraph(adapter, result.items, null, 0);
        this.engine.init(graph.allNodes);
        this.reapplyActiveFilter(adapter);
        this.rootLoading.set(false);
        this.bumpVersion();
      })
      .catch((error) => {
        const loadError: TreeLoadError = {
          scope: 'root',
          error,
          message: this.formatError(error),
        };
        this.rootLoading.set(false);
        this.rootError.set(loadError);
        this.lastError.set(loadError);
        this.configRef().onError?.(loadError);
        this.bumpVersion();
      });
  }

  public toggleExpand(row: TreeRowViewModel<T>): void {
    const adapter = this.adapterRef();
    if (!adapter) {
      return;
    }

    const node = this.engine.getNode(row.id);
    if (!node) {
      return;
    }

    this.engine.clearNodeError(row.id);

    const pagination = adapter.getPagination
      ? adapter.getPagination(node, node.data)
      : undefined;

    if (pagination?.enabled) {
      this.engine.setPagination(row.id, pagination);
    }

    const shouldLoad = this.engine.toggleExpand(
      row.id,
      typeof adapter.loadChildren === 'function',
    );
    this.reapplyActiveFilter(adapter);

    this.bumpVersion();

    if (!shouldLoad) {
      return;
    }

    if (pagination?.enabled) {
      const initialRequest: PageRequest = {
        pageIndex: 0,
        pageSize: pagination.pageSize,
      };

      this.engine.markPageInFlight(row.id, initialRequest.pageIndex);

      this.loadChildrenPage(row.id, adapter, initialRequest).catch(() => {
        this.engine.clearPageInFlight(row.id, initialRequest.pageIndex);
        this.bumpVersion();
      });
      return;
    }

    this.loadChildren(row.id, adapter).catch(() => {
      this.engine.clearLoading(row.id);
      this.bumpVersion();
    });
  }

  public ensureRangeLoaded(start: number, end: number): void {
    const adapter = this.adapterRef();
    if (!adapter) {
      return;
    }

    const rows = this.visibleRows();
    if (rows.length === 0 || start >= end) {
      return;
    }

    const clampedStart = Math.max(0, Math.min(start, rows.length - 1));
    const clampedEnd = Math.max(clampedStart + 1, Math.min(end, rows.length));

    const placeholderRanges = new Map<string, { start: number; end: number }>();

    for (const row of rows.slice(clampedStart, clampedEnd)) {
      if (!row.placeholder || !row.parentId || typeof row.placeholderIndex !== 'number') {
        continue;
      }

      const range = placeholderRanges.get(row.parentId);
      if (!range) {
        placeholderRanges.set(row.parentId, {
          start: row.placeholderIndex,
          end: row.placeholderIndex,
        });
        continue;
      }

      range.start = Math.min(range.start, row.placeholderIndex);
      range.end = Math.max(range.end, row.placeholderIndex);
    }

    let didSchedulePageLoad = false;

    for (const [parentId, range] of placeholderRanges) {
      const debug = this.engine.getPagedNodeDebugState(parentId);
      if (!debug) {
        continue;
      }

      const pages = this.engine.ensureRangeLoaded(parentId, range);
      for (const pageIndex of pages) {
        didSchedulePageLoad = true;
        const request: PageRequest = {
          pageIndex,
          pageSize: debug.pageSize,
        };

        this.loadChildrenPage(parentId, adapter, request).catch(() => {
          this.engine.clearPageInFlight(parentId, pageIndex);
          this.bumpVersion();
        });
      }
    }

    if (didSchedulePageLoad) {
      this.bumpVersion();
    }
  }

  public toggleSelect(row: TreeRowViewModel<T>): void {
    this.engine.selectToggle(row.id);
    this.bumpVersion();
  }

  public selectNone(): void {
    this.engine.selectNone();
    this.bumpVersion();
  }

  public selectRange(fromId: string, toId: string): void {
    this.engine.selectRange(fromId, toId);
    this.bumpVersion();
  }

  public selectBranch(nodeId: string): void {
    this.engine.selectBranch(nodeId);
    this.bumpVersion();
  }

  public getNode(id: string): TreeNode<T> | undefined {
    return this.engine.getNode(id);
  }

  public getPinnedRows(ids: string[]): TreeRowViewModel<T>[] {
    const adapter = this.adapterRef();
    if (!adapter) {
      return [];
    }

    return this.engine.getRowViewModelsById(
      adapter,
      this.configRef(),
      ids,
    );
  }

  public getPagedNodeDebugState(parentId: string) {
    this.stateVersion();
    return this.engine.getPagedNodeDebugState(parentId);
  }

  public expandToNode(nodeId: string): void {
    this.engine.expandPath(nodeId);
    this.bumpVersion();
  }

  private async loadChildren(
    parentId: string,
    adapter: TreeAdapter<TSource, T>,
  ): Promise<void> {
    const parent = this.engine.getNode(parentId);
    if (!parent || !adapter.loadChildren) {
      return;
    }

    const result = adapter.loadChildren(parent, undefined, parent.data);
    try {
      const resolved = await this.resolveChildrenResult(result);
      const graph = mapSourcesToNodeGraph(
        adapter,
        resolved.items,
        parentId,
        parent.level + 1,
      );

      this.engine.setChildrenLoaded(
        parentId,
        graph.directChildren,
        graph.allNodes,
      );
      this.engine.clearNodeError(parentId);
      this.reapplyActiveFilter(adapter);
      this.bumpVersion();
    } catch (error) {
      const loadError: TreeLoadError = {
        scope: 'children',
        nodeId: parentId,
        error,
        message: this.formatError(error),
      };
      this.engine.setNodeError(parentId, error);
      this.engine.clearLoading(parentId);
      this.lastError.set(loadError);
      this.configRef().onError?.(loadError);
      this.bumpVersion();
    }
  }

  private async loadChildrenPage(
    parentId: string,
    adapter: TreeAdapter<TSource, T>,
    request: PageRequest,
  ): Promise<void> {
    const parent = this.engine.getNode(parentId);
    if (!parent || !adapter.loadChildren) {
      return;
    }

    this.engine.clearPageError(parentId, request.pageIndex);

    const adapterRequest = this.toAdapterPageRequest(parentId, request);
    const result = adapter.loadChildren(parent, adapterRequest, parent.data);

    try {
      const resolved = await this.resolveChildrenResult(result);
      const totalCount = this.resolveTotalCount(
        parentId,
        request,
        resolved.totalCount,
        resolved.items.length,
      );

      const graph = mapSourcesToNodeGraph(
        adapter,
        resolved.items,
        parentId,
        parent.level + 1,
      );

      this.engine.applyPagedChildren(
        parentId,
        request,
        graph.directChildren,
        totalCount,
        graph.allNodes,
      );
      this.engine.clearNodeError(parentId);
      this.reapplyActiveFilter(adapter);
      this.bumpVersion();
    } catch (error) {
      const loadError: TreeLoadError = {
        scope: 'children',
        nodeId: parentId,
        pageIndex: request.pageIndex,
        error,
        message: this.formatError(error),
      };

      this.engine.setPageError(parentId, request.pageIndex, error);
      this.lastError.set(loadError);
      this.configRef().onError?.(loadError);
      this.bumpVersion();
    }
  }

  private resolveTotalCount(
    parentId: string,
    request: PageRequest,
    totalCount: number | undefined,
    itemsCount: number,
  ): number {
    if (typeof totalCount === 'number' && Number.isFinite(totalCount)) {
      return totalCount;
    }

    const debug = this.engine.getPagedNodeDebugState(parentId);
    if (debug && typeof debug.totalCount === 'number') {
      return debug.totalCount;
    }

    return request.pageIndex * request.pageSize + itemsCount;
  }

  private toAdapterPageRequest(parentId: string, request: PageRequest): PageRequest {
    const pagination = this.engine.getPagedNodeDebugState(parentId);
    if (!pagination || pagination.pageIndexing !== 'one-based') {
      return request;
    }

    return {
      ...request,
      pageIndex: request.pageIndex + 1,
    };
  }

  private async resolveChildrenResult(
    result: unknown,
  ): Promise<ResolvedLoadChildrenResult<TSource>> {
    const resolvedValue = await this.resolveUnknownResult(result);
    return this.normalizeLoadResult(resolvedValue);
  }

  private async resolveUnknownResult(result: unknown): Promise<unknown> {
    if (isObservable(result)) {
      return firstValueFrom(result);
    }

    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return result;
    }

    return result;
  }

  private normalizeLoadResult(value: unknown): ResolvedLoadChildrenResult<TSource> {
    if (Array.isArray(value)) {
      return { items: value };
    }

    if (this.isPageResult(value)) {
      return {
        items: value.items,
        totalCount: value.totalCount,
      };
    }

    return { items: [] };
  }

  private isPageResult(value: unknown): value is { items: TSource[]; totalCount: number } {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const maybe = value as { items?: unknown; totalCount?: unknown };
    return Array.isArray(maybe.items) && typeof maybe.totalCount === 'number';
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }

  private bumpVersion(): void {
    this.stateVersion.update((value) => value + 1);
  }

  private reapplyActiveFilter(adapter?: TreeAdapter<TSource, T>): void {
    const activeAdapter = adapter ?? this.adapterRef();
    if (!activeAdapter) {
      return;
    }

    this.engine.reapplyFilter(activeAdapter);
  }
}
