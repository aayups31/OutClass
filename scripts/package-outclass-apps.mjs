import { Arch, build, Platform } from "electron-builder";
import { readFile } from "node:fs/promises";

const { build: base } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const apps = [
  {
    edition: "learn",
    productName: "OutClass Learn",
    appId: "com.outclass.learn",
  },
  {
    edition: "educator",
    productName: "OutClass Educator",
    appId: "com.outclass.educator",
  },
];
for (const { edition, productName, appId } of apps) {
  const name = productName.replaceAll(" ", "-");
  await build({
    targets: Platform.WINDOWS.createTarget("nsis", Arch.x64),
    publish: "never",
    config: {
      ...base,
      appId,
      productName,
      extraMetadata: { outclassEdition: edition },
      directories: { ...base.directories, output: `dist/releases/${edition}` },
      win: { ...base.win, artifactName: `${name}-Setup-\${version}.\${ext}` },
    },
  });
}
