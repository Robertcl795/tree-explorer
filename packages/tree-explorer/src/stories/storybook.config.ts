/**
 * @fileoverview Storybook Configuration for Tree Explorer
 * Global styles and parameters to ensure proper tree display
 */

// Global styles for all tree stories
export const treeStorybookStyles = `
  .sb-show-main {
    padding: 0 !important;
  }
  
  .sb-story {
    height: 100vh !important;
    min-height: 600px !important;
  }
  
  /* Ensure proper tree sizing in docs view */
  .docs-story {
    height: 80vh !important;
    min-height: 500px !important;
  }
  
  /* Override any Storybook defaults that might interfere */
  .tree-explorer {
    box-sizing: border-box !important;
  }
  
  /* CDK Virtual Scroll specific fixes */
  .cdk-virtual-scroll-viewport {
    height: 100% !important;
  }
  
  .cdk-virtual-scroll-content-wrapper {
    height: 100% !important;
  }
`;

// Default parameters for tree stories
export const treeStorybookParameters = {
  layout: 'fullscreen',
  viewport: {
    defaultViewport: 'responsive'
  },
  docs: {
    story: {
      height: '80vh',
      minHeight: '500px'
    }
  }
};

// Helper to inject styles into Storybook
export const injectTreeStyles = () => {
  if (typeof document !== 'undefined') {
    const styleId = 'tree-explorer-storybook-styles';
    let styleEl = document.getElementById(styleId);
    
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.innerHTML = treeStorybookStyles;
      document.head.appendChild(styleEl);
    }
  }
};

// Meta configuration for tree stories
export const createTreeMeta = (title: string, additionalParameters = {}) => ({
  title,
  parameters: {
    ...treeStorybookParameters,
    ...additionalParameters
  }
});

// Decorator to ensure proper styling
export const withTreeStyles = (story: any, context: any) => {
  injectTreeStyles();
  return story();
};

