export type ChatSlashCommand = {
  /** Command token without leading slash (e.g. briefingdoc) */
  name: string;
  label: string;
  description: string;
  icon: string;
};

export const CHAT_SLASH_COMMANDS: ChatSlashCommand[] = [
  {
    name: "report",
    label: "Document Report",
    description: "Full-document analysis: findings, risks, gaps, and a 5-page PDF",
    icon: "📄",
  },
  {
    name: "briefingdoc",
    label: "Briefing Document",
    description: "Executive summary, findings, and next steps from your sources",
    icon: "📑",
  },
  {
    name: "studyguide",
    label: "Study Guide",
    description: "Outline, glossary, practice quiz, and answer key",
    icon: "📚",
  },
  {
    name: "infographic",
    label: "Infographic",
    description: "Detailed visual briefing with story, metrics, and takeaways",
    icon: "🎨",
  },
  {
    name: "dashboard",
    label: "Visual Dashboard",
    description: "Professional charts: KPIs, pie, bars, table, and insights",
    icon: "📊",
  },
];

export function slashForCommand(name: string): string {
  return `/${name}`;
}

/** Parsed `/command` prefix at the start of the composer (before optional args). */
export function parseLeadingSlashCommand(value: string): {
  token: string;
  hasArgs: boolean;
} | null {
  const match = value.match(/^\/(\w*)([\s\S]*)$/);
  if (!match) return null;
  const token = match[1].toLowerCase();
  const after = match[2];
  const hasArgs = after.trim().length > 0;
  return { token, hasArgs };
}

export function isKnownSlashCommand(token: string): boolean {
  return CHAT_SLASH_COMMANDS.some((c) => c.name === token.toLowerCase());
}

/**
 * Show the picker only while the user is still typing an incomplete command.
 * Hide once the token is a full command (Enter should send, not pick from the list).
 */
export function isSlashCommandMenuOpen(value: string): boolean {
  const parsed = parseLeadingSlashCommand(value);
  if (!parsed || parsed.hasArgs) return false;
  if (!parsed.token) return true;
  if (isKnownSlashCommand(parsed.token)) return false;
  return true;
}

export function getSlashCommandFilter(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return "";
  const rest = trimmed.slice(1);
  if (rest.includes(" ")) return "";
  return rest.toLowerCase();
}

export function filterSlashCommands(filter: string): ChatSlashCommand[] {
  if (!filter) return CHAT_SLASH_COMMANDS;
  return CHAT_SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.name.startsWith(filter) ||
      cmd.label.toLowerCase().includes(filter),
  );
}

export function applySlashCommandSelection(cmd: ChatSlashCommand): string {
  return `${slashForCommand(cmd.name)} `;
}
