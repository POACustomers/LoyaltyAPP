import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dinascorner.app',
  appName: "Dina's Corner",
  webDir: 'public',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  }
};

export default config;
