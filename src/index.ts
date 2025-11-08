type ICElement = {
  id: number;
  text: string;
  emoji: string;
  discovery: boolean;
  recipes: { a: ICElement; b: ICElement }[];
  uses: { other: ICElement; result: ICElement }[];
};

const DEFAULT_EMOJI = "⬜";
const ICB2_HEADER = new Uint8Array([0x49, 0x43, 0x42, 0x1f]);
const ICB1_HEADER = new Uint8Array([0x15, 0xf1, 0x51, 0x53]);

function getSaveFileType(raw: Uint8Array) {
  if (raw[0] == 0x1f && raw[1] == 0x8b) return "official";
  if (raw[0] == 0x7b) return "legacy";
  if (!ICB2_HEADER.find((x, i) => raw[i] != x)) return "binaryV2";
  if (!ICB1_HEADER.find((x, i) => raw[i] != x)) return "binaryV1";
  return null;
}

async function compressBuffer(
  buffer: Uint8Array<ArrayBuffer>,
  format: CompressionFormat,
  compress = true
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = compress
    ? new CompressionStream(format)
    : new DecompressionStream(format);
  const out = new Blob([buffer]).stream().pipeThrough(stream);

  return new Uint8Array(await new Response(out).arrayBuffer());
}

function addHeader(
  buffer: Uint8Array<ArrayBuffer>,
  header: Uint8Array<ArrayBuffer>
): Uint8Array<ArrayBuffer> {
  const merged = new Uint8Array(header.length + buffer.length);
  merged.set(header);
  merged.set(buffer, header.length);
  return merged;
}

/*****************************************/

function encodeLEB128(value: number, out: number[]): number {
  for (;;) {
    if (!(value & ~127)) return out.push(value);
    out.push((value & 127) | 128);
    value >>>= 7;
  }
}

function decodeLEB128(read: () => number): number {
  let value = 0;
  let shift = 0;
  let byte;
  for (;;) {
    byte = read();
    value |= (byte & 127) << shift;
    if (!(byte & 128)) return value;
    shift += 7;
  }
}

const encodeString = (str: string, out: number[]): void => {
  const enc = new TextEncoder().encode(str).slice(0, 255);
  out.push(enc.length, ...enc);
};

const decodeString = (read: () => number): string => {
  return new TextDecoder().decode(
    new Uint8Array(Array.from({ length: read() }, read))
  );
};

const pair2int = (a: number, b: number): bigint =>
  a > b ? (BigInt(a) << 24n) | BigInt(b) : (BigInt(b) << 24n) | BigInt(a);

const int2pair = (n: bigint): [number, number] => [
  Number(n >> 24n),
  Number(n & 16777215n),
];

const getEmojisSorted = (elements: ICElement[]): Map<string, number> => {
  const emojis = new Map<string, number>();
  for (const { emoji } of elements) {
    emojis.set(emoji, (emojis.get(emoji) || 0) + 1);
  }

  return new Map(
    [...emojis.entries()].sort((a, b) => b[1] - a[1]).map((x, i) => [x[0], i])
  );
};

/*****************************************/

type SavefileType = ReturnType<typeof getSaveFileType>;

type ICSaveFileOptions = {
  name?: string;
  created?: number;
  generateElementUses?: boolean;
  generateReverseRecipeMap?: boolean;
};

class Savefile {
  name: string;
  created: number;
  elements: ICElement[];
  elementNames: Map<string, ICElement>;
  reverseRecipeMap: Map<{ a: ICElement; b: ICElement }, ICElement>;
  type: SavefileType;
  options: {
    generateElementUses: boolean;
    generateReverseRecipeMap: boolean;
  };
  stats: {
    elements: number;
    discoveries: number;
    recipes: number;
  };

  constructor(options: ICSaveFileOptions = {}) {
    this.name = options.name ?? "Save File";
    this.created = options.created ?? Date.now();
    this.elements = [];
    this.elementNames = new Map();
    this.reverseRecipeMap = new Map();
    this.type = null;

    this.options = {
      generateElementUses: options.generateElementUses ?? true,
      generateReverseRecipeMap: options.generateReverseRecipeMap ?? true,
    };

    this.stats = {
      elements: 0,
      discoveries: 0,
      recipes: 0,
    };
  }

  static async decode(
    raw: Uint8Array<ArrayBuffer>,
    options?: ICSaveFileOptions
  ): Promise<Savefile | null> {
    const type = getSaveFileType(raw);

    if (type == "official") {
      return await new Savefile(options).decodeOfficial(raw);
    } else if (type == "binaryV2") {
      throw new Error("Not implemented");
    } else if (type == "binaryV1") {
      return await new Savefile(options).decodeBinaryV1(raw);
    } else if (type == "legacy") {
      return new Savefile(options).decodeLegacy(raw);
    }

    return null;
  }

  clear(): void {
    this.created = Date.now();
    this.elements.splice(0);
    this.elementNames.clear();
    this.reverseRecipeMap.clear();
    this.type = null;
    this.stats = {
      elements: 0,
      discoveries: 0,
      recipes: 0,
    };
  }

  addElement(
    text: string,
    emoji = DEFAULT_EMOJI,
    discovery = false
  ): ICElement {
    if (this.elementNames.has(text)) {
      return this.elementNames.get(text)!;
    }

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
    if (!a || !b || !result) return;
    for (const recipe of result.recipes) {
      if (recipe.a == a && recipe.b == b) return;
    }

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

  /**********/

  async decodeOfficial(raw: Uint8Array<ArrayBuffer>): Promise<this> {
    const buffer = await compressBuffer(raw, "gzip", false);
    const data: unknown = JSON.parse(new TextDecoder().decode(buffer));

    this.type = "official";
    this.name = data.name;
    this.created = data.created;

    data.items.sort((a, b) => a.id - b.id);
    for (const item of data.items) {
      if (item.text == "Nothing") continue;

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
      const result = this.elements[item.id];
      if (!item.recipes || item.text == "Nothing") continue;

      const pairs = new Set<bigint>();
      for (const [aId, bId] of item.recipes) {
        const a = this.elements[data.items[aId]?.id];
        const b = this.elements[data.items[bId]?.id];
        if (!a || !b) continue;

        const pairId = pair2int(a.id, b.id);
        if (pairs.has(pairId)) continue;
        pairs.add(pairId);

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
    }

    this.stats.elements = this.elements.length;
    return this;
  }

  async decodeBinaryV1(raw: Uint8Array<ArrayBuffer>): Promise<this> {
    const buffer = await compressBuffer(raw.slice(4), "deflate-raw", false);

    let pos = -1;
    const read = () => buffer[++pos]!;
    this.type = "binaryV1";

    const elementCount = decodeLEB128(read);
    const recipes = new Map<number, unknown>();

    for (let id = 0; id < elementCount; id++) {
      const text = decodeString(read);
      const emojiId = decodeLEB128(read);
      const flags = read();
      const isDiscovery = flags > 127;

      const element = {
        id,
        text,
        emoji: emojiId,
        discovery: isDiscovery,
        recipes: [],
        uses: [],
      };

      if (text != "Nothing") {
        this.elements.push(element);
        this.elementNames.set(text, element);
      }

      let recipeCount = flags - isDiscovery * 128;
      if (recipeCount >= 127) recipeCount += decodeLEB128(read);
      if (isDiscovery) this.stats.discoveries++;

      const list = [];
      recipes.set(id, list);

      for (let i = 0; i < recipeCount; i++) {
        let a = decodeLEB128(read),
          b = decodeLEB128(read) + a;
        list.push([a, b]);
      }
    }

    const emojis = new Map();
    const emojiCount = decodeLEB128(read);
    for (let i = 0; i < emojiCount; i++) emojis.set(i, decodeString(read));
    for (const element of this.elements)
      element.emoji = emojis.get(element.emoji) || DEFAULT_EMOJI;

    for (const [element, list] of recipes) {
      const result = this.elements[element];
      if (!result) continue;

      const pairs = new Set();
      for (const recipe of list) {
        const a = this.elements[recipe[0]],
          b = this.elements[recipe[1]];
        if (!a || !b) continue;

        const pairId = pair2int(a.id, b.id);
        if (pairs.has(pairId)) continue;
        pairs.add(pairId);

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
    }

    this.stats.elements = this.elements.length;
    return this;
  }

  decodeLegacy(raw: Uint8Array<ArrayBuffer>): this {
    const data: unknown = JSON.parse(new TextDecoder().decode(raw));
    this.type = "legacy";

    if (!data.elements) data.elements = [];
    if (!data.recipes) data.recipes = {};

    for (const element of data.elements) {
      if (element.text == "Nothing") continue;
      this.addElement(element.text, element.emoji, !!element.discovered);
    }

    for (const text in data.recipes) {
      const recipes = data.recipes[text];
      if (!Array.isArray(recipes) || recipes.length < 1 || text == "Nothing")
        continue;

      const result = this.addElement(text);
      const pairs = new Set();

      for (const [itemA, itemB] of recipes) {
        if (itemA.text == "Nothing" || itemB.text == "Nothing") continue;

        const a = this.addElement(itemA.text, itemA.emoji);
        const b = this.addElement(itemB.text, itemB.emoji);

        const pairId = pair2int(a.id, b.id);
        if (pairs.has(pairId)) continue;
        pairs.add(pairId);

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
    }

    this.stats.elements = this.elements.length;
    return this;
  }

  /**********/

  async encodeOfficial(): Promise<Uint8Array<ArrayBuffer>> {
    const out = {
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
      "gzip"
    );
  }

  async encodeBinaryV1(appendHeader = true): Promise<Uint8Array<ArrayBuffer>> {
    const out: number[] = [];
    const emojis = getEmojisSorted(this.elements);

    encodeLEB128(this.elements.length, out);
    for (const element of this.elements) {
      encodeString(element.text, out);
      encodeLEB128(emojis.get(element.emoji), out);

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
    const out: {
      elements: { text: string; emoji: string; discovered?: boolean }[];
      recipes: Record<
        string,
        [{ text: string; emoji: string }, { text: string; emoji: string }][]
      >;
    } = {
      elements: [],
      recipes: {},
    };

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
}

type ICSavefile = InstanceType<typeof Savefile>;

export const ICF = { Savefile, getSaveFileType } as const;
export default ICF;
export type { ICSavefile };
