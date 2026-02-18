import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { TREE_CONFIG, TreeConfig } from '@tree-core';

export function provideTreeExplorer<T = unknown>(
  config: Partial<TreeConfig<T>> = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: TREE_CONFIG, useValue: config },
  ]);
}
