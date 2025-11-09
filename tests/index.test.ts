import { Savefile } from "~/.";

import { describe, it, expect } from "bun:test";

describe("savefile", () => {
  it("correctly creates an empty savefile", () => {
    const savefile = new Savefile();
    expect(savefile.elements).toEqual([]);
    expect(savefile.stats).toEqual({ elements: 0, discoveries: 0, recipes: 0 });
  });

  it("correctly adds base elements", () => {
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
  });
});
