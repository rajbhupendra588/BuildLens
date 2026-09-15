import type { ChatSession } from "@/types/chat";

export type ConversationGroupKey =
  | "pinned"
  | "today"
  | "yesterday"
  | "previous7"
  | "older";

export interface ConversationGroup {
  key: ConversationGroupKey;
  label: string;
  sessions: ChatSession[];
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function groupKeyForDate(date: Date): ConversationGroupKey {
  const now = new Date();
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 7) return "previous7";
  return "older";
}

const GROUP_LABELS: Record<ConversationGroupKey, string> = {
  pinned: "Pinned",
  today: "Today",
  yesterday: "Yesterday",
  previous7: "Previous 7 Days",
  older: "Older",
};

export function groupConversations(sessions: ChatSession[]): ConversationGroup[] {
  const sorted = [...sessions].sort((a, b) => {
    const ta = new Date(a.updated_at ?? a.created_at).getTime();
    const tb = new Date(b.updated_at ?? b.created_at).getTime();
    return tb - ta;
  });

  const buckets = new Map<ConversationGroupKey, ChatSession[]>();

  for (const session of sorted) {
    if (session.is_pinned) {
      const list = buckets.get("pinned") ?? [];
      list.push(session);
      buckets.set("pinned", list);
      continue;
    }
    const date = new Date(session.updated_at ?? session.created_at);
    const key = Number.isNaN(date.getTime())
      ? "older"
      : groupKeyForDate(date);
    const list = buckets.get(key) ?? [];
    list.push(session);
    buckets.set(key, list);
  }

  const order: ConversationGroupKey[] = [
    "pinned",
    "today",
    "yesterday",
    "previous7",
    "older",
  ];

  return order
    .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
    .map((key) => ({
      key,
      label: GROUP_LABELS[key],
      sessions: buckets.get(key) ?? [],
    }));
}
