import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, isObservable } from 'rxjs';
import {
  DEFAULT_TREE_CONFIG,
  TreeAdapter,
  TreeChildrenResult,
  TreeConfig,
  TreeEngine,
  TreeLoadError,
  TreeNode,
  TreeRowViewModel,
  mapSourcesToNodes,
} from '@tree-core';
import { TREE_CONFIG } from '../tokens/tree.configs';

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
    return this.engine.getVisibleRows(adapter, this.configRef());
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
      };
      this.configRef.set(merged as TreeConfig<T>);
      this.engine.configure(merged as TreeConfig<T>);
    }
  }

  public setAdapter(adapter: TreeAdapter<TSource, T>): void {
    this.adapterRef.set(adapter);
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
    };
    this.configRef.set(merged as TreeConfig<T>);
    this.engine.configure(merged as TreeConfig<T>);
    this.bumpVersion();
  }

  public setSources(sources: TreeChildrenResult<TSource> | TSource[]): void {
    const adapter = this.adapterRef();
    if (!adapter) {
      return;
    }

    if (Array.isArray(sources)) {
      const nodes = mapSourcesToNodes(adapter, sources, null, 0);
      this.engine.init(nodes);
      this.rootLoading.set(false);
      this.rootError.set(null);
      this.bumpVersion();
      return;
    }

    this.rootLoading.set(true);
    this.rootError.set(null);

    this.resolveChildrenResult(sources)
      .then((result) => {
        const nodes = mapSourcesToNodes(adapter, result, null, 0);
        this.engine.init(nodes);
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

    this.engine.clearNodeError(row.id);
    const shouldLoad = this.engine.toggleExpand(
      row.id,
      typeof adapter.loadChildren === 'function',
    );

    this.bumpVersion();

    if (shouldLoad) {
      this.loadChildren(row.id, adapter).catch(() => {
        this.engine.clearLoading(row.id);
        this.bumpVersion();
      });
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
      const sources = await this.resolveChildrenResult(result);
      const children = mapSourcesToNodes(
        adapter,
        sources,
        parentId,
        parent.level + 1,
      );

      this.engine.setChildrenLoaded(parentId, children);
      this.engine.clearNodeError(parentId);
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

  private async resolveChildrenResult(result: unknown): Promise<TSource[]> {
    if (Array.isArray(result)) {
      return result;
    }

    if (isObservable(result)) {
      return firstValueFrom(result);
    }

    return (result as TSource[]) ?? [];
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
}
