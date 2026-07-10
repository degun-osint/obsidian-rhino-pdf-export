/**
 * Minimal ambient declarations for the Node built-ins this plugin uses at
 * runtime (Electron provides them). Shipped locally, like `electron.d.ts`, so
 * the code type-checks without `@types/node` — the community-plugin review lints
 * with `types: []`, which drops all ambient `@types/*`, and Buffer/fs/path/os
 * would otherwise resolve to `any` and trip every no-unsafe-* rule.
 *
 * Only the surface actually called is declared, on purpose.
 */

declare module "fs" {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function unlinkSync(path: string): void;
  export function writeFileSync(path: string, data: string | Uint8Array, encoding?: string): void;
}

declare module "path" {
  export function basename(p: string, ext?: string): string;
  export function dirname(p: string): string;
  export function join(...parts: string[]): string;
}

declare module "os" {
  export function tmpdir(): string;
}

declare module "zlib" {
  export function brotliDecompressSync(data: Uint8Array): Uint8Array;
  export function inflateSync(data: Uint8Array): Uint8Array;
}

/** The slice of Node's Buffer used for base64 encoding and PDF bytes. */
interface Buffer extends Uint8Array {
  toString(encoding?: string): string;
}
declare const Buffer: {
  from(data: ArrayBuffer | Uint8Array | string, encoding?: string): Buffer;
};

/** Build-time constants injected by esbuild `define`; always present at runtime. */
declare const process: { env: Record<string, string> };
