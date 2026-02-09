import { InjectionToken } from '@angular/core';
import { DEFAULT_TREE_CONFIG, TreeConfig } from '@tree-core';

export { DEFAULT_TREE_CONFIG } from '@tree-core';

export const TREE_CONFIG = new InjectionToken<Partial<TreeConfig<any>>>(
  'TreeConfig',
  {
    providedIn: 'root',
    factory: () => ({}),
  },
);

