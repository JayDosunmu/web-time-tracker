import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";

export default defineConfig({
  srcDir: "src",

  vite: () => ({
    plugins: [preact()],
  }),

  manifest: {
    name: "Take5 Time Tracker",
    version: "0.0.1",
    description: "Track time spent on different domains",
    permissions: [
      "tabs",
      "storage",
      "activeTab",
      "webNavigation",
      "idle",
      "alarms",
    ],
    host_permissions: ["<all_urls>"],
    homepage_url: "https://github.com/JayDosunmu/take5-time-tracker",

    action: {
      default_title: "Web Time Tracker",
      default_icon: {
        16: "icon/icon-16.png",
        32: "icon/icon-32.png",
        48: "icon/icon-48.png",
      },
    },

    icons: {
      16: "icon/icon-16.png",
      32: "icon/icon-32.png",
      48: "icon/icon-48.png",
      128: "icon/icon-128.png",
    },

    browser_specific_settings: {
      gecko: {
        id: "take5-time-tracker@extension.local",
        strict_min_version: "109.0",
        update_url:
          "https://storage.googleapis.com/take5/extension/updates.json",
      },
    },
  },
});
