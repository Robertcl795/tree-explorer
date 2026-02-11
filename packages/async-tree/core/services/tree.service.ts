import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, isObservable } from 'rxjs';

import {
  DEFAULT_TREE_CONFIG,
  PageRequest,
  TREE_CONFIG,
  TreeAdapter,
  TreeChildrenResult,
  TreeConfig,
  TreeEngine,
  TreeFilterInput,
  TreeLoadError,
  TreeNode,
  TreePageHint,
  TreePagedNodeDebugState,
  TreePinnedConfig,
  TreePinnedEntry,
  TreePinnedStore,
  TreePinnedStoreResult,
  TreeResolvePathResult,
  TreeRowViewModel,
  mapSourcesToNodeGraph,
} from '../../core';
import { TreePinnedItemView } from '../types';

interface ResolvedLoadChildrenResult<TSource> {
  items: TSource[];
  totalCount?: number;
}

export interface ResolvedPinnedConfig<T> {
  enabled: boolean;
  label: string;
  ids: string[];
  entries: TreePinnedEntry[];
  store?: TreePinnedStore<T>;
  maxItems?: number;
  dndEnabled: boolean;
  expandable: boolean;
  canPin?: TreePinnedConfig<T>['canPin'];
  canUnpin?: TreePinnedConfig<T>['canUnpin'];
  resolvePinnedLabel?: TreePinnedConfig<T>['resolvePinnedLabel'];
  resolvePinnedIcon?: TreePinnedConfig<T>['resolvePinnedIcon'];
  onNavigate?: TreePinnedConfig<T>['onNavigate'];
}

export interface TreeNavigationResult {
  nodeId: string;
  success: boolean;
  reason?:
    | 'not-found'
    | 'path-unavailable'
    | 'path-resolution-failed'
    | 'load-failed';
  error?: unknown;
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
  private readonly pinnedEntriesState = signal<TreePinnedEntry[]>([]);
  private readonly pinnedLoadingState = signal(false);
  private readonly pinnedErrorState = signal<TreeLoadError | null>(null);
  private pinnedLoadVersion = 0;

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

  public readonly rootLoadingState = computed(() => this.rootLoading());

  public readonly rootLoadError = computed(() => this.rootError());

  public readonly loadError = computed(() => this.lastError());

  public readonly pinnedEntries = computed(() => this.pinnedEntriesState());

  public readonly pinnedLoading = computed(() => this.pinnedLoadingState());

  public readonly pinnedError = computed(() => this.pinnedErrorState());

  public readonly pinnedConfig = computed(() =>
    this.resolvePinnedConfig(this.configRef().pinned),
  );

  public readonly pinnedItems = computed((): TreePinnedItemView<T>[] => {
    this.stateVersion();
    const adapter = this.adapterRef();
    if (!adapter) {
      return [];
    }

    const config = this.configRef();
    const pinnedConfig = this.resolvePinnedConfig(config.pinned);
    if (!pinnedConfig.enabled) {
      return [];
    }

    const entries = this.sortedPinnedEntries();
    if (entries.length === 0) {
      return [];
    }

    const rowsById = new Map(
      this.engine
        .getRowViewModelsById(
          adapter,
          config,
          entries.map((entry) => entry.nodeId),
        )
        .map((row) => [row.id, row]),
    );

    return entries.map((entry) => {
      const row = rowsById.get(entry.nodeId) ?? null;
      const node = this.engine.getNode(entry.nodeId) ?? null;
      const resolvedLabel = pinnedConfig.resolvePinnedLabel
        ? pinnedConfig.resolvePinnedLabel(entry, { entry, node: node ?? undefined, row: row ?? undefined })
        : undefined;
      const resolvedIcon = pinnedConfig.resolvePinnedIcon
        ? pinnedConfig.resolvePinnedIcon(entry, { entry, node: node ?? undefined, row: row ?? undefined })
        : undefined;

      return {
        entry,
        node,
        row,
        label: resolvedLabel ?? entry.label ?? row?.label ?? node?.id ?? entry.nodeId,
        icon: resolvedIcon ?? entry.icon ?? row?.icon ?? null,
        missing: !node,
      };
    });
  });

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
      this.syncPinnedState(this.resolvePinnedConfig((merged as TreeConfig<T>).pinned));
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
    this.syncPinnedState(this.resolvePinnedConfig((merged as TreeConfig<T>).pinned));
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
      if (
        typeof pagination.initialTotalCount === 'number' &&
        Number.isFinite(pagination.initialTotalCount) &&
        pagination.initialTotalCount >= 0
      ) {
        this.engine.primePagedPlaceholders(row.id, pagination.initialTotalCount);
        this.bumpVersion();
      }

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
    const adapter = this.adapterRef();
    if (adapter) {
      this.engine.selectRange(fromId, toId, adapter, this.configRef());
    } else {
      this.engine.selectRange(fromId, toId);
    }
    this.bumpVersion();
  }

  public selectBranch(nodeId: string): void {
    this.engine.selectBranch(nodeId);
    this.bumpVersion();
  }

  public getNode(id: string): TreeNode<T> | undefined {
    return this.engine.getNode(id);
  }

  public isNodePinned(nodeId: string): boolean {
    return this.pinnedEntriesState().some((entry) => entry.nodeId === nodeId);
  }

  public async pinNode(nodeId: string): Promise<boolean> {
    const node = this.engine.getNode(nodeId);
    if (!node || this.isNodePinned(nodeId)) {
      return false;
    }

    const pinnedConfig = this.resolvePinnedConfig(this.configRef().pinned);
    if (!pinnedConfig.enabled) {
      return false;
    }

    if (
      pinnedConfig.canPin &&
      !pinnedConfig.canPin({
        node,
        pinnedEntries: this.sortedPinnedEntries(),
      })
    ) {
      return false;
    }

    const entries = this.sortedPinnedEntries();
    if (
      typeof pinnedConfig.maxItems === 'number' &&
      pinnedConfig.maxItems > 0 &&
      entries.length >= pinnedConfig.maxItems
    ) {
      return false;
    }

    const optimisticEntry: TreePinnedEntry = {
      entryId: `local:${node.id}:${Date.now()}`,
      nodeId: node.id,
      label: undefined,
      icon: undefined,
      order: entries.length,
    };

    this.pinnedEntriesState.set(this.normalizePinnedEntries([...entries, optimisticEntry]));
    this.bumpVersion();

    if (!pinnedConfig.store?.addPinned) {
      return true;
    }

    try {
      const persisted = await this.resolvePinnedStoreResult(pinnedConfig.store.addPinned(node));
      const normalizedPersisted = this.normalizePinnedEntry(persisted, optimisticEntry.order);
      const nextEntries = this.sortedPinnedEntries().map((entry) =>
        entry.entryId === optimisticEntry.entryId ? normalizedPersisted : entry,
      );
      this.pinnedEntriesState.set(this.normalizePinnedEntries(nextEntries));
      this.bumpVersion();
      return true;
    } catch (error) {
      this.pinnedEntriesState.set(
        this.sortedPinnedEntries().filter((entry) => entry.entryId !== optimisticEntry.entryId),
      );
      this.pinnedErrorState.set({
        scope: 'root',
        error,
        message: this.formatError(error),
      });
      this.bumpVersion();
      return false;
    }
  }

  public async unpinEntry(entryId: string): Promise<boolean> {
    const entries = this.sortedPinnedEntries();
    const target = entries.find((entry) => entry.entryId === entryId);
    if (!target) {
      return false;
    }

    const pinnedConfig = this.resolvePinnedConfig(this.configRef().pinned);
    const node = this.engine.getNode(target.nodeId);
    if (
      pinnedConfig.canUnpin &&
      !pinnedConfig.canUnpin({
        entry: target,
        node,
        pinnedEntries: entries,
      })
    ) {
      return false;
    }

    const withoutTarget = entries.filter((entry) => entry.entryId !== entryId);
    this.pinnedEntriesState.set(this.normalizePinnedEntries(withoutTarget));
    this.bumpVersion();

    if (!pinnedConfig.store?.removePinned) {
      return true;
    }

    try {
      await this.resolvePinnedStoreResult(pinnedConfig.store.removePinned(target, node));
      return true;
    } catch (error) {
      this.pinnedEntriesState.set(this.normalizePinnedEntries(entries));
      this.pinnedErrorState.set({
        scope: 'root',
        error,
        message: this.formatError(error),
      });
      this.bumpVersion();
      return false;
    }
  }

  public async reorderPinned(previousIndex: number, currentIndex: number): Promise<boolean> {
    const previousEntries = this.sortedPinnedEntries();
    const entries = [...previousEntries];
    if (
      previousIndex < 0 ||
      currentIndex < 0 ||
      previousIndex >= entries.length ||
      currentIndex >= entries.length ||
      previousIndex === currentIndex
    ) {
      return false;
    }

    const [moved] = entries.splice(previousIndex, 1);
    if (!moved) {
      return false;
    }
    entries.splice(currentIndex, 0, moved);
    const reordered = entries.map((entry, index) => ({
      ...entry,
      order: index,
    }));
    const pinnedConfig = this.resolvePinnedConfig(this.configRef().pinned);

    this.pinnedEntriesState.set(this.normalizePinnedEntries(reordered));
    this.bumpVersion();

    if (!pinnedConfig.store?.reorderPinned) {
      return true;
    }

    try {
      await this.resolvePinnedStoreResult(
        pinnedConfig.store.reorderPinned(this.normalizePinnedEntries(reordered)),
      );
      return true;
    } catch (error) {
      this.pinnedEntriesState.set(this.normalizePinnedEntries(previousEntries));
      this.pinnedErrorState.set({
        scope: 'root',
        error,
        message: this.formatError(error),
      });
      this.bumpVersion();
      return false;
    }
  }

  public getPagedNodeDebugState(
    parentId: string,
  ): TreePagedNodeDebugState | undefined {
    this.stateVersion();
    return this.engine.getPagedNodeDebugState(parentId);
  }

  public async navigateToNode(nodeId: string): Promise<TreeNavigationResult> {
    const existingNode = this.engine.getNode(nodeId);
    if (existingNode) {
      this.engine.expandPath(nodeId);
      this.bumpVersion();
      return {
        nodeId,
        success: true,
      };
    }

    const adapter = this.adapterRef();
    if (!adapter?.resolvePathToNode) {
      return this.reportNavigationFailure(
        nodeId,
        'path-unavailable',
        new Error('Adapter does not provide resolvePathToNode'),
      );
    }

    let resolvedPath: TreeResolvePathResult | null = null;
    try {
      const rawResult = await this.resolveUnknownResult(
        adapter.resolvePathToNode(nodeId),
      );
      resolvedPath = this.normalizeResolvedPath(rawResult, nodeId);
    } catch (error) {
      return this.reportNavigationFailure(nodeId, 'path-resolution-failed', error);
    }

    if (!resolvedPath || resolvedPath.steps.length === 0) {
      return this.reportNavigationFailure(
        nodeId,
        'not-found',
        new Error(`Navigation path not found for node ${nodeId}`),
      );
    }

    for (let index = 1; index < resolvedPath.steps.length; index += 1) {
      const step = resolvedPath.steps[index];
      const parentStep = resolvedPath.steps[index - 1];
      const parentId = step?.parentId ?? parentStep?.nodeId ?? null;
      const childId = step?.nodeId ?? null;

      if (!parentId || !childId) {
        continue;
      }

      const parentNode = this.engine.getNode(parentId);
      if (!parentNode) {
        return this.reportNavigationFailure(
          nodeId,
          'not-found',
          new Error(`Parent node ${parentId} is not loaded`),
        );
      }

      const pagination = adapter.getPagination
        ? adapter.getPagination(parentNode, parentNode.data)
        : undefined;
      if (pagination?.enabled) {
        this.engine.setPagination(parentId, pagination);
      }

      if (!this.engine.expandedIds.has(parentId)) {
        this.engine.toggleExpand(parentId, typeof adapter.loadChildren === 'function');
        this.reapplyActiveFilter(adapter);
        this.bumpVersion();
      }

      if (this.engine.getNode(childId)) {
        continue;
      }

      if (!adapter.loadChildren) {
        return this.reportNavigationFailure(
          nodeId,
          'path-unavailable',
          new Error(`Adapter cannot load children for ${parentId}`),
        );
      }

      try {
        if (pagination?.enabled) {
          const request = this.resolveNavigationPageRequest(
            pagination,
            step.pageHint,
          );
          this.engine.markPageInFlight(parentId, request.pageIndex);
          await this.loadChildrenPage(parentId, adapter, request);
        } else {
          await this.loadChildren(parentId, adapter);
        }
      } catch (error) {
        return this.reportNavigationFailure(nodeId, 'load-failed', error);
      }

      if (!this.engine.getNode(childId)) {
        return this.reportNavigationFailure(
          nodeId,
          'not-found',
          new Error(`Node ${childId} not found after loading ${parentId}`),
        );
      }
    }

    if (!this.engine.getNode(nodeId)) {
      return this.reportNavigationFailure(
        nodeId,
        'not-found',
        new Error(`Node ${nodeId} could not be reached`),
      );
    }

    this.engine.expandPath(nodeId);
    this.bumpVersion();

    return {
      nodeId,
      success: true,
    };
  }

  public expandToNode(nodeId: string): boolean {
    if (!this.engine.getNode(nodeId)) {
      return false;
    }
    this.engine.expandPath(nodeId);
    this.bumpVersion();
    return true;
  }

  public selectOne(nodeId: string): void {
    this.engine.selectOne(nodeId);
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
      throw error;
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

      const shouldDisablePaging =
        request.pageIndex === 0 && totalCount <= resolved.items.length;

      if (shouldDisablePaging) {
        this.engine.setChildrenLoaded(
          parentId,
          graph.directChildren,
          graph.allNodes,
        );
      } else {
        this.engine.applyPagedChildren(
          parentId,
          request,
          graph.directChildren,
          totalCount,
          graph.allNodes,
        );
      }
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
      throw error;
    }
  }

  private resolveTotalCount(
    parentId: string,
    request: PageRequest,
    totalCount: number | undefined,
    itemsCount: number,
  ): number {
    const debug = this.engine.getPagedNodeDebugState(parentId);
    if (typeof totalCount === 'number' && Number.isFinite(totalCount)) {
      if (debug && typeof debug.totalCount === 'number') {
        return Math.max(debug.totalCount, totalCount);
      }
      return totalCount;
    }

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

  private resolvePinnedConfig(config: TreePinnedConfig<T> | undefined): ResolvedPinnedConfig<T> {
    const resolvedEntries = this.normalizePinnedEntries(config?.entries ?? []);
    const resolvedIds = (config?.ids ?? [])
      .map((id) => `${id}`.trim())
      .filter((id) => id.length > 0);
    const inferredEnabled = resolvedEntries.length > 0 || resolvedIds.length > 0;

    return {
      enabled: config?.enabled ?? inferredEnabled,
      label: config?.label?.trim() || 'Pinned',
      ids: resolvedIds,
      entries: resolvedEntries,
      store: config?.store,
      maxItems: config?.maxItems,
      dndEnabled: config?.dnd?.enabled === true,
      expandable: config?.expandable === true,
      canPin: config?.canPin,
      canUnpin: config?.canUnpin,
      resolvePinnedLabel: config?.resolvePinnedLabel,
      resolvePinnedIcon: config?.resolvePinnedIcon,
      onNavigate: config?.onNavigate,
    };
  }

  private syncPinnedState(config: ResolvedPinnedConfig<T>): void {
    if (!config.enabled) {
      this.pinnedEntriesState.set([]);
      this.pinnedLoadingState.set(false);
      this.pinnedErrorState.set(null);
      this.pinnedLoadVersion += 1;
      return;
    }

    this.pinnedErrorState.set(null);
    const staticEntries = this.pinnedEntriesFromConfig(config);
    if (!config.store?.loadPinned) {
      this.pinnedEntriesState.set(staticEntries);
      return;
    }

    const loadVersion = ++this.pinnedLoadVersion;
    this.pinnedLoadingState.set(true);
    this.pinnedEntriesState.set(staticEntries);

    this.resolvePinnedStoreResult(config.store.loadPinned())
      .then((loadedEntries) => {
        if (this.pinnedLoadVersion !== loadVersion) {
          return;
        }

        const normalized = this.normalizePinnedEntries(loadedEntries);
        this.pinnedEntriesState.set(
          normalized.length > 0 ? normalized : staticEntries,
        );
        this.pinnedLoadingState.set(false);
        this.bumpVersion();
      })
      .catch((error) => {
        if (this.pinnedLoadVersion !== loadVersion) {
          return;
        }

        this.pinnedLoadingState.set(false);
        this.pinnedErrorState.set({
          scope: 'root',
          error,
          message: this.formatError(error),
        });
        this.pinnedEntriesState.set(staticEntries);
        this.bumpVersion();
      });
  }

  private pinnedEntriesFromConfig(config: ResolvedPinnedConfig<T>): TreePinnedEntry[] {
    if (config.entries.length > 0) {
      return config.entries;
    }

    return this.normalizePinnedEntries(
      config.ids.map((nodeId, index) => ({
        entryId: `static:${nodeId}`,
        nodeId,
        order: index,
      })),
    );
  }

  private normalizePinnedEntries(entries: readonly TreePinnedEntry[]): TreePinnedEntry[] {
    const byNode = new Map<string, TreePinnedEntry>();

    entries.forEach((entry, index) => {
      const normalized = this.normalizePinnedEntry(entry, index);
      if (!normalized.nodeId) {
        return;
      }
      byNode.set(normalized.nodeId, normalized);
    });

    return Array.from(byNode.values())
      .sort((left, right) => left.order - right.order)
      .map((entry, index) => ({ ...entry, order: index }));
  }

  private normalizePinnedEntry(entry: TreePinnedEntry, fallbackOrder: number): TreePinnedEntry {
    return {
      entryId: `${entry.entryId || `entry:${entry.nodeId}:${fallbackOrder}`}`,
      nodeId: `${entry.nodeId}`.trim(),
      label: entry.label,
      icon: entry.icon,
      order:
        typeof entry.order === 'number' && Number.isFinite(entry.order)
          ? entry.order
          : fallbackOrder,
      meta: entry.meta,
    };
  }

  private sortedPinnedEntries(): TreePinnedEntry[] {
    return this.normalizePinnedEntries(this.pinnedEntriesState());
  }

  private async resolvePinnedStoreResult<TResult>(
    result: TreePinnedStoreResult<TResult>,
  ): Promise<TResult> {
    return this.resolveUnknownResult(result) as Promise<TResult>;
  }

  private resolveNavigationPageRequest(
    pagination: { pageSize: number; pageIndexing?: 'zero-based' | 'one-based' },
    hint?: TreePageHint,
  ): PageRequest {
    const pageSize = hint?.pageSize ?? pagination.pageSize;
    const indexing = hint?.pageIndexing ?? pagination.pageIndexing ?? 'zero-based';
    const rawPageIndex = Math.max(0, Math.floor(hint?.pageIndex ?? 0));
    const pageIndex = indexing === 'one-based'
      ? Math.max(0, rawPageIndex - 1)
      : rawPageIndex;

    return {
      pageIndex,
      pageSize,
    };
  }

  private normalizeResolvedPath(
    value: unknown,
    targetId: string,
  ): TreeResolvePathResult | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const maybe = value as TreeResolvePathResult;
    if (!Array.isArray(maybe.steps)) {
      return null;
    }

    const steps = maybe.steps
      .map((step) => ({
        nodeId: `${step?.nodeId ?? ''}`.trim(),
        parentId: step?.parentId == null ? null : `${step.parentId}`.trim(),
        pageHint: step?.pageHint,
      }))
      .filter((step) => step.nodeId.length > 0);

    if (steps.length === 0) {
      return null;
    }

    if (steps[0]?.parentId !== null) {
      steps[0] = {
        ...steps[0]!,
        parentId: null,
      };
    }

    return {
      targetId: `${maybe.targetId || targetId}`,
      steps,
    };
  }

  private reportNavigationFailure(
    nodeId: string,
    reason: NonNullable<TreeLoadError['reason']>,
    error: unknown,
  ): TreeNavigationResult {
    const loadError: TreeLoadError = {
      scope: 'navigation',
      nodeId,
      reason,
      error,
      message: this.formatError(error),
    };

    this.lastError.set(loadError);
    this.configRef().onError?.(loadError);
    this.bumpVersion();

    return {
      nodeId,
      success: false,
      reason,
      error,
    };
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
