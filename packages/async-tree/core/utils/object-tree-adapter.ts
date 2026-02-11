/**
 * @fileoverview Tree Explorer Adapters
 */

import { TreeAdapter } from '../types/tree-adapter';

/**
 * Generic adapter for simple object trees with `id`, `name`, and `children`.
 */
export class ObjectTreeAdapter<T extends { id: string; name?: string; children?: T[] }>
  implements TreeAdapter<T, T>
{
  getId(source: T): string {
    return source.id;
  }

  getLabel(data: T): string {
    return data.name ?? data.id;
  }

  getChildren(data: T): T[] | undefined {
    return data.children;
  }
}


