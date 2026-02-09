/**
 * @fileoverview Tree Explorer Module - NgModule for backward compatibility
 * This module provides compatibility with traditional Angular module architecture
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';

// Import standalone components
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
    MatProgressBarModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    MatMenuModule,
    // Import standalone components
    TreeExplorerComponent,
    TreeItemComponent,
  ],
  exports: [
    // Export components for use in templates
    TreeExplorerComponent,
    TreeItemComponent,
  ],
  providers: [
    // Provide services
    TreeStateService,
  ],
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

