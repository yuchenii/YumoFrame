/** Absolute root of the installed YumoFrame package. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
