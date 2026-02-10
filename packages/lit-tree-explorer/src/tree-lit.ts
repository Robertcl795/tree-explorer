import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import '@lit-labs/virtualizer';
import { flow } from '@lit-labs/virtualizer/layouts/flow.js';
import {
  DEFAULT_TREE_CONFIG,
  SELECTION_MODES,
  TreeAdapter,
  TreeChildrenResult,
  TreeConfig,
  TreeEngine,
  TreeFilterInput,
  TreeLoadError,
  TreeNode,
  TreeRowViewModel,
} from '@tree-core';

@customElement('td-tree-lit')
export class TreeLit<TSource, T = TSource> extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      width: 100%;
      font-family: var(--tree-font-family, system-ui, sans-serif);
      font-size: var(--tree-font-size, 13px);
      font-weight: var(--tree-font-weight, 400);
      line-height: var(--tree-line-height, 1.35);
      color: var(--tree-fg, rgba(0, 0, 0, 0.87));
      background: var(--tree-bg, #ffffff);
    }

    .container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--tree-bg, #ffffff);
    }

    .pinned {
      border-bottom: 1px solid var(--tree-pinned-border, var(--tree-border, #e0e0e0));
      padding: 8px 0;
      background: var(--tree-pinned-bg, #fafafa);
    }

    .pinned-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 0 16px 4px 16px;
      color: var(--tree-muted-fg, rgba(0, 0, 0, 0.6));
    }

    .row {
      display: flex;
      align-items: center;
      height: var(--tree-row-height, 36px);
      padding: 0 var(--tree-row-padding-x, 8px);
      gap: var(--tree-row-gap, 8px);
      border-bottom: 1px solid var(--tree-divider, #f0f0f0);
      cursor: pointer;
      color: var(--tree-fg, rgba(0, 0, 0, 0.87));
    }

    .row.disabled {
      opacity: var(--tree-disabled-opacity, 0.6);
      cursor: not-allowed;
    }

    .row.error {
      border-left: 2px solid var(--tree-error-border, #b00020);
    }

    .row:hover {
      background: var(--tree-hover-bg, #f5f5f5);
    }

    .pinned .row {
      color: var(--tree-pinned-link-fg, #0b63ce);
      text-decoration: underline;
      text-decoration-color: var(--tree-pinned-link-decoration, rgba(11, 99, 206, 0.35));
      text-underline-offset: 2px;
    }

    .pinned .row:hover {
      color: var(--tree-pinned-link-hover-fg, #064ea3);
    }

    .context-menu {
      position: fixed;
      background: var(--tree-bg, #ffffff);
      border: 1px solid var(--tree-border, #e0e0e0);
      border-radius: var(--tree-radius, 4px);
      box-shadow: var(--tree-shadow, 0 2px 8px rgba(0, 0, 0, 0.15));
      min-width: 160px;
      z-index: 1000;
    }

    .context-menu button {
      width: 100%;
      padding: 8px 12px;
      background: none;
      border: none;
      text-align: left;
      cursor: pointer;
      color: var(--tree-fg, rgba(0, 0, 0, 0.87));
    }

    .context-menu button[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .empty-state {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--tree-muted-fg, rgba(0, 0, 0, 0.6));
    }

    .error-state {
      color: var(--tree-error-fg, #b00020);
    }
  `;

  @property({ attribute: false })
  adapter?: TreeAdapter<TSource, T>;

  @property({ attribute: false })
  config: Partial<TreeConfig<T>> = {};

  @property({ attribute: false })
  data: TreeChildrenResult<TSource> | TSource[] = [];

  @property({ attribute: false })
  filterQuery: TreeFilterInput = null;

  @state()
  private _rootError: TreeLoadError | null = null;

  @state()
  private _loading = false;

  @state()
  private _contextRow: TreeRowViewModel<T> | null = null;

  @state()
  private _contextPosition = { x: 0, y: 0 };

  private readonly engine = new TreeEngine<T>();

  private get mergedConfig(): TreeConfig<T> {
    const defaults = DEFAULT_TREE_CONFIG as TreeConfig<T>;
    return {
      ...defaults,
      ...this.config,
      display: { ...defaults.display, ...this.config.display },
      selection: this.config.selection ?? defaults.selection,
      virtualization: { ...defaults.virtualization, ...this.config.virtualization },
      filtering: { ...defaults.filtering, ...this.config.filtering },
      actions: this.config.actions ?? defaults.actions,
      dragDrop: this.config.dragDrop ?? defaults.dragDrop,
      pinned: this.config.pinned ?? defaults.pinned,
      onError: this.config.onError ?? defaults.onError,
    };
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config')) {
      this.engine.configure(this.mergedConfig);
      this.syncFilter();
    }
    if (changed.has('filterQuery')) {
      this.syncFilter();
    }
    if (changed.has('adapter') || changed.has('data')) {
      this.loadRoots();
    }
  }

  private async loadRoots(): Promise<void> {
    if (!this.adapter) {
      return;
    }

    this._loading = true;
    this._rootError = null;

    try {
      const sources = await this.resolveSources(this.data);
      const nodes = sources.map((source) =>
        (this.adapter as TreeAdapter<TSource, T>).transform
          ? (this.adapter as TreeAdapter<TSource, T>).transform!(
              source,
              { parentId: null, level: 0 },
              (this.adapter as TreeAdapter<TSource, T>).toData
                ? (this.adapter as TreeAdapter<TSource, T>).toData!(source)
                : (source as unknown as T),
            )
          : {
              id: this.adapter!.getId(source),
              parentId: null,
              level: 0,
              data: this.adapter!.toData
                ? this.adapter!.toData(source)
                : (source as unknown as T),
              isLeaf: this.adapter!.isLeaf
                ? this.adapter!.isLeaf(
                    this.adapter!.toData
                      ? this.adapter!.toData(source)
                      : (source as unknown as T),
                  )
                : undefined,
            },
      );
      this.engine.init(nodes as TreeNode<T>[]);
      this.syncFilter();
    } catch (error) {
      const loadError: TreeLoadError = {
        scope: 'root',
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      this._rootError = loadError;
      this.mergedConfig.onError?.(loadError);
    } finally {
      this._loading = false;
      this.requestUpdate();
    }
  }

  private async resolveSources(
    value: TreeChildrenResult<TSource> | TSource[],
  ): Promise<TSource[]> {
    if (Array.isArray(value)) {
      return value;
    }

    if ((value as Promise<TSource[]>).then) {
      return value as Promise<TSource[]>;
    }

    if ((value as { subscribe: Function }).subscribe) {
      return new Promise((resolve, reject) => {
        (value as { subscribe: Function }).subscribe({
          next: (items: TSource[]) => resolve(items),
          error: (err: unknown) => reject(err),
        });
      });
    }

    return [];
  }

  private get visibleRows(): TreeRowViewModel<T>[] {
    if (!this.adapter) {
      return [];
    }
    return this.engine.getFilteredFlatList(this.adapter, this.mergedConfig);
  }

  private get pinnedRows(): TreeRowViewModel<T>[] {
    if (!this.adapter) {
      return [];
    }
    const ids = this.mergedConfig.pinned?.ids ?? [];
    return this.engine.getRowViewModelsById(this.adapter, this.mergedConfig, ids);
  }

  private onToggleExpand(row: TreeRowViewModel<T>): void {
    if (!this.adapter || row.disabled || row.isLeaf) {
      return;
    }
    const shouldLoad = this.engine.toggleExpand(
      row.id,
      typeof this.adapter.loadChildren === 'function',
    );
    this.engine.reapplyFilter(this.adapter);
    if (shouldLoad) {
      this.loadChildren(row);
    }
    this.dispatchEvent(new CustomEvent('item-toggle-expand', { detail: { row } }));
  }

  private async loadChildren(row: TreeRowViewModel<T>): Promise<void> {
    if (!this.adapter?.loadChildren) {
      return;
    }
    try {
      const result = await this.resolveSources(
        this.adapter.loadChildren(row as any, undefined, row.data),
      );
      const children = result.map((source) => ({
        id: this.adapter!.getId(source),
        parentId: row.id,
        level: row.level + 1,
        data: this.adapter!.toData
          ? this.adapter!.toData(source)
          : (source as unknown as T),
      }));
      this.engine.setChildrenLoaded(row.id, children as TreeNode<T>[]);
      this.engine.reapplyFilter(this.adapter);
      this.requestUpdate();
    } catch (error) {
      const loadError: TreeLoadError = {
        scope: 'children',
        nodeId: row.id,
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      this.engine.setNodeError(row.id, error);
      this.engine.clearLoading(row.id);
      this.mergedConfig.onError?.(loadError);
      this.dispatchEvent(new CustomEvent('load-error', { detail: loadError }));
      this.requestUpdate();
    }
  }

  private syncFilter(): void {
    if (!this.adapter) {
      return;
    }

    const query = this.filterQuery;
    const shouldClear =
      query === null ||
      query === undefined ||
      (typeof query === 'string' && query.trim().length === 0);

    if (shouldClear) {
      const changed = this.engine.clearFilter();
      if (changed) {
        this.requestUpdate();
      }
      return;
    }

    const changed = this.engine.setFilter(query, this.adapter);
    if (changed) {
      this.requestUpdate();
    }
  }

  private onRowClick(row: TreeRowViewModel<T>): void {
    this.dispatchEvent(new CustomEvent('item-click', { detail: { row } }));
    if (this.mergedConfig.selection?.mode === SELECTION_MODES.NONE) {
      return;
    }
    this.engine.selectToggle(row.id);
    this.dispatchEvent(new CustomEvent('item-toggle-select', { detail: { row } }));
    this.requestUpdate();
  }

  private onPinnedClick(row: TreeRowViewModel<T>): void {
    this.engine.expandPath(row.id);
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('pinned-click', { detail: { row } }));
  }

  private onContextMenu(event: MouseEvent, row: TreeRowViewModel<T>): void {
    event.preventDefault();
    if (!this.mergedConfig.actions?.length) {
      return;
    }
    this._contextRow = row;
    this._contextPosition = { x: event.clientX, y: event.clientY };
  }

  private closeContextMenu(): void {
    this._contextRow = null;
  }

  private onDragStart(event: DragEvent, row: TreeRowViewModel<T>): void {
    if (!this.mergedConfig.dragDrop || row.disabled) {
      return;
    }
    const node = this.engine.getNode(row.id);
    if (!node || !event.dataTransfer) {
      return;
    }
    const payload = this.adapter?.getDragData
      ? this.adapter.getDragData(row.data, node)
      : row.data;
    event.dataTransfer.effectAllowed = 'copyMove';
    if (typeof payload === 'string') {
      event.dataTransfer.setData('text/plain', payload);
    } else {
      event.dataTransfer.setData('application/json', JSON.stringify(payload));
    }
    this.dispatchEvent(new CustomEvent('drag-start', { detail: { row, event } }));
  }

  private renderRow(row: TreeRowViewModel<T>, pinned = false) {
    const indent = this.mergedConfig.display?.indentPx ?? 24;
    const dragEnabled = this.mergedConfig.dragDrop === true;

    return html`
      <div
        class="row ${row.disabled ? 'disabled' : ''} ${row.error ? 'error' : ''}"
        style="padding-left: ${row.level * indent}px"
        ?draggable=${dragEnabled && !row.disabled}
        @click=${() => (pinned ? this.onPinnedClick(row) : this.onRowClick(row))}
        @contextmenu=${(event: MouseEvent) => this.onContextMenu(event, row)}
        @dragstart=${(event: DragEvent) => this.onDragStart(event, row)}>
        <span>${row.label}</span>
      </div>
    `;
  }

  render() {
    const rows = this.visibleRows;
    const pinnedRows = this.pinnedRows;

    if (this._rootError) {
      return html`
        <div class="container">
          <div class="empty-state error-state">${this._rootError.message}</div>
        </div>
      `;
    }

    return html`
      <div class="container" @click=${() => this.closeContextMenu()}>
        ${pinnedRows.length > 0
          ? html`
              <div class="pinned">
                <div class="pinned-title">
                  ${this.mergedConfig.pinned?.label || 'Pinned'}
                </div>
                ${pinnedRows.map((row) => this.renderRow(row, true))}
              </div>
            `
          : null}

        ${rows.length === 0 && !this._loading
          ? html`<div class="empty-state">No data available</div>`
          : html`
              <lit-virtualizer
                style="height: 100%"
                .items=${rows}
                .renderItem=${(row: TreeRowViewModel<T>) => this.renderRow(row)}
                .layout=${flow({ itemSize: this.mergedConfig.virtualization?.itemSize ?? 36 })}>
              </lit-virtualizer>
            `}

        ${this._contextRow
          ? html`
              <div
                class="context-menu"
                style="left: ${this._contextPosition.x}px; top: ${this._contextPosition.y}px;"
                @click=${(event: Event) => event.stopPropagation()}>
                ${(this.mergedConfig.actions ?? []).map(
                  (action) => html`
                    <button
                      ?disabled=${action.disabled?.(this._contextRow!.data) ?? false}
                      @click=${() => {
                        const node = this.engine.getNode(this._contextRow!.id);
                        if (node) {
                          action.handler?.(node);
                          this.dispatchEvent(
                            new CustomEvent('context-menu-action', {
                              detail: { row: this._contextRow, action },
                            }),
                          );
                        }
                        this.closeContextMenu();
                      }}>
                      ${action.label(this._contextRow!.data)}
                    </button>
                  `,
                )}
              </div>
            `
          : null}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'td-tree-lit': TreeLit<any, any>;
  }
}
