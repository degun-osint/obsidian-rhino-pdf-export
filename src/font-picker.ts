import { AbstractInputSuggest, App, FuzzySuggestModal, TFile, TFolder } from "obsidian";
import { FONT_EXTENSIONS, readFontMetadata, type FontMetadata } from "./font-meta";

const MAX_SUGGESTIONS = 20;

function isFontFile(file: TFile): boolean {
  return FONT_EXTENSIONS.includes(file.extension.toLowerCase());
}

/** Font files a folder holds directly, sorted by name. */
export function fontFilesIn(folder: TFolder): TFile[] {
  return folder.children
    .filter((child): child is TFile => child instanceof TFile && isFontFile(child))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Autocomplete a vault path against the font files actually present. */
export class FontFileSuggest extends AbstractInputSuggest<TFile> {
  constructor(
    app: App,
    private textInputEl: HTMLInputElement,
    private onSelectFile: (file: TFile) => void
  ) {
    super(app, textInputEl);
  }

  protected getSuggestions(query: string): TFile[] {
    const q = query.toLowerCase();
    return this.app.vault
      .getFiles()
      .filter((f) => isFontFile(f) && f.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, MAX_SUGGESTIONS);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.createDiv({ text: file.name });
    const parent = file.parent?.path;
    if (parent) el.createDiv({ text: parent, cls: "rhino-suggest-path" });
  }

  selectSuggestion(file: TFile): void {
    this.setValue(file.path);
    // TextComponent listens on "input"; setValue alone would not fire onChange.
    this.textInputEl.dispatchEvent(new Event("input"));
    this.close();
    this.onSelectFile(file);
  }
}

/** Pick a vault folder, restricted to those that actually contain font files. */
export class FontFolderModal extends FuzzySuggestModal<TFolder> {
  constructor(app: App, private onChooseFolder: (folder: TFolder) => void) {
    super(app);
    this.setPlaceholder("Select a folder containing font files");
  }

  getItems(): TFolder[] {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder && fontFilesIn(f).length > 0)
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  getItemText(folder: TFolder): string {
    const count = fontFilesIn(folder).length;
    return `${folder.path || "/"} (${count} font${count > 1 ? "s" : ""})`;
  }

  onChooseItem(folder: TFolder): void {
    this.onChooseFolder(folder);
  }
}

export interface ReadFontResult {
  file: TFile;
  metadata: FontMetadata | null;
}

/** Read metadata for several font files at once, keeping the failures. */
export async function readFontFiles(app: App, files: TFile[]): Promise<ReadFontResult[]> {
  return Promise.all(
    files.map(async (file) => ({
      file,
      metadata: readFontMetadata(await app.vault.readBinary(file)),
    }))
  );
}
