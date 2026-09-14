import {
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  Image,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fileExtension } from "@/lib/collect-dropped-files";

const CODE_EXTS = new Set([
  "py",
  "pyw",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "java",
  "kt",
  "kts",
  "go",
  "rs",
  "c",
  "h",
  "cpp",
  "cc",
  "cxx",
  "hpp",
  "hxx",
  "rb",
  "php",
  "swift",
  "dart",
  "sh",
  "bash",
  "zsh",
  "sql",
  "r",
  "scala",
  "lua",
  "tf",
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "env",
]);

const SPREADSHEET_EXTS = new Set(["csv", "xlsx", "xls"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const DOC_EXTS = new Set(["doc", "docx", "pptx", "txt", "md"]);

export function FileIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const ext = fileExtension(name);

  if (IMAGE_EXTS.has(ext))
    return <Image className={cn("size-4 text-emerald-500", className)} />;
  if (SPREADSHEET_EXTS.has(ext))
    return (
      <FileSpreadsheet className={cn("size-4 text-green-600", className)} />
    );
  if (CODE_EXTS.has(ext))
    return <FileCode className={cn("size-4 text-violet-500", className)} />;
  if (ext === "pdf")
    return <FileText className={cn("size-4 text-red-500", className)} />;
  if (DOC_EXTS.has(ext))
    return <FileText className={cn("size-4 text-blue-500", className)} />;

  return <File className={cn("size-4 text-muted-foreground", className)} />;
}
