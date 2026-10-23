import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const headers = { "User-Agent": "OutClass-release-verification" };
const response = await fetch(
  `https://api.github.com/repos/aayups31/OutClass/releases/tags/v${version}`,
  {
    headers,
    signal: AbortSignal.timeout(20000),
  },
);
if (!response.ok) throw Error(`Release metadata returned ${response.status}.`);
const release = await response.json();
if (!release.prerelease || release.draft)
  throw Error("Expected a published preview release.");
for (const name of [
  `OutClass-Setup-${version}.exe`,
  `OutClass-Chrome-${version}.zip`,
  `OutClass-Editor-${version}.vsix`,
]) {
  const asset = release.assets.find((a) => a.name === name);
  if (!asset) throw Error(`Missing asset: ${name}`);
  const bytes = await readFile(`dist/releases/${name}`);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (asset.size !== bytes.length || asset.digest !== `sha256:${hash}`)
    throw Error(`Asset digest or size mismatch: ${name}`);
  const download = await fetch(asset.browser_download_url, {
    method: "HEAD",
    signal: AbortSignal.timeout(20000),
  });
  if (!download.ok)
    throw Error(`Download returned ${download.status}: ${name}`);
  console.log(
    JSON.stringify({
      name,
      bytes: asset.size,
      sha256: hash,
      status: download.status,
    }),
  );
}
const sums = release.assets.find((a) => a.name === "SHA256SUMS.txt");
if (!sums) throw Error("Missing public checksum file.");
const publicSums = await fetch(sums.browser_download_url, {
  signal: AbortSignal.timeout(20000),
});
if (
  !publicSums.ok ||
  (await publicSums.text()) !==
    (await readFile("dist/releases/SHA256SUMS.txt", "utf8"))
)
  throw Error("Public checksum file mismatch.");
console.log(
  JSON.stringify({
    release: release.html_url,
    preview: true,
    checksums: "verified",
  }),
);
