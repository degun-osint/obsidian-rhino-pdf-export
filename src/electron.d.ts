declare module "electron" {
  interface BrowserWindowOptions {
    show?: boolean;
    width?: number;
    height?: number;
    webPreferences?: {
      javascript?: boolean;
      nodeIntegration?: boolean;
      contextIsolation?: boolean;
    };
  }

  interface WebContents {
    // Resolves with whatever the evaluated code returns (Electron types this as any).
    executeJavaScript(code: string): Promise<any>;
    printToPDF(options: {
      printBackground?: boolean;
      preferCSSPageSize?: boolean;
    }): Promise<Uint8Array>;
  }

  interface BrowserWindowInstance {
    loadFile(filePath: string): Promise<void>;
    destroy(): void;
    webContents: WebContents;
  }

  interface BrowserWindowConstructor {
    new (options: BrowserWindowOptions): BrowserWindowInstance;
  }

  interface SaveDialogOptions {
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }

  interface SaveDialogResult {
    canceled: boolean;
    filePath?: string;
  }

  interface OpenDialogOptions {
    defaultPath?: string;
    properties?: string[];
    title?: string;
  }

  interface OpenDialogResult {
    canceled: boolean;
    filePaths: string[];
  }

  interface ElectronDialog {
    showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogResult>;
    showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogResult>;
  }

  interface ElectronRemote {
    BrowserWindow: BrowserWindowConstructor;
    dialog: ElectronDialog;
  }

  interface ElectronModule {
    remote?: ElectronRemote;
  }

  const electron: ElectronModule;
  export default electron;
  export type {
    ElectronRemote,
    BrowserWindowInstance,
    WebContents,
    SaveDialogResult,
    OpenDialogResult,
  };
}
