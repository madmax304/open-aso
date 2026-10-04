import { readFileSync } from "node:fs";
import { join } from "node:path";

// src/core and dist/core both sit two levels below the package root.
export const VERSION: string = (
  JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf8")) as { version: string }
).version;
