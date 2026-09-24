export type ChatToolCategory = "quick" | "visual" | "analysis";

export type ChatSlashCommand = {
  /** Command token without leading slash (e.g. briefingdoc) */
  name: string;
  label: string;
  description: string;
  icon: string;
  category: ChatToolCategory;
};

export const CHAT_TOOL_CATEGORIES: {
  id: ChatToolCategory;
  label: string;
}[] = [
  { id: "quick", label: "Quick actions" },
  { id: "visual", label: "Reports & visuals" },
  { id: "analysis", label: "Analysis" },
];

export const CHAT_SLASH_COMMANDS: ChatSlashCommand[] = [
  {
    name: "summarize",
    label: "Summarize",
    description: "Leadership-ready summary with key points and next steps",
    icon: "📋",
    category: "quick",
  },
  {
    name: "search",
    label: "Deep Search",
    description: "Evidence-ranked excerpts with citations and coverage notes",
    icon: "🔍",
    category: "quick",
  },
  {
    name: "faq",
    label: "Stakeholder FAQ",
    description: "Executive-ready Q&A with citations and open questions",
    icon: "❓",
    category: "quick",
  },
  {
    name: "briefingdoc",
    label: "Briefing Document",
    description: "Board-ready briefing: summary, findings, and actions",
    icon: "📑",
    category: "quick",
  },
  {
    name: "report",
    label: "Document Report",
    description: "Full-document analysis: findings, risks, gaps, and a 5-page PDF",
    icon: "📄",
    category: "visual",
  },
  {
    name: "infographic",
    label: "Infographic",
    description: "Detailed visual briefing with story, metrics, and takeaways",
    icon: "🎨",
    category: "visual",
  },
  {
    name: "dashboard",
    label: "Visual Dashboard",
    description: "Professional charts: KPIs, pie, bars, table, and insights",
    icon: "📊",
    category: "visual",
  },
  {
    name: "studyguide",
    label: "Study Guide",
    description: "Outline, glossary, practice quiz, and answer key",
    icon: "📚",
    category: "visual",
  },
  {
    name: "riskregister",
    label: "Risk Register",
    description: "Severity matrix, mitigations, and evidence-backed risks",
    icon: "🛡️",
    category: "analysis",
  },
  {
    name: "actionplan",
    label: "Action Plan",
    description: "Prioritized tasks, owners, dependencies, and decisions",
    icon: "✅",
    category: "analysis",
  },
  {
    name: "timeline",
    label: "Project Timeline",
    description: "Chronological milestones, dependencies, and schedule gaps",
    icon: "📅",
    category: "analysis",
  },
  {
    name: "conflicts",
    label: "Conflict Finder",
    description: "Cross-document discrepancies and RFI-style clarifications",
    icon: "⚖️",
    category: "analysis",
  },
];

const CATEGORY_ORDER: ChatToolCategory[] = ["quick", "visual", "analysis"];

export function sortCommandsByCategory(
  commands: ChatSlashCommand[],
): ChatSlashCommand[] {
  return [...commands].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );
}

export function commandsForCategory(
  category: ChatToolCategory,
): ChatSlashCommand[] {
  return CHAT_SLASH_COMMANDS.filter((c) => c.category === category);
}

export function slashForCommand(name: string): string {
  return `/${name}`;
}

export function insertSlashCommand(name: string): string {
  const cmd = CHAT_SLASH_COMMANDS.find((c) => c.name === name.toLowerCase());
  if (cmd) return applySlashCommandSelection(cmd);
  return `${slashForCommand(name)} `;
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
  if (!filter) return sortCommandsByCategory(CHAT_SLASH_COMMANDS);
  return sortCommandsByCategory(
    CHAT_SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.name.startsWith(filter) ||
        cmd.label.toLowerCase().includes(filter),
    ),
  );
}

export function applySlashCommandSelection(cmd: ChatSlashCommand): string {
  return `${slashForCommand(cmd.name)} `;
}
