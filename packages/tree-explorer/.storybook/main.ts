import type { StorybookConfig } from '@storybook/angular';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.ts',
    '../src/**/*.stories.mdx',
  ],
  addons: [
    '@storybook/addon-docs',
  ],
  framework: {
    name: '@storybook/angular',
    options: {
      schemaLocation: '@angular/core',
    },
  },
  managerHead: (head) => `
    ${head}
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
  `,
};

export default config;
