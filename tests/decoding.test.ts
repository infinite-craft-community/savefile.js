import { describe, it, expect } from "bun:test";

import { loadFixture } from "@savefile/fixtures";
import { Savefile } from "savefile.js";

describe("Savefile.decode", () => {
  it("should correctly decode a 2024-10-18.json savefile", async () => {
    const raw = loadFixture("2024-10-18.json");
    // @ts-expect-error should be not null
    const savefile: Savefile = await Savefile.decode(raw);
    expect(savefile).not.toBeNull();
    expect(savefile.type).toBe("legacy");
    expect(savefile.stats).toEqual({
      elements: 25382,
      discoveries: 6932,
      recipes: 25265,
    });
  });

  it("should correctly decode a 2025-04-04.ic savefile", async () => {
    const raw = loadFixture("2025-04-04.ic");
    // @ts-expect-error should be not null
    const savefile: Savefile = await Savefile.decode(raw);
    expect(savefile).not.toBeNull();
    expect(savefile.type).toBe("official");
    expect(savefile.created).toBe(1743005840697);
    expect(savefile.stats).toEqual({
      elements: 88559,
      discoveries: 43585,
      recipes: 110163,
    });
  });

  it("should correctly decode a catstone-2026-06-06.ic savefile", async () => {
    const raw = loadFixture("catstone-2026-06-06.ic");
    // @ts-expect-error should be not null
    const savefile: Savefile = await Savefile.decode(raw);
    expect(savefile).not.toBeNull();
    expect(savefile.type).toBe("official");
    expect(savefile.created).toBe(1743077965336);
    expect(savefile.stats).toEqual({
      elements: 106619,
      discoveries: 37072,
      recipes: 256145,
    });
  });
});
