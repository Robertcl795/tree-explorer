/**
 * @fileoverview Tree Explorer Configuration Presets
 * Common configurations for different tree use cases
 */

import {
  SELECTION_MODES,
  TREE_DENSITY,
  TreeConfig,
  VIRTUALIZATION_MODES,
} from '@tree-core';

/**
 * Basic tree configuration with minimal features
 */
export const basicConfig: Partial<TreeConfig<any>> = {
  selection: { mode: SELECTION_MODES.NONE },
  display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: true },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 32 },
};

/**
 * File system tree configuration with appropriate settings
 */
export const fileSystemConfig: Partial<TreeConfig<any>> = {
  selection: { mode: SELECTION_MODES.MULTI, hierarchical: true },
  display: { indentPx: 24, density: TREE_DENSITY.NORMAL, showIcons: true },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 36 },
};

/**
 * Organization chart configuration optimized for hierarchy display
 */
export const organizationConfig: Partial<TreeConfig<any>> = {
  selection: { mode: SELECTION_MODES.SINGLE },
  display: { indentPx: 20, density: TREE_DENSITY.NORMAL, showIcons: true },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 48 },
};

/**
 * Menu navigation configuration for minimal UI
 */
export const menuConfig: Partial<TreeConfig<any>> = {
  selection: { mode: SELECTION_MODES.NONE },
  display: { indentPx: 16, density: TREE_DENSITY.COMPACT, showIcons: false },
  virtualization: { mode: VIRTUALIZATION_MODES.AUTO, itemSize: 32 },
};

