import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: 'src',

  vite: () => ({
    plugins: [preact()],
  }),

  manifest: {
    name: 'Web Time Tracker',
    version: '0.0.1',
    description: 'Track time spent on different domains',
    permissions: ['tabs', 'storage', 'activeTab', 'webNavigation', 'idle', 'alarms'],
    host_permissions: ['<all_urls>'],
    homepage_url: 'https://github.com/JayDosunmu/web-time-tracker',

    action: {
      default_title: 'Web Time Tracker',
      default_icon: 'icon/icon.svg',
    },

    icons: {
      48: 'icon/icon.svg',
      128: 'icon/icon.svg',
    },

    browser_specific_settings: {
      gecko: {
        id: 'web-time-tracker@extension.local',
        strict_min_version: '109.0',
      },
    },
  },
});
