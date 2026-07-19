import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "vite";

const templates = [
  { id: "rotating-flow", exportName: "rotatingFlowAdapter" },
  { id: "center-line", exportName: "centerLineAdapter" },
  { id: "chat-bubbles", exportName: "chatBubblesAdapter" },
];

// Must run before `tsc` compiles the CLI: registry.ts statically imports each adapter-dist ESM build.
// Also emit CJS so ejected local templates can be loaded synchronously via createRequire.
// `@yumoframe/cli/*` imports are bundled so published adapter-dist stays self-contained.
for (const { id, exportName } of templates) {
  const root = resolve("packages", "templates", id);
  const outDir = resolve(root, "adapter-dist");
  await build({
    configFile: false,
    logLevel: "warn",
    build: {
      emptyOutDir: true,
      lib: {
        entry: resolve(root, "src", "adapter", "adapter.ts"),
        formats: ["es", "cjs"],
        fileName: (format) => (format === "cjs" ? "index.cjs" : "index.js"),
      },
      outDir,
      rollupOptions: { external: (id) => id.startsWith("node:") },
    },
  });
  writeFileSync(
    resolve(outDir, "index.d.ts"),
    `import type {TemplateAdapter} from '@yumoframe/cli/templates/types';\nexport declare const ${exportName}: TemplateAdapter;\n`,
  );
}
