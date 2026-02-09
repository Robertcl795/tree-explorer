export type TreePageIndexing = 'zero-based' | 'one-based';

export interface PageRequest {
  pageIndex: number;
  pageSize: number;
}

export interface PageResult<TSource> {
  items: TSource[];
  totalCount: number;
}

export interface TreePaginationConfig {
  enabled: boolean;
  pageSize: number;
  pageIndexing?: TreePageIndexing;
}

