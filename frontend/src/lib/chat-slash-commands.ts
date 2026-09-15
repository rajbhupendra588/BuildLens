export type ChatSlashCommand = {
  /** Command token without leading slash (e.g. briefingdoc) */
  name: string;
  label: string;
  description: string;
  icon: string;
};

export const CHAT_SLASH_COMMANDS: ChatSlashCommand[] = [
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

/** True while the user is typing a slash command at the start of the message (no args yet). */
export function isSlashCommandMenuOpen(value: string): boolean {
  return /^\/\w*$/.test(value.trim());
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
