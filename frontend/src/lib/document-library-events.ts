export const OPEN_DOCUMENT_LIBRARY_EVENT = "buildlens:open-document-library";
export const DOCUMENTS_CHANGED_EVENT = "buildlens:documents-changed";

export function openDocumentLibrary() {
  window.dispatchEvent(new CustomEvent(OPEN_DOCUMENT_LIBRARY_EVENT));
}

export function notifyDocumentsChanged() {
  window.dispatchEvent(new CustomEvent(DOCUMENTS_CHANGED_EVENT));
}
