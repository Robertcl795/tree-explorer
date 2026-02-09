/**
 * @fileoverview Story Utilities for Tree Explorer
 */

import { DestroyRef } from '@angular/core';
import { StoryObj } from '@storybook/angular';
import { TreeContextAction, TreeConfig, TreeAdapter } from '@tree-core';
import { TreeExplorerComponent } from '../lib/components';
import { TreeStateService } from '../lib/services/tree.service';

export { basicConfig, fileSystemConfig, organizationConfig, menuConfig } from './tree-explorer.config';

export type TreeStory = StoryObj<TreeExplorerComponent>;

export interface StoryConfig<TSource, T = TSource> {
  data: TSource[];
  adapter: TreeAdapter<TSource, T>;
  config?: Partial<TreeConfig<T>>;
  loading?: boolean;
  actions?: TreeContextAction<T>[];
}

export const createTreeStory = <TSource, T = TSource>(
  storyConfig: StoryConfig<TSource, T>,
): TreeStory => ({
  args: {
    data: storyConfig.data,
    adapter: storyConfig.adapter,
    config: { ...(storyConfig.config ?? {}), actions: storyConfig.actions ?? [] },
    loading: storyConfig.loading ?? false,
  },
  render: (args) => treeRender(args),
});

export function treeRender(args: any, height: string = '80vh') {
  return {
    props: args,
    moduleMetadata: {
      providers: [TreeStateService, { provide: DestroyRef, useValue: { onDestroy: () => {} } }],
    },
    template: `
      <div style="height: ${height}; width: 100%; box-sizing: border-box; padding: 16px; background: #fafafa;">
        <div style="height: 100%; width: 100%; background: white; border-radius: 8px; border: 1px solid #e0e0e0; overflow: hidden;">
          <tree-explorer
            [data]="data"
            [config]="config"
            [adapter]="adapter"
            [loading]="loading"
            (itemClick)="itemClick && itemClick($event)"
            (itemDoubleClick)="itemDoubleClick && itemDoubleClick($event)"
            (itemToggleExpand)="itemToggleExpand && itemToggleExpand($event)"
            (itemToggleSelect)="itemToggleSelect && itemToggleSelect($event)"
            (contextMenuAction)="contextMenuAction && contextMenuAction($event)"
            style="height: 100%; width: 100%; display: block;">
          </tree-explorer>
        </div>
      </div>
    `,
  };
}

