import { beforeEach, describe, expect, it } from "vitest";
import { getTripIds, rememberTrip } from "./storage";

describe("trip ID storage", () => {
  beforeEach(() => {
    const values = {};
    globalThis.localStorage = {
      getItem: (key) => values[key] || null,
      setItem: (key, value) => { values[key] = value; },
      clear: () => Object.keys(values).forEach((key) => delete values[key]),
    };
  });

  it("returns an empty list when no trips are saved", () => {
    expect(getTripIds()).toEqual([]);
  });

  it("keeps the newest trip first and removes duplicates", () => {
    rememberTrip("first");
    rememberTrip("second");
    rememberTrip("first");
    expect(getTripIds()).toEqual(["first", "second"]);
  });
});
