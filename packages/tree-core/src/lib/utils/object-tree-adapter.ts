import { TreeAdapter } from '../types/tree-adapter';

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
