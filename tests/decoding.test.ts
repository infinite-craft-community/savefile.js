import { describe, it, expect } from "bun:test";

import { loadFixture } from "@savefile/fixtures";
import type { KnownFixture } from "@savefile/fixtures";
import {
  Savefile,
  getSavefileType,
  getSavefileTypeFromFile,
} from "savefile.js";

async function toFile(
  savefile: Savefile,
  filename: KnownFixture,
): Promise<File> {
  return await savefile.asFile(savefile.type, filename);
}

describe("Savefile.decode", () => {
  it("should correctly decode a 2024-10-18.json savefile", async () => {
    const raw = loadFixture("2024-10-18.json");
    expect(getSavefileType(raw)).toBe("legacy");
    const savefile = (await Savefile.decode(raw))!;
    expect(savefile).not.toBeNull();
    expect(savefile.type).toBe("legacy");
    expect(savefile.stats).toEqual({
      elements: 25382,
      discoveries: 6932,
      recipes: 25265,
    });
    const file = await toFile(savefile, "2024-10-18.json");
    expect(await getSavefileTypeFromFile(file)).toBe("legacy");
  });

  it("should correctly decode a 2025-04-04.ic savefile", async () => {
    const raw = loadFixture("2025-04-04.ic");
    expect(getSavefileType(raw)).toBe("official");
    const savefile = (await Savefile.decode(raw))!;
    expect(savefile).not.toBeNull();
    expect(savefile.type).toBe("official");
    expect(savefile.created).toBe(1743005840697);
    expect(savefile.stats).toEqual({
      elements: 88559,
      discoveries: 43585,
      recipes: 110163,
    });
    const file = await toFile(savefile, "2025-04-04.ic");
    expect(await getSavefileTypeFromFile(file)).toBe("official");
  });

  it("should correctly decode a catstone-2026-06-06.ic savefile", async () => {
    const raw = loadFixture("catstone-2026-06-06.ic");
    expect(getSavefileType(raw)).toBe("official");
    const savefile = (await Savefile.decode(raw))!;
    expect(savefile).not.toBeNull();
    expect(savefile.type).toBe("official");
    expect(savefile.created).toBe(1743077965336);
    expect(savefile.stats).toEqual({
      elements: 106619,
      discoveries: 37072,
      recipes: 256145,
    });
    const file = await toFile(savefile, "catstone-2026-06-06.ic");
    expect(await getSavefileTypeFromFile(file)).toBe("official");
  });
});
