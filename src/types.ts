import type { Skill } from "@mariozechner/pi-coding-agent";

export interface ILibraryCommand {
  skillName: string;
  args: string;
}

export interface ILibrarySummary {
  libraryPath: string;
  scope: "project" | "user" | "temporary";
  skillNames: string[];
}

export interface ILibraryReportDetails {
  diagnostics: string[];
  librarySummaries: ILibrarySummary[];
}

export interface ILibrarySkillDiscovery {
  skills: Skill[];
  skillByName: Map<string, Skill>;
  diagnostics: string[];
  libraryPaths: string[];
  librarySummaries: ILibrarySummary[];
}

export interface IMessageContentPart {
  type: string;
  text?: string;
}

export type MessageContent = string | IMessageContentPart[];
