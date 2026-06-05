import { describe, it, expect } from "bun:test";

import { Savefile } from "savefile.js";
import { loadFixture } from "@savefile/fixtures";

describe("Savefile.decode", () => {
  it("should correctly decode a json savefile", async () => {
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

  it("should correctly decode a .ic savefile", async () => {
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
});
