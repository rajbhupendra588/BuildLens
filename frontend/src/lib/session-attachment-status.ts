/** True only while the file is not yet usable in this chat. */
export function isAttachmentStillLoading(indexStatus: string): boolean {
  return indexStatus === "indexing" || indexStatus === "queued";
}

export function isAttachmentChatReady(
  indexStatus: string,
  chatReady?: boolean,
): boolean {
  if (chatReady === true) return true;
  return indexStatus === "indexed" || indexStatus === "quick_ready";
}
