import { Savefile } from "~/.";

import { describe, it, expect } from "bun:test";

import "./compression-stream.js";

describe("savefile", () => {
  it("should correctly create an empty savefile", () => {
    const savefile = new Savefile();
    expect(savefile.elements).toEqual([]);
    expect(savefile.stats).toEqual({ elements: 0, discoveries: 0, recipes: 0 });
    expect(savefile.encodeLegacy().length).toEqual(28);
  });

  it("should correctly add base elements", () => {
    const savefile = new Savefile();

    savefile.addElement("Water", "💧");
    savefile.addElement("Fire", "🔥");
    savefile.addElement("Wind", "🌬️");
    savefile.addElement("Earth", "🌍");

    expect(savefile.elements).toEqual([
      {
        id: 0,
        text: "Water",
        emoji: "💧",
        discovery: false,
        recipes: [],
        uses: [],
      },
      {
        id: 1,
        text: "Fire",
        emoji: "🔥",
        discovery: false,
        recipes: [],
        uses: [],
      },
      {
        id: 2,
        text: "Wind",
        emoji: "🌬️",
        discovery: false,
        recipes: [],
        uses: [],
      },
      {
        id: 3,
        text: "Earth",
        emoji: "🌍",
        discovery: false,
        recipes: [],
        uses: [],
      },
    ]);
    expect(savefile.stats).toEqual({ elements: 4, discoveries: 0, recipes: 0 });
    expect(savefile.encodeLegacy().length).toBe(146);
  });

  const exampleSavefile = (() => {
    const savefile = new Savefile();

    const elementWater = savefile.addElement("Water", "💧");
    const elementFire = savefile.addElement("Fire", "🔥");
    const elementWind = savefile.addElement("Wind", "🌬️");
    const elementEarth = savefile.addElement("Earth", "🌍");

    const elementSteam = savefile.addElement("Steam", "💨");
    const elementVolcano = savefile.addElement("Volcano", "🌋");
    const elementSmoke = savefile.addElement("Smoke", "💨");
    const elementLava = savefile.addElement("Lava", "🌋");
    const elementEngine = savefile.addElement("Wave", "🌊");

    savefile.addRecipe(elementFire, elementWater, elementSteam);
    savefile.addRecipe(elementFire, elementFire, elementVolcano);
    savefile.addRecipe(elementFire, elementWind, elementSmoke);
    savefile.addRecipe(elementEarth, elementFire, elementLava);
    savefile.addRecipe(elementWater, elementWind, elementEngine);
    return savefile;
  })();

  it("should correctly add elements and recipes", () => {
    const savefile = exampleSavefile;
    expect(savefile.stats).toEqual({ elements: 9, discoveries: 0, recipes: 5 });
    expect(savefile.encodeLegacy().length).toBe(650);
  });

  it("should correctly encode and decode using legacy format", async () => {
    const savefile = exampleSavefile;
    const legacyEncodedSavefile = savefile.encodeLegacy();
    expect(legacyEncodedSavefile.length).toBe(650);
    expect(legacyEncodedSavefile).toBe(
      `{"elements":[{"text":"Water","emoji":"💧"},{"text":"Fire","emoji":"🔥"},{"text":"Wind","emoji":"🌬️"},{"text":"Earth","emoji":"🌍"},{"text":"Steam","emoji":"💨"},{"text":"Volcano","emoji":"🌋"},{"text":"Smoke","emoji":"💨"},{"text":"Lava","emoji":"🌋"},{"text":"Wave","emoji":"🌊"}],"recipes":{"Steam":[[{"text":"Fire","emoji":"🔥"},{"text":"Water","emoji":"💧"}]],"Volcano":[[{"text":"Fire","emoji":"🔥"},{"text":"Fire","emoji":"🔥"}]],"Smoke":[[{"text":"Fire","emoji":"🔥"},{"text":"Wind","emoji":"🌬️"}]],"Lava":[[{"text":"Earth","emoji":"🌍"},{"text":"Fire","emoji":"🔥"}]],"Wave":[[{"text":"Water","emoji":"💧"},{"text":"Wind","emoji":"🌬️"}]]}}`
    );
    const decodedSavefile = await Savefile.decode(
      new TextEncoder().encode(legacyEncodedSavefile)
    );
    expect(decodedSavefile).not.toBeNull();
    expect(decodedSavefile?.type).toEqual("legacy");
    expect(decodedSavefile?.elements).toEqual(savefile.elements);
  });

  it("should correctly encode and decode using official format", async () => {
    const savefile = exampleSavefile;
    const officialyEncodedSavefile = await savefile.encodeOfficial();
    expect(officialyEncodedSavefile.length).toBe(
      officialyEncodedSavefile.byteLength
    );
    expect(officialyEncodedSavefile.length).toBeWithin(269, 272 + 1);
    const decodedSavefile = await Savefile.decode(officialyEncodedSavefile);
    expect(decodedSavefile).not.toBeNull();
    expect(decodedSavefile?.type).toEqual("official");
    expect(decodedSavefile?.name).toEqual(savefile.name);
    expect(decodedSavefile?.stats).toEqual(savefile.stats);
    expect(decodedSavefile?.elements).toEqual(savefile.elements);
  });

  it("should correctly encode and decode using binaryV1 format", async () => {
    const savefile = exampleSavefile;
    const binaryV1EncodedSavefile = await savefile.encodeBinaryV1();
    expect(binaryV1EncodedSavefile.length).toBe(
      binaryV1EncodedSavefile.byteLength
    );
    expect(binaryV1EncodedSavefile.length).toBe(128);
    expect(binaryV1EncodedSavefile.toBase64()).toBe(
      "FfFRU+NkDU8sSS1iYmBxyyxKZWZgCc/MS2FhYHVNLCrJYGVgDS5JTcxlYGT8////f372sPyc5MS8fEZGRgbW4Nz87FQGRkZGFp/EskRGRuZ/ICUs4YllqWyMDEzsLB/mT1rB8mF+TzeItZzlw/wpS9k/zO9Z835HP0i4F0R0AQA="
    );
    const decodedSavefile = await Savefile.decode(binaryV1EncodedSavefile);
    expect(decodedSavefile).not.toBeNull();
    expect(decodedSavefile?.type).toEqual("binaryV1");
    expect(decodedSavefile?.name).toEqual(savefile.name);
    expect(decodedSavefile?.stats).toEqual(savefile.stats);
    expect(decodedSavefile?.elements).toEqual(savefile.elements);
  });
});
