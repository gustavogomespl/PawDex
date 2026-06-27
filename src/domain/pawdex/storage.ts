import { demoState } from "./seed";
import type { PawDexState } from "./types";

export const PAWDEX_STORAGE_KEY = "pawdex:local-state:v1";

export type MinimalStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type LoadSource = "seed" | "storage";

export type LoadPawDexStateResult = {
  state: PawDexState;
  source: LoadSource;
  warning: string | null;
};

export function loadPawDexState(
  storage: MinimalStorage | undefined = getBrowserStorage(),
): LoadPawDexStateResult {
  if (!storage) {
    return { state: demoState, source: "seed", warning: null };
  }

  try {
    const storedValue = storage.getItem(PAWDEX_STORAGE_KEY);

    if (!storedValue) {
      return { state: demoState, source: "seed", warning: null };
    }

    return {
      state: JSON.parse(storedValue) as PawDexState,
      source: "storage",
      warning: null,
    };
  } catch {
    return {
      state: demoState,
      source: "seed",
      warning: "Nao foi possivel carregar os dados salvos.",
    };
  }
}

export function savePawDexState(
  state: PawDexState,
  storage: MinimalStorage | undefined = getBrowserStorage(),
): string | null {
  if (!storage) {
    return null;
  }

  try {
    storage.setItem(PAWDEX_STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch {
    return "Nao foi possivel salvar os dados localmente.";
  }
}

function getBrowserStorage(): MinimalStorage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}
