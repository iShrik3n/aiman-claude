/// <reference types="vite/client" />

type AimanDesktopBridge = {
  isDesktop: boolean;
  platform?: string;
  electron?: string;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  setTheme: (theme: { id: string; bg: string }) => void;
  onState: (cb: (state: { maximized: boolean; focused?: boolean }) => void) => () => void;
  getPendingDeepLink?: () => Promise<string | null>;
  onDeepLink?: (cb: (url: string) => void) => () => void;
};

interface Window {
  aimanDesktop?: AimanDesktopBridge;
}
