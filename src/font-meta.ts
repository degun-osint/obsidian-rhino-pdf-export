import * as zlib from "zlib";

/**
 * Read family, weight and style straight out of a font file, so the theme editor
 * can fill those fields in rather than make the user guess. Deriving them from
 * the filename does not work: "Inter_18pt-SemiBold" or "Marianne-Heavy" carry no
 * usable weight, and a variable font has a whole range.
 *
 * Supports the four formats @font-face accepts: woff2, woff, ttf and otf.
 * Font collections (.ttc) are not supported, and @font-face cannot use them.
 */
export interface FontMetadata {
  family: string;
  /** A single weight ("700") or a variable-font range ("100 900"). */
  weight: string;
  style: "normal" | "italic";
  /** Style name as the font declares it, e.g. "Bold Italic". For display. */
  subfamily: string;
}

export const FONT_EXTENSIONS = ["woff2", "woff", "ttf", "otf"];

/** Known table tags, indexed as in the WOFF2 spec. */
const WOFF2_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post",
  "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea",
  "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop",
  "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

type Tables = Map<string, Buffer>;

function readUIntBase128(buf: Buffer, pos: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (pos >= buf.length) throw new Error("truncated UIntBase128");
    const b = buf[pos++];
    if (i === 0 && b === 0x80) throw new Error("leading zero in UIntBase128");
    if (value & 0xfe000000) throw new Error("UIntBase128 overflow");
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) return [value >>> 0, pos];
  }
  throw new Error("UIntBase128 too long");
}

/** Plain sfnt: the table directory points straight into the file. */
function sfntTables(buf: Buffer): Tables {
  const numTables = buf.readUInt16BE(4);
  const tables: Tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = buf.subarray(o, o + 4).toString("latin1");
    const off = buf.readUInt32BE(o + 8);
    const len = buf.readUInt32BE(o + 12);
    if (off + len <= buf.length) tables.set(tag, buf.subarray(off, off + len));
  }
  return tables;
}

/** WOFF1: every table is individually zlib-compressed. */
function woffTables(buf: Buffer): Tables {
  const numTables = buf.readUInt16BE(12);
  const tables: Tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = buf.subarray(o, o + 4).toString("latin1");
    const off = buf.readUInt32BE(o + 4);
    const compLength = buf.readUInt32BE(o + 8);
    const origLength = buf.readUInt32BE(o + 12);
    const raw = buf.subarray(off, off + compLength);
    tables.set(tag, compLength < origLength ? zlib.inflateSync(raw) : raw);
  }
  return tables;
}

/**
 * WOFF2: one Brotli block holds every table back to back, sized by the
 * directory. `glyf`/`loca` may be transformed, but the tables we read never are.
 */
function woff2Tables(buf: Buffer): Tables {
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);

  let pos = 48;
  const entries: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos++];
    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;

    let tag: string;
    if (tagIndex === 0x3f) {
      tag = buf.subarray(pos, pos + 4).toString("latin1");
      pos += 4;
    } else {
      tag = WOFF2_TAGS[tagIndex];
    }

    let length: number;
    [length, pos] = readUIntBase128(buf, pos);

    // Null transform is version 3 for glyf/loca, version 0 for everything else.
    const isGlyfLoca = tag === "glyf" || tag === "loca";
    const transformed = isGlyfLoca ? transformVersion === 0 : transformVersion !== 0;
    if (transformed) [length, pos] = readUIntBase128(buf, pos);

    entries.push({ tag, length });
  }

  const data = zlib.brotliDecompressSync(buf.subarray(pos, pos + totalCompressedSize));
  const tables: Tables = new Map();
  let off = 0;
  for (const e of entries) {
    if (off + e.length <= data.length) tables.set(e.tag, data.subarray(off, off + e.length));
    off += e.length;
  }
  return tables;
}

/**
 * Style words that may be glued onto a legacy family name, with the weight each
 * one implies. Ordering is irrelevant: only the entry matching the font's actual
 * weight is ever tried.
 */
const WEIGHT_SUFFIXES: { pattern: string; weight: number }[] = [
  { pattern: "thin|hairline", weight: 100 },
  { pattern: "extra[ _-]?light|ultra[ _-]?light", weight: 200 },
  { pattern: "light", weight: 300 },
  { pattern: "regular|normal|book", weight: 400 },
  { pattern: "medium", weight: 500 },
  { pattern: "semi[ _-]?bold|demi[ _-]?bold", weight: 600 },
  { pattern: "bold", weight: 700 },
  { pattern: "extra[ _-]?bold|ultra[ _-]?bold", weight: 800 },
  { pattern: "black|heavy", weight: 900 },
];

/**
 * Recover the family name shared by every weight of a family.
 *
 * OpenType only guarantees name ID 1 to hold a plain family name for the four
 * RIBBI styles. Anything else — Light, SemiBold, ExtraBold — is folded into it,
 * so Open Sans ships "Open Sans ExtraBold" with subfamily "Regular". Name ID 16
 * carries the real family when present, but plenty of fonts omit it.
 *
 * The suffix is only stripped when it matches the weight the font declares.
 * "Archivo Black" is a family in its own right and reports weight 400, so its
 * name survives; "Roboto Black" reports 900 and loses the suffix.
 */
function deriveFamily(
  legacyFamily: string,
  typographicFamily: string,
  weight: number | null,
  italic: boolean
): string {
  if (typographicFamily) return typographicFamily;

  let family = legacyFamily.trim();
  if (italic) {
    const stripped = family.replace(/[\s_-]*(italic|oblique)$/i, "").trim();
    if (stripped) family = stripped;
  }
  if (weight !== null) {
    for (const { pattern, weight: suffixWeight } of WEIGHT_SUFFIXES) {
      if (suffixWeight !== weight) continue;
      const stripped = family.replace(new RegExp(`[\\s_-]*(${pattern})$`, "i"), "").trim();
      if (stripped && stripped !== family) family = stripped;
      break;
    }
  }
  return family || legacyFamily;
}

/**
 * Pull family (name ID 16, else 1) and subfamily (17, else 2) from the name
 * table, preferring the Windows platform records.
 */
function readNames(name: Buffer | undefined): {
  family: string;
  subfamily: string;
  legacyFamily: string;
  typographicFamily: string;
} {
  const empty = { family: "", subfamily: "", legacyFamily: "", typographicFamily: "" };
  if (!name || name.length < 6) return empty;

  const count = name.readUInt16BE(2);
  const stringOffset = name.readUInt16BE(4);
  // nameID -> { priority, value }; the most English record wins.
  const found = new Map<number, { priority: number; value: string }>();

  for (let i = 0; i < count; i++) {
    const o = 6 + i * 12;
    if (o + 12 > name.length) break;
    const platformID = name.readUInt16BE(o);
    const languageID = name.readUInt16BE(o + 4);
    const nameID = name.readUInt16BE(o + 6);
    const length = name.readUInt16BE(o + 8);
    const offset = name.readUInt16BE(o + 10);
    if (nameID !== 1 && nameID !== 2 && nameID !== 16 && nameID !== 17) continue;

    const start = stringOffset + offset;
    if (start + length > name.length) continue;
    const bytes = name.subarray(start, start + length);

    let value: string;
    if (platformID === 3 || platformID === 0) {
      if (length % 2 !== 0) continue;
      // Copy before swapping: swap16 mutates, and two name IDs routinely point
      // at the same bytes — the second read would see them already swapped.
      value = Buffer.from(bytes).swap16().toString("utf16le");
    } else {
      value = bytes.toString("latin1");
    }
    value = value.replace(/\0/g, "").trim();
    if (!value) continue;

    // Records are localized: macOS ships Arial Bold with subfamily "Gras".
    // Prefer Windows/en-US (3, 0x0409), then Mac/English (1, 0).
    let priority = 1;
    if (platformID === 3) priority = languageID === 0x0409 ? 4 : 2;
    else if (platformID === 1) priority = languageID === 0 ? 3 : 1;

    const prev = found.get(nameID);
    if (!prev || priority > prev.priority) found.set(nameID, { priority, value });
  }

  return {
    family: found.get(16)?.value ?? found.get(1)?.value ?? "",
    subfamily: found.get(17)?.value ?? found.get(2)?.value ?? "",
    legacyFamily: found.get(1)?.value ?? "",
    typographicFamily: found.get(16)?.value ?? "",
  };
}

/** A variable font's wght axis, else the static usWeightClass. */
function readWeight(tables: Tables): string {
  const fvar = tables.get("fvar");
  if (fvar && fvar.length >= 12) {
    const axisOffset = fvar.readUInt16BE(4);
    const axisCount = fvar.readUInt16BE(8);
    const axisSize = fvar.readUInt16BE(10);
    for (let i = 0; i < axisCount; i++) {
      const o = axisOffset + i * axisSize;
      if (o + 20 > fvar.length) break;
      if (fvar.subarray(o, o + 4).toString("latin1") !== "wght") continue;
      const min = Math.round(fvar.readInt32BE(o + 4) / 65536);
      const max = Math.round(fvar.readInt32BE(o + 12) / 65536);
      if (min > 0 && max > min) return `${min} ${max}`;
      if (min > 0) return String(min);
    }
  }

  const os2 = tables.get("OS/2");
  if (os2 && os2.length >= 6) {
    const weight = os2.readUInt16BE(4);
    // Some older fonts (Skia, and much of the classic Mac library) use Apple's
    // 1–9 scale rather than the 100–900 one CSS expects.
    if (weight >= 1 && weight <= 9) return String(weight * 100);
    if (weight >= 100 && weight <= 1000) return String(weight);
  }
  return "400";
}

function readStyle(tables: Tables, subfamily: string): "normal" | "italic" {
  const os2 = tables.get("OS/2");
  if (os2 && os2.length >= 64) {
    const fsSelection = os2.readUInt16BE(62);
    if (fsSelection & 0x01) return "italic";
    if (fsSelection & 0x40) return "normal"; // REGULAR bit, authoritative
  }
  const head = tables.get("head");
  if (head && head.length >= 46 && head.readUInt16BE(44) & 0x02) return "italic";
  return /italic|oblique/i.test(subfamily) ? "italic" : "normal";
}

/**
 * Parse a font file. Returns null when the bytes are not a supported font,
 * rather than throwing at the caller.
 */
export function readFontMetadata(data: ArrayBuffer | Buffer): FontMetadata | null {
  try {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buf.length < 16) return null;

    const magic = buf.subarray(0, 4).toString("latin1");
    if (magic === "ttcf") return null; // collection: @font-face cannot use it

    let tables: Tables;
    if (magic === "wOF2") tables = woff2Tables(buf);
    else if (magic === "wOFF") tables = woffTables(buf);
    else tables = sfntTables(buf);

    const names = readNames(tables.get("name"));
    if (!names.family) return null;

    const weight = readWeight(tables);
    const style = readStyle(tables, names.subfamily);
    // A variable font spans several weights, so no single suffix to strip.
    const staticWeight = weight.includes(" ") ? null : parseInt(weight, 10);

    return {
      family: deriveFamily(names.legacyFamily, names.typographicFamily, staticWeight, style === "italic"),
      subfamily: names.subfamily,
      weight,
      style,
    };
  } catch {
    return null;
  }
}
