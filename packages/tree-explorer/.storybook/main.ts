import type { StorybookConfig } from '@storybook/angular';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.stories.ts",
    "../src/**/*.stories.mdx"
  ],
  "addons": [
    "@storybook/addon-docs",
    "@storybook/addon-controls",
    "@storybook/addon-actions"
  ],
  "framework": {
    "name": "@storybook/angular",
    "options": {}
  },
  "managerHead": (head) => `
    ${head}
    <link rel="stylesheet" href="https://unpkg.com/@angular/material@latest/prebuilt-themes/indigo-pink.css">
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
  `
};
export default config;
