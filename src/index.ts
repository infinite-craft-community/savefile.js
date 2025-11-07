/**
 * @typedef {{
 *   id: number,
 *   text: string,
 *   emoji: string,
 *   discovery: boolean,
 *   recipes: { a: ICElement, b: ICElement }[],
 *   uses: { other: ICElement, result: ICElement }[]
 * }} ICElement
 */
/**
 * @typedef {{
 *   name?: string,
 *   created?: number,
 *   generateElementUses?: boolean,
 *   generateReverseRecipeMap?: boolean,
 * }} ICSaveFileOptions
 */
/** @typedef {ICF["SaveFile"]["prototype"]} ICSaveFile */

const ICF = (() => {
  const DEFAULT_EMOJI = "⬜";
  const ICB2_HEADER = new Uint8Array([0x49, 0x43, 0x42, 0x1f]);
  const ICB1_HEADER = new Uint8Array([0x15, 0xf1, 0x51, 0x53]);

  function getSaveFileType(raw) {
    if (raw[0] == 0x1f && raw[1] == 0x8b) return "official";
    if (raw[0] == 0x7b) return "legacy";
    if (!ICB2_HEADER.find((x, i) => raw[i] != x)) return "binaryV2";
    if (!ICB1_HEADER.find((x, i) => raw[i] != x)) return "binaryV1";
    return null;
  }

  async function compressBuffer(buffer, format, compress = true) {
    const stream = compress
      ? new CompressionStream(format)
      : new DecompressionStream(format);
    const out = new Blob([buffer]).stream().pipeThrough(stream);

    return new Uint8Array(await new Response(out).arrayBuffer());
  }

  function addHeader(buf, header) {
    const merged = new Uint8Array(header.length + buf.length);
    merged.set(header);
    merged.set(buf, header.length);
    return merged;
  }

  /*****************************************/

  function encodeLEB128(value, out) {
    for (;;) {
      if (!(value & ~127)) return out.push(value);
      out.push((value & 127) | 128);
      value >>>= 7;
    }
  }

  function decodeLEB128(read) {
    let value = 0,
      shift = 0,
      byte;
    for (;;) {
      byte = read();
      value |= (byte & 127) << shift;
      if (!(byte & 128)) return value;
      shift += 7;
    }
  }

  const encodeString = (str, out) => {
    const enc = new TextEncoder().encode(str).slice(0, 255);
    out.push(enc.length, ...enc);
  };

  const decodeString = (read) => {
    return new TextDecoder().decode(
      new Uint8Array(Array.from({ length: read() }, read))
    );
  };

  const pair2int = (a, b) =>
    a > b ? (BigInt(a) << 24n) | BigInt(b) : (BigInt(b) << 24n) | BigInt(a);

  const int2pair = (n) => [Number(n >> 24n), Number(n & 16777215n)];

  /** @param {ICElement[]} elements */
  const getEmojisSorted = (elements) => {
    const emojis = new Map();
    for (const { emoji } of elements) {
      emojis.set(emoji, (emojis.get(emoji) || 0) + 1);
    }

    return new Map(
      [...emojis.entries()].sort((a, b) => b[1] - a[1]).map((x, i) => [x[0], i])
    );
  };

  /*****************************************/

  class SaveFile {
    /** @param {ICSaveFileOptions?} options */
    constructor(options = {}) {
      this.name = options.name ?? "Save File";
      this.created = options.created ?? Date.now();
      /** @type {ICElement[]} */
      this.elements = [];
      /** @type {Map<string, ICElement>} */
      this.elementNames = new Map();
      /** @type {Map<{ a: ICElement, b: ICElement }, ICElement>} */
      this.reverseRecipeMap = new Map();
      /** @type {ReturnType<getSaveFileType>} */
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

    /**
     * @param {Uint8Array} raw
     * @param {ICSaveFileOptions?} options
     */
    static async decode(raw, options) {
      const type = getSaveFileType(raw);

      if (type == "official")
        return await new SaveFile(options).decodeOfficial(raw);
      else if (type == "binaryV2")
        return await new SaveFile(options).decodeBinaryV2(raw);
      else if (type == "binaryV1")
        return await new SaveFile(options).decodeBinaryV1(raw);
      else if (type == "legacy")
        return await new SaveFile(options).decodeLegacy(raw);

      return null;
    }

    clear() {
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

    addElement(text, emoji = DEFAULT_EMOJI, discovery = false) {
      if (this.elementNames.has(text)) {
        return this.elementNames.get(text);
      }

      /** @type {ICElement} */
      const element = {
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

    /**
     * @param {ICElement} a
     * @param {ICElement} b
     * @param {ICElement} result
     */
    addRecipe(a, b, result) {
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

    async decodeOfficial(raw) {
      const buffer = await compressBuffer(raw, "gzip", false);
      const data = JSON.parse(new TextDecoder().decode(buffer));

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

        const pairs = new Set();
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

    decodeBinaryV2(raw) {
      throw new Error("not implemented yet");
    }

    async decodeBinaryV1(raw) {
      const buffer = await compressBuffer(raw.slice(4), "deflate-raw", false);

      let pos = -1,
        read = () => buffer[++pos];
      this.type = "binaryV1";

      const elementCount = decodeLEB128(read);
      const recipes = new Map();

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

    decodeLegacy(raw) {
      const data = JSON.parse(new TextDecoder().decode(raw));
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

    async encodeOfficial() {
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

    /** @deprecated */
    async encodeBinaryV1(appendHeader = true) {
      const out = [];
      const emojis = getEmojisSorted(this.elements);

      encodeLEB128(this.elements.length, out);
      for (const element of this.elements) {
        encodeString(element.text, out);
        encodeLEB128(emojis.get(element.emoji), out);

        out.push(
          element.discovery * 128 + Math.min(element.recipes.length, 127)
        );
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

      const compressed = await compressBuffer(
        new Uint8Array(out),
        "deflate-raw"
      );
      return appendHeader ? addHeader(compressed, ICB1_HEADER) : compressed;
    }

    /** @deprecated */
    encodeLegacy() {
      const out = {
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

  return { SaveFile, getSaveFileType };
})();
