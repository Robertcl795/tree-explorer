import { TreeId } from './tree-node';

/** Error information for root or child load failures. */
export interface TreeLoadError {
  scope: 'root' | 'children' | 'navigation';
  nodeId?: TreeId;
  pageIndex?: number;
  reason?:
    | 'not-found'
    | 'path-unavailable'
    | 'path-resolution-failed'
    | 'load-failed';
  error: unknown;
  message?: string;
}
