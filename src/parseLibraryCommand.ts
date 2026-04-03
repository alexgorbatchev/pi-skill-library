import type { ILibraryCommand } from "./types.js";

const LIBRARY_COMMAND_PREFIX = "/library:";

export function parseLibraryCommand(text: string): ILibraryCommand | null {
  if (!text.startsWith(LIBRARY_COMMAND_PREFIX)) {
    return null;
  }

  const commandBody = text.slice(LIBRARY_COMMAND_PREFIX.length);
  const spaceIndex = commandBody.indexOf(" ");
  const skillName = spaceIndex === -1 ? commandBody.trim() : commandBody.slice(0, spaceIndex).trim();
  if (skillName.length === 0) {
    return null;
  }

  const args = spaceIndex === -1 ? "" : commandBody.slice(spaceIndex + 1).trim();
  return {
    skillName,
    args,
  };
}
