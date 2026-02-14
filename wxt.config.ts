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
      default_icon: {
        16: 'icon/icon-16.png',
        32: 'icon/icon-32.png',
        48: 'icon/icon-48.png',
      },
    },

    icons: {
      16: 'icon/icon-16.png',
      32: 'icon/icon-32.png',
      48: 'icon/icon-48.png',
      128: 'icon/icon-128.png',
    },

    browser_specific_settings: {
      gecko: {
        id: 'web-time-tracker@extension.local',
        strict_min_version: '109.0',
      },
    },
  },
});
