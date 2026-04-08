import type { ExtensionAPI, ExtensionContext, InputEventResult } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverLibrarySkills } from "./discoverLibrarySkills.js";
import { expandLibrarySkill } from "./expandLibrarySkill.js";
import { parseLibraryCommand } from "./parseLibraryCommand.js";
import { renderLibraryReport } from "./renderLibraryReport.js";
import type { ILibraryReportDetails, ILibrarySkillDiscovery, MessageContent } from "./types.js";

const INFO_COMMAND_NAME = "pi-skill-library";
const STARTUP_REPORT_MESSAGE_TYPE = "pi-skill-library.startup-report";
const extensionPackageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const handledInputEventResult: InputEventResult = { action: "handled" };

export default function piSkillLibraryExtension(pi: ExtensionAPI): void {
  let cachedLibrarySkillDiscovery: ILibrarySkillDiscovery | null = null;
  let cachedCwd = "";

  const ensureLibrarySkillCommandsRegistered = (librarySkillDiscovery: ILibrarySkillDiscovery): void => {
    for (const librarySkill of librarySkillDiscovery.skills) {
      const commandName = createLibraryCommandName(librarySkill.name);
      pi.registerCommand(commandName, {
        description: librarySkill.description,
        handler: async (args, ctx) => {
          const refreshedLibrarySkillDiscovery = await refreshLibrarySkillDiscovery(ctx.cwd);
          const requestedSkill = refreshedLibrarySkillDiscovery.skillByName.get(librarySkill.name);
          if (requestedSkill === undefined) {
            if (ctx.hasUI) {
              ctx.ui.notify(
                `Library skill is no longer available: ${librarySkill.name}. Run /reload if discovery changed.`,
                "error",
              );
            }
            return;
          }

          const expandedText = await expandLibrarySkill(requestedSkill, args.trim());
          if (ctx.isIdle()) {
            pi.sendUserMessage(expandedText);
            return;
          }

          pi.sendUserMessage(expandedText, { deliverAs: "followUp" });
        },
      });
    }
  };

  const refreshLibrarySkillDiscovery = async (cwd: string): Promise<ILibrarySkillDiscovery> => {
    if (cachedLibrarySkillDiscovery !== null && cachedCwd === cwd) {
      return cachedLibrarySkillDiscovery;
    }

    cachedLibrarySkillDiscovery = await discoverLibrarySkills(cwd, extensionPackageRoot);
    cachedCwd = cwd;
    ensureLibrarySkillCommandsRegistered(cachedLibrarySkillDiscovery);
    return cachedLibrarySkillDiscovery;
  };

  const invalidateLibrarySkillDiscovery = (): void => {
    cachedLibrarySkillDiscovery = null;
    cachedCwd = "";
  };

  const onSessionChanged = async (_event: unknown, ctx: ExtensionContext): Promise<void> => {
    invalidateLibrarySkillDiscovery();
    await refreshLibrarySkillDiscovery(ctx.cwd);
  };

  pi.registerMessageRenderer(STARTUP_REPORT_MESSAGE_TYPE, (message, _options, theme) => {
    const reportDetails = readLibraryReportDetails(message.details);
    const reportText =
      reportDetails === null ? getMessageTextContent(message.content) : renderLibraryReport(theme, reportDetails);
    const box = new Box(0, 0);
    box.addChild(new Text(reportText, 0, 0));
    return box;
  });

  pi.on("session_start", async (_event, ctx) => {
    invalidateLibrarySkillDiscovery();
    const librarySkillDiscovery = await refreshLibrarySkillDiscovery(ctx.cwd);

    if (ctx.hasUI) {
      const reportText = renderLibraryReport(ctx.ui.theme, createLibraryReportDetails(librarySkillDiscovery));
      ctx.ui.notify(reportText, "info");
    }
  });
  pi.on("session_before_switch", onSessionChanged);
  pi.on("session_before_fork", onSessionChanged);
  pi.on("session_before_tree", onSessionChanged);

  pi.registerCommand(INFO_COMMAND_NAME, {
    description: "Print the discovered skills-library roots and skills",
    handler: async (_args, ctx) => {
      const librarySkillDiscovery = await refreshLibrarySkillDiscovery(ctx.cwd);
      if (ctx.hasUI) {
        const reportText = renderLibraryReport(ctx.ui.theme, createLibraryReportDetails(librarySkillDiscovery));
        ctx.ui.notify(reportText, "info");
      }
    },
  });

  pi.on("input", async (event, ctx): Promise<InputEventResult | undefined> => {
    const libraryCommand = parseLibraryCommand(event.text);
    if (libraryCommand === null) {
      return undefined;
    }

    const librarySkillDiscovery = await refreshLibrarySkillDiscovery(ctx.cwd);
    const skill = librarySkillDiscovery.skillByName.get(libraryCommand.skillName);
    if (skill === undefined) {
      const availableSkillNames = librarySkillDiscovery.skills.map((librarySkill) => librarySkill.name).sort();
      const availableSkillSummary =
        availableSkillNames.length === 0
          ? "No library skills are currently available."
          : `Available library skills: ${availableSkillNames.join(", ")}`;

      if (ctx.hasUI) {
        ctx.ui.notify(`Unknown library skill: ${libraryCommand.skillName}. ${availableSkillSummary}`, "error");
      }

      return handledInputEventResult;
    }

    const expandedText = await expandLibrarySkill(skill, libraryCommand.args);
    return createTransformInputEventResult(expandedText);
  });
}

function createLibraryReportDetails(librarySkillDiscovery: ILibrarySkillDiscovery): ILibraryReportDetails {
  return {
    diagnostics: librarySkillDiscovery.diagnostics,
    librarySummaries: librarySkillDiscovery.librarySummaries,
  };
}

function readLibraryReportDetails(details: unknown): ILibraryReportDetails | null {
  if (!isLibraryReportDetails(details)) {
    return null;
  }

  return details;
}

function isLibraryReportDetails(value: unknown): value is ILibraryReportDetails {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const diagnostics = Reflect.get(value, "diagnostics");
  const librarySummaries = Reflect.get(value, "librarySummaries");
  return (
    Array.isArray(diagnostics) &&
    diagnostics.every((diagnostic) => typeof diagnostic === "string") &&
    Array.isArray(librarySummaries) &&
    librarySummaries.every(isLibrarySummary)
  );
}

function isLibrarySummary(value: unknown): value is ILibraryReportDetails["librarySummaries"][number] {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const libraryPath = Reflect.get(value, "libraryPath");
  const scope = Reflect.get(value, "scope");
  const skillNames = Reflect.get(value, "skillNames");
  return (
    typeof libraryPath === "string" &&
    isLibrarySummaryScope(scope) &&
    Array.isArray(skillNames) &&
    skillNames.every((skillName) => typeof skillName === "string")
  );
}

function isLibrarySummaryScope(value: unknown): value is ILibraryReportDetails["librarySummaries"][number]["scope"] {
  return value === "project" || value === "user" || value === "temporary";
}

function getMessageTextContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((part) => ("text" in part && typeof part.text === "string" ? part.text : "[non-text content omitted]"))
    .join("\n");
}

function createLibraryCommandName(skillName: string): string {
  return `library:${skillName}`;
}

function createTransformInputEventResult(text: string): InputEventResult {
  return {
    action: "transform",
    text,
  };
}
