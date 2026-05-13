// Test-only preamble. Loaded via `node --import ./tests/preamble.mjs` BEFORE
// any test file runs. Polyfills `globalThis.crypto` for the node --test runner,
// which doesn't expose it by default the way plain `node` does.

import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
    writable: false,
  });
}
