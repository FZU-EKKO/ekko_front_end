/// <reference types="vite/client" />

type DesktopView = "login" | "register" | "reset" | "workspace" | "settings";

interface ElectronAPI {
  getVersion: () => Promise<string>;
  setView: (view: DesktopView) => Promise<boolean>;
  setMinimizeOnClose: (enabled: boolean) => Promise<boolean>;
  minimizeWindow: () => Promise<boolean>;
  toggleMaximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<boolean>;
}

interface Window {
  electronAPI?: ElectronAPI;
}

