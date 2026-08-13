import {
  decodeLEB128,
  decodeString,
  encodeLEB128,
  encodeString,
  pair2int,
} from "./utils";

interface ICElementRecipe {
  readonly a: ICElement;
  readonly b: ICElement;
}

interface ICElementUse {
  readonly other: ICElement;
  readonly result: ICElement;
}

interface ICElement {
  readonly id: number;
  readonly text: string;
  emoji: string;
  discovery: boolean;
  readonly recipes: ICElementRecipe[];
  readonly uses: ICElementUse[];
}

const DEFAULT_EMOJI = "⬜";

const ICB1_HEADER = new Uint8Array([0x15, 0xf1, 0x51, 0x53]);
const ICB2_HEADER = new Uint8Array([0x49, 0x43, 0x42, 0x1f]);

type SavefileType = "official" | "legacy" | "binaryV2" | "binaryV1";

async function getSavefileTypeFromFile(
  file: File,
): Promise<SavefileType | null> {
  const header = await file.slice(0, 4).bytes();
  return getSavefileType(header);
}

function getSavefileType(raw: Uint8Array): SavefileType | null {
  if (raw[0] === 0x1f && raw[1] === 0x8b) return "official";
  if (raw[0] === 0x7b) return "legacy";
  if (ICB1_HEADER.every((x, i) => raw[i] === x)) return "binaryV1";
  if (ICB2_HEADER.every((x, i) => raw[i] === x)) return "binaryV2";
  return null;
}

type Bytes = Uint8Array<ArrayBuffer>;

async function compressBuffer(
  buffer: Bytes,
  format: CompressionFormat,
  compress = true,
): Promise<Bytes> {
  const stream = compress
    ? new CompressionStream(format)
    : new DecompressionStream(format);
  const out = new Blob([buffer]).stream().pipeThrough(stream);

  return new Uint8Array(await new Response(out).arrayBuffer());
}

function addHeader(buffer: Bytes, header: Bytes): Bytes {
  const merged = new Uint8Array(header.length + buffer.length);
  merged.set(header);
  merged.set(buffer, header.length);
  return merged;
}

const getEmojisSorted = (elements: ICElement[]): Map<string, number> => {
  const emojis = new Map<string, number>();
  for (const { emoji } of elements) {
    emojis.set(emoji, (emojis.get(emoji) || 0) + 1);
  }

  return new Map(
    [...emojis.entries()].sort((a, b) => b[1] - a[1]).map((x, i) => [x[0], i]),
  );
};

interface OfficialSavefileItem {
  id: number;
  readonly text: string;
  readonly emoji: string;
  readonly discovery?: boolean;
  readonly recipes?: readonly (readonly [number, number])[];
}

interface OfficialSavefileData {
  readonly name: string;
  readonly created: number;
  readonly updated: number;
  readonly version: "1.0";
  readonly instances: unknown[];
  readonly items: OfficialSavefileItem[];
}

interface LegacyICElementBase {
  readonly text: string;
  readonly emoji: string;
}

interface LegacyICElement extends LegacyICElementBase {
  readonly discovered?: boolean;
}

interface LeagacySavefileData {
  elements?: LegacyICElement[];
  recipes?: Record<string, [LegacyICElementBase, LegacyICElementBase][]>;
}

interface SavefileStats {
  elements: number;
  discoveries: number;
  recipes: number;
}

interface SavefileOptions {
  readonly generateElementUses: boolean;
  readonly generateReverseRecipeMap: boolean;
}

interface ICSavefileOptions extends Partial<SavefileOptions> {
  readonly name?: string;
  readonly created?: number;
}

class Savefile {
  name: string;
  created: number;
  readonly elements: ICElement[] = [];
  readonly elementNames: Map<string, ICElement> = new Map();
  readonly reverseRecipeMap: Map<ICElementRecipe, ICElement> = new Map();
  type: SavefileType = "official";
  readonly options: SavefileOptions;
  readonly stats: SavefileStats = { elements: 0, discoveries: 0, recipes: 0 };

  constructor(options: ICSavefileOptions = {}) {
    this.name = options.name ?? "Save File";
    this.created = options.created ?? Date.now();

    this.options = {
      generateElementUses: options.generateElementUses ?? true,
      generateReverseRecipeMap: options.generateReverseRecipeMap ?? true,
    };
  }

  static async decode(
    raw: Bytes,
    options?: ICSavefileOptions,
  ): Promise<Savefile | null> {
    const type = getSavefileType(raw);

    if (!type) return null;

    const save = new Savefile(options);
    save.type = type;

    if (type === "official") {
      return await save.#decodeOfficial(raw);
    } else if (type === "legacy") {
      return save.#decodeLegacy(raw);
    } else if (type === "binaryV1") {
      return await save.#decodeBinaryV1(raw);
    }

    throw new Error("Not implemented");
  }

  addElement(
    text: string,
    emoji: string = DEFAULT_EMOJI,
    discovery = false,
  ): ICElement {
    const el = this.elementNames.get(text);
    if (el) return el;

    const element: ICElement = {
      id: this.elements.length,
      text,
      emoji,
      discovery,
      recipes: [],
      uses: [],
    };

    this.elements.push(element);
    this.elementNames.set(text, element);

    this.stats.elements++;
    if (discovery) this.stats.discoveries++;

    return element;
  }

  addRecipe(a: ICElement, b: ICElement, result: ICElement): void {
    for (const recipe of result.recipes) {
      if (recipe.a === a && recipe.b === b) return;
    }

    this.#addRecipe(a, b, result);
  }

  #addRecipe(a: ICElement, b: ICElement, result: ICElement): void {
    const pair = { a, b };
    result.recipes.push(pair);
    this.stats.recipes++;

    if (this.options.generateReverseRecipeMap) {
      this.reverseRecipeMap.set(pair, result);
    }

    if (this.options.generateElementUses) {
      a.uses.push({ other: b, result });
      b.uses.push({ other: a, result });
    }
  }

  async #decodeOfficial(raw: Bytes): Promise<this> {
    const buffer = await compressBuffer(raw, "gzip", false);
    const decodedBuffer = new TextDecoder().decode(buffer);
    const data: OfficialSavefileData = JSON.parse(decodedBuffer);

    this.name = data.name;
    this.created = data.created;

    data.items.sort((a, b) => a.id - b.id);
    for (const item of data.items) {
      if (item.text === "Nothing") continue;

      const id = this.elements.length;
      item.id = id;

      const element = {
        id,
        text: item.text,
        emoji: item.emoji,
        discovery: !!item.discovery,
        recipes: [],
        uses: [],
      };

      this.elements.push(element);
      this.elementNames.set(item.text, element);
      if (item.discovery) this.stats.discoveries++;
    }

    for (const item of data.items) {
      const result = this.elements[item.id]!;
      if (!item.recipes || item.text === "Nothing") continue;

      const pairs = new Set<number>();
      for (const [aId, bId] of item.recipes) {
        const itemA = data.items[aId];
        const itemB = data.items[bId];
        if (!itemA || !itemB) continue;

        const a = this.elements[itemA.id];
        const b = this.elements[itemB.id];
        if (!a || !b) continue;

        const pairId = pair2int(a.id, b.id);
        if (pairs.has(pairId)) continue;
        pairs.add(pairId);

        this.#addRecipe(a, b, result);
      }
    }

    this.stats.elements = this.elements.length;
    return this;
  }

  async #decodeBinaryV1(raw: Bytes): Promise<this> {
    const buffer = await compressBuffer(raw.slice(4), "deflate-raw", false);

    let pos = -1;
    const read = () => buffer[++pos]!;

    const elementCount = decodeLEB128(read);
    const recipes = new Map<number, [number, number][]>();

    for (let id = 0; id < elementCount; id++) {
      const text = decodeString(read);
      const emojiId = decodeLEB128(read);
      const flags = read();
      const isDiscovery = flags > 127;

      const element: ICElement = {
        id,
        text,
        // @ts-expect-error we are doing some weird manipulation here
        emoji: emojiId,
        discovery: isDiscovery,
        recipes: [],
        uses: [],
      };

      if (text != "Nothing") {
        this.elements.push(element);
        this.elementNames.set(text, element);
      }

      // @ts-expect-error we can multiply boolean by number
      let recipeCount = flags - isDiscovery * 128;
      if (recipeCount >= 127) recipeCount += decodeLEB128(read);
      if (isDiscovery) this.stats.discoveries++;

      const list: [number, number][] = [];
      recipes.set(id, list);

      for (let i = 0; i < recipeCount; i++) {
        const a = decodeLEB128(read),
          b = decodeLEB128(read) + a;
        list.push([a, b]);
      }
    }

    const emojis = new Map<number, string>();
    const emojiCount = decodeLEB128(read);
    for (let i = 0; i < emojiCount; i++) emojis.set(i, decodeString(read));
    for (const element of this.elements) {
      // @ts-expect-error we are doing some weird manipulation here
      element.emoji = emojis.get(element.emoji) || DEFAULT_EMOJI;
    }

    for (const [element, list] of recipes) {
      const result = this.elements[element];
      if (!result) continue;

      const pairs = new Set<number>();
      for (const recipe of list) {
        const a = this.elements[recipe[0]];
        const b = this.elements[recipe[1]];
        if (!a || !b) continue;

        const pairId = pair2int(a.id, b.id);
        if (pairs.has(pairId)) continue;
        pairs.add(pairId);

        this.#addRecipe(a, b, result);
      }
    }

    this.stats.elements = this.elements.length;
    return this;
  }

  #decodeLegacy(raw: Bytes): this {
    const decodedBuffer = new TextDecoder().decode(raw);
    const data: LeagacySavefileData = JSON.parse(decodedBuffer);

    data.elements ??= [];
    data.recipes ??= {};

    for (const element of data.elements) {
      if (element.text === "Nothing") continue;
      this.addElement(element.text, element.emoji, !!element.discovered);
    }

    for (const text in data.recipes) {
      const recipes = data.recipes[text];
      if (!Array.isArray(recipes) || recipes.length < 1 || text === "Nothing") {
        continue;
      }

      const result = this.addElement(text);
      const pairs = new Set<number>();

      for (const [itemA, itemB] of recipes) {
        if (itemA.text === "Nothing" || itemB.text === "Nothing") continue;

        const a = this.addElement(itemA.text, itemA.emoji);
        const b = this.addElement(itemB.text, itemB.emoji);

        const pairId = pair2int(a.id, b.id);
        if (pairs.has(pairId)) continue;
        pairs.add(pairId);

        this.#addRecipe(a, b, result);
      }
    }

    this.stats.elements = this.elements.length;
    return this;
  }

  async encodeOfficial(): Promise<Bytes> {
    const out: OfficialSavefileData = {
      name: this.name || "Save File",
      created: this.created || Date.now(),
      updated: Date.now(),
      version: "1.0",
      instances: [],
      items: this.elements.map((item) => ({
        id: item.id,
        text: item.text,
        emoji: item.emoji,
        discovery: item.discovery || undefined,
        recipes: item.recipes.length
          ? item.recipes.map((x) => [x.a.id, x.b.id])
          : undefined,
      })),
    };

    return await compressBuffer(
      new TextEncoder().encode(JSON.stringify(out)),
      "gzip",
    );
  }

  async encodeBinaryV1(appendHeader = true): Promise<Bytes> {
    const out: number[] = [];
    const emojis = getEmojisSorted(this.elements);

    encodeLEB128(this.elements.length, out);
    for (const element of this.elements) {
      encodeString(element.text, out);
      encodeLEB128(emojis.get(element.emoji)!, out);

      // @ts-expect-error we can multiply boolean by number
      out.push(element.discovery * 128 + Math.min(element.recipes.length, 127));
      if (element.recipes.length >= 127) {
        encodeLEB128(element.recipes.length - 127, out);
      }

      for (const recipe of element.recipes) {
        encodeLEB128(recipe.a.id, out);
        encodeLEB128(recipe.b.id - recipe.a.id, out);
      }
    }

    encodeLEB128(emojis.size, out);
    for (const emoji of emojis.keys()) {
      encodeString(emoji, out);
    }

    const compressed = await compressBuffer(new Uint8Array(out), "deflate-raw");
    return appendHeader ? addHeader(compressed, ICB1_HEADER) : compressed;
  }

  encodeLegacy(): string {
    const out: Required<LeagacySavefileData> = { elements: [], recipes: {} };

    for (const element of this.elements) {
      out.elements.push({
        text: element.text,
        emoji: element.emoji,
        discovered: element.discovery || undefined,
      });

      if (element.recipes.length > 0) {
        out.recipes[element.text] = element.recipes.map(({ a, b }) => [
          { text: a.text, emoji: a.emoji },
          { text: b.text, emoji: b.emoji },
        ]);
      }
    }

    return JSON.stringify(out);
  }

  async asBlob(type: SavefileType): Promise<Blob> {
    if (type === "legacy") {
      const data = this.encodeLegacy();
      return new Blob([data], { type: "application/json" });
    }

    let data: Bytes;

    if (type === "official") {
      data = await this.encodeOfficial();
    } else if (type === "binaryV1") {
      data = await this.encodeBinaryV1();
    } else {
      throw new Error("Not implemented");
    }

    return new Blob([data], { type: "application/octet-stream" });
  }

  async asFile(type: SavefileType, fileName: string): Promise<File> {
    const blob = await this.asBlob(type);
    return new File([blob], fileName, { type: blob.type });
  }
}

type ICSavefile = InstanceType<typeof Savefile>;

export { Savefile, getSavefileType, getSavefileTypeFromFile };
export type {
  ICSavefile,
  ICElement,
  ICElementRecipe,
  ICElementUse,
  SavefileType,
  SavefileStats,
  SavefileOptions,
};
