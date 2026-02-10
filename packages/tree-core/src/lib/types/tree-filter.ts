export interface TreeMatchRange {
  start: number;
  end: number;
}

export interface TreeFilterQuery {
  text?: string;
  tokens?: string[];
  fields?: string[];
  flags?: Record<string, boolean>;
  caseSensitive?: boolean;
  mode?: 'contains' | 'exact';
}

export type TreeFilterInput = TreeFilterQuery | string | null | undefined;

export type TreeFilterSelectionPolicy = 'keep' | 'clearHidden';

export interface TreeFilteringConfig {
  /**
   * Keep ancestor rows visible when descendants match the filter query.
   * Defaults to true for tree-search ergonomics.
   */
  showParentsOfMatches?: boolean;
  /**
   * Expand ancestor paths for loaded matches when a filter is applied.
   * Defaults to false to avoid mutating user expansion state unexpectedly.
   */
  autoExpandMatches?: boolean;
  /**
   * Selection behavior while filter is active.
   * - keep: preserve hidden selections
   * - clearHidden: clear selections that are not visible in filtered rows
   */
  selectionPolicy?: TreeFilterSelectionPolicy;
  /**
   * Keep placeholder rows visible under visible paged parents while filtering.
   * Defaults to true to preserve virtualization geometry for paged branches.
   */
  keepPlaceholdersVisible?: boolean;
}

export const DEFAULT_TREE_FILTERING_CONFIG: Readonly<Required<TreeFilteringConfig>> = Object.freeze({
  showParentsOfMatches: true,
  autoExpandMatches: false,
  selectionPolicy: 'keep',
  keepPlaceholdersVisible: true,
});
