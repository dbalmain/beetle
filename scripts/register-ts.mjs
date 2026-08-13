// Node type-strips .ts but does not rewrite NodeNext `.js` specifiers.
// Map a missing `./foo.js` to `./foo.ts` so workspace packages run unbuilt.
import { register } from "node:module";

register(new URL("./resolve-ts.mjs", import.meta.url));
