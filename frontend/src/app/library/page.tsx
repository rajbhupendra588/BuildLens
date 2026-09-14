import { SidebarInset } from "@/components/ui/sidebar";
import { DocumentLibrary } from "@/components/library/document-library";

export default function LibraryPage() {
  return (
    <SidebarInset className="flex h-svh flex-col overflow-hidden bg-background">
      <DocumentLibrary />
    </SidebarInset>
  );
}
