import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.polytechnichub.app',
  appName: 'Polytechnic Hub',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#060B16',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#060B16',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
