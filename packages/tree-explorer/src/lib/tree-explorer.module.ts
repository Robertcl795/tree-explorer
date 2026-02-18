/**
 * @fileoverview Tree Explorer Module - NgModule for backward compatibility
 * This module provides compatibility with traditional Angular module architecture
 */

import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';

// Import standalone components
import { AsyncTreeComponent } from './components/async-tree/async-tree.component';
import { DataExplorerCompatComponent } from './components/data-explorer-compat/data-explorer-compat.component';
import { TreeExplorerComponent } from './components/tree-explorer/tree-explorer.component';
import { TreeItemComponent } from './components/tree-item/tree-item.component';

// Import services
import { TreeStateService } from './services/tree.service';

// Import tokens
import { TREE_CONFIG } from './tokens/tree.configs';

/**
 * TreeExplorerModule - NgModule for traditional Angular module usage
 * 
 * @example
 * ```typescript
 * import { TreeExplorerModule } from 'tree-explorer';
 * 
 * @NgModule({
 *   imports: [TreeExplorerModule],
 *   // ...
 * })
 * export class MyModule {}
 * ```
 */
@NgModule({
  imports: [
    CommonModule,
    ScrollingModule,
    // Import standalone components
    AsyncTreeComponent,
    DataExplorerCompatComponent,
    TreeExplorerComponent,
    TreeItemComponent,
  ],
  exports: [
    // Export components for use in templates
    AsyncTreeComponent,
    DataExplorerCompatComponent,
    TreeExplorerComponent,
    TreeItemComponent,
  ],
  providers: [
    // Provide services
    TreeStateService,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TreeExplorerModule {
  /**
   * Use this method to configure the tree module with custom settings
   * 
   * @param config Partial tree configuration
   * @returns ModuleWithProviders
   * 
   * @example
   * ```typescript
   * TreeExplorerModule.forRoot({
   *   itemHeight: 40,
   *   showCheckboxes: true
   * })
   * ```
   */
  static forRoot(config?: any) {
    return {
      ngModule: TreeExplorerModule,
      providers: [
        {
          provide: TREE_CONFIG,
          useValue: config || {}
        }
      ]
    };
  }

  /**
   * Use this method for feature modules
   * 
   * @param config Partial tree configuration
   * @returns ModuleWithProviders
   */
  static forFeature(config?: any) {
    return {
      ngModule: TreeExplorerModule,
      providers: [
        {
          provide: TREE_CONFIG,
          useValue: config || {}
        }
      ]
    };
  }
}

