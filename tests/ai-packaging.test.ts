import { it, expect } from "vitest";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
it("declares every external runtime package used by the isolated hosted service image", async () => {
  const built = await build({
      entryPoints: ["services/ai/server.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      write: false,
      metafile: true,
      outfile: "server.js",
    }),
    manifest = JSON.parse(await readFile("services/ai/package.json", "utf8")),
    missing = new Set<string>();
  for (const output of Object.values(built.metafile!.outputs))
    for (const dependency of output.imports) {
      if (!dependency.external || isBuiltin(dependency.path)) continue;
      const name = dependency.path.startsWith("@")
        ? dependency.path.split("/").slice(0, 2).join("/")
        : dependency.path.split("/")[0];
      if (!manifest.dependencies?.[name]) missing.add(name);
    }
  expect(
    [...missing],
    "Hosted image runtime dependencies must be in services/ai/package.json, not only the desktop package",
  ).toEqual([]);
});
