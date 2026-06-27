import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

const jsdomWindow = (globalThis as { jsdom?: { window?: Window } }).jsdom?.window;

if (jsdomWindow?.localStorage) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: jsdomWindow.localStorage,
  });
}

afterEach(() => {
  window.localStorage.clear();
});
