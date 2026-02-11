import { InjectionToken } from '@angular/core';
import { TreeConfig } from '@tree-core';

export const TREE_CONFIG = new InjectionToken<Partial<TreeConfig<any>>>(
  'TreeConfig',
  {
    providedIn: 'root',
    factory: () => ({}),
  },
);

