import React, { useState } from "react";
import { academyResource } from "../academy-resource-contract";
type API = <T>(route: string, body?: unknown) => Promise<T>;
type Directory = {
  getDirectoryHandle: (
    name: string,
    options: { create: boolean },
  ) => Promise<Directory>;
  getFileHandle: (
    name: string,
    options: { create: boolean },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};
type Manifest = {
  format: "outclass-portable-course";
  resources: { resource: ReturnType<typeof academyResource.parse> }[];
};
export function CoursePortableFolder({
  api,
  courseId,
  onRestored,
}: {
  api: API;
  courseId?: string;
  onRestored: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  async function exportFolder(privateContent: boolean) {
    const picker = (
      window as unknown as { showDirectoryPicker?: () => Promise<Directory> }
    ).showDirectoryPicker;
    if (!picker) {
      setStatus(
        "This browser cannot write a portable folder. Use the JSON backup for packages under 100 MB.",
      );
      return;
    }
    try {
      const selected = await picker(),
        folderName = `OutClass-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`,
        directory = await selected.getDirectoryHandle(folderName, {
          create: true,
        });
      setBusy(true);
      setStatus("Preparing the course manifest…");
      const manifest = await api<Manifest>(
          `academy-archive/${courseId}?bundle=1${privateContent ? "&private=1" : ""}`,
        ),
        assets = await directory.getDirectoryHandle("assets", { create: true });
      for (const [index, item] of manifest.resources.entries()) {
        setStatus(`Saving media ${index + 1} of ${manifest.resources.length}…`);
        const blob = await api<Blob>(`academy-resources/${item.resource.id}`),
          file = await assets.getFileHandle(`${item.resource.id}.bin`, {
            create: true,
          }),
          stream = await file.createWritable();
        try {
          await stream.write(blob);
        } finally {
          await stream.close();
        }
      }
      const manifestFile = await directory.getFileHandle(
          "outclass-course.json",
          { create: true },
        ),
        stream = await manifestFile.createWritable();
      try {
        await stream.write(JSON.stringify(manifest));
      } finally {
        await stream.close();
      }
      setStatus(
        `Portable folder saved${privateContent ? " with private instructor keys and solutions" : ""}. Keep the manifest and assets together.`,
      );
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restore(files: File[]) {
    setBusy(true);
    try {
      const manifests = files.filter(
        (file) => file.name === "outclass-course.json",
      );
      if (manifests.length !== 1)
        throw Error("Choose one complete portable course folder.");
      const root = manifests[0].webkitRelativePath.replace(
          /outclass-course\.json$/,
          "",
        ),
        manifest = JSON.parse(await manifests[0].text()) as Manifest;
      if (
        manifest.format !== "outclass-portable-course" ||
        !Array.isArray(manifest.resources) ||
        manifest.resources.length > 50000
      )
        throw Error("This folder has an unsupported course manifest.");
      for (const [index, item] of manifest.resources.entries()) {
        const resource = academyResource.parse(item.resource),
          file = files.find(
            (file) =>
              file.webkitRelativePath === `${root}assets/${resource.id}.bin`,
          );
        if (!file || file.size !== resource.bytes)
          throw Error(`Missing or changed media file: ${resource.name}`);
        setStatus(
          `Restoring verified media ${index + 1} of ${manifest.resources.length}…`,
        );
        await api(
          `academy-archive/resource?metadata=${encodeURIComponent(JSON.stringify(resource))}`,
          file,
        );
      }
      await api("academy-archive/bundle", manifest);
      await onRestored();
      setStatus(
        "Restored as a separate instructor draft with its media and saved history. Review permissions before release.",
      );
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Portable folder · larger courses and media</summary>
      <p>
        A folder keeps media outside the manifest and restores files with
        integrity checks. A retry preserves files already verified.
      </p>
      {courseId && (
        <>
          <button
            className="button small"
            disabled={busy}
            onClick={() => void exportFolder(false)}
          >
            Save course and media folder
          </button>
          <button
            className="button small"
            disabled={busy}
            onClick={() => void exportFolder(true)}
          >
            Save private instructor folder
          </button>
        </>
      )}
      <label>
        Restore portable folder
        <input
          type="file"
          multiple
          {...{ webkitdirectory: "", directory: "" }}
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            if (files.length) void restore(files);
          }}
        />
      </label>
      <p role="status">{status}</p>
    </details>
  );
}
