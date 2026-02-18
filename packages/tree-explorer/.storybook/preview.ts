import type { Preview } from '@storybook/angular';
import '@covalent/components';

if (typeof document !== 'undefined') {
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
  link.rel = 'stylesheet';
  document.head.appendChild(link);

  const robotoLink = document.createElement('link');
  robotoLink.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap';
  robotoLink.rel = 'stylesheet';
  document.head.appendChild(robotoLink);

  document.body.classList.add('mat-typography');
  document.body.style.fontFamily = '"Roboto", "Helvetica Neue", sans-serif';
  document.body.style.margin = '0';
}

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },
};

export default preview;
