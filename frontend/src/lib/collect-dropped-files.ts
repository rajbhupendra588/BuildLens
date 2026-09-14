/** Read all entries from a directory reader, looping because readEntries() returns ≤100 per call. */
async function readAllDirEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

/** Recursively collect File objects from a FileSystemEntry (file or directory). */
async function collectFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.name.startsWith(".")) return [];

  if (entry.isFile) {
    return new Promise((resolve) =>
      (entry as FileSystemFileEntry).file(
        (f) => resolve([f]),
        () => resolve([]),
      ),
    );
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await readAllDirEntries(reader);
    const nested = await Promise.all(entries.map(collectFilesFromEntry));
    return nested.flat();
  }

  return [];
}

/** Collect all files from a DataTransfer, handling directories recursively. */
export async function collectFilesFromDataTransfer(
  items: DataTransferItemList,
): Promise<File[]> {
  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry();
    if (entry) entries.push(entry);
  }
  const arrays = await Promise.all(entries.map(collectFilesFromEntry));
  return arrays.flat();
}

export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function isImageFileName(name: string): boolean {
  return ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(
    fileExtension(name),
  );
}

export function isPdfFileName(name: string): boolean {
  return fileExtension(name) === "pdf";
}
