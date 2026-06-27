import { describe, expect, it } from "vitest";
import { demoState } from "./seed";
import { loadPawDexState, PAWDEX_STORAGE_KEY, savePawDexState } from "./storage";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("pawdex storage", () => {
  it("loads seed data when localStorage is empty", () => {
    const result = loadPawDexState(createMemoryStorage());

    expect(result.source).toBe("seed");
    expect(result.warning).toBeNull();
    expect(result.state.places[0].id).toBe("place-office-centro");
  });

  it("loads stored state when localStorage has valid data", () => {
    const storedState = {
      ...demoState,
      places: [{ ...demoState.places[0], name: "Campus Butanta" }],
    };
    const storage = createMemoryStorage({
      [PAWDEX_STORAGE_KEY]: JSON.stringify(storedState),
    });

    const result = loadPawDexState(storage);

    expect(result.source).toBe("storage");
    expect(result.warning).toBeNull();
    expect(result.state.places[0].name).toBe("Campus Butanta");
  });

  it("falls back to seed data with a warning when stored JSON is invalid", () => {
    const storage = createMemoryStorage({ [PAWDEX_STORAGE_KEY]: "not-json" });

    const result = loadPawDexState(storage);

    expect(result.source).toBe("seed");
    expect(result.warning).toBe("Nao foi possivel carregar os dados salvos.");
    expect(result.state).toEqual(demoState);
  });

  it("returns a warning when saving fails", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };

    expect(savePawDexState(demoState, storage)).toBe(
      "Nao foi possivel salvar os dados localmente.",
    );
  });
});
