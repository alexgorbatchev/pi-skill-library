import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, InputEventResult, Theme } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createLibraryReport } from "./createLibraryReport.js";
import { discoverLibrarySkills } from "./discoverLibrarySkills.js";
import { expandLibrarySkill } from "./expandLibrarySkill.js";
import { parseLibraryCommand } from "./parseLibraryCommand.js";
import { renderLibraryReport } from "./renderLibraryReport.js";
import type { ILibraryReportDetails, ILibrarySkillDiscovery } from "./types.js";

const INFO_COMMAND_NAME = "pi-skill-library";
const LIBRARY_MESSAGE_TYPE = "pi-skill-library.message";
const extensionPackageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const handledInputEventResult: InputEventResult = { action: "handled" };

type LibraryMessageContent = string | (TextContent | ImageContent)[];
type LibraryMessageLevel = "info" | "error";

interface ILibraryMessageDetails {
  level: LibraryMessageLevel;
  reportDetails?: ILibraryReportDetails;
}

export default function piSkillLibraryExtension(pi: ExtensionAPI): void {
  let cachedLibrarySkillDiscovery: ILibrarySkillDiscovery | null = null;
  let cachedCwd = "";

  pi.registerMessageRenderer<ILibraryMessageDetails>(LIBRARY_MESSAGE_TYPE, (message, _options, theme) => {
    const details = message.details;
    const content = getMessageTextContent(message.content);
    const text =
      details?.reportDetails === undefined
        ? renderLibraryMessage(theme, content, details?.level ?? "info")
        : renderLibraryReport(theme, details.reportDetails);
    const box = new Box(0, 0);
    box.addChild(new Text(text, 0, 0));
    return box;
  });

  const sendLibraryMessage = (content: string, details: ILibraryMessageDetails): void => {
    pi.sendMessage<ILibraryMessageDetails>({
      customType: LIBRARY_MESSAGE_TYPE,
      content,
      display: true,
      details,
    });
  };

  const sendLibraryReport = (reportDetails: ILibraryReportDetails): void => {
    sendLibraryMessage(createLibraryReport(reportDetails), {
      level: "info",
      reportDetails,
    });
  };

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
              sendLibraryMessage(
                `Library skill is no longer available: ${librarySkill.name}. Run /reload if discovery changed.`,
                { level: "error" },
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

  pi.on("session_start", async (_event, ctx) => {
    invalidateLibrarySkillDiscovery();
    const librarySkillDiscovery = await refreshLibrarySkillDiscovery(ctx.cwd);

    if (ctx.hasUI) {
      sendLibraryReport(createLibraryReportDetails(librarySkillDiscovery));
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
        sendLibraryReport(createLibraryReportDetails(librarySkillDiscovery));
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
        sendLibraryMessage(`Unknown library skill: ${libraryCommand.skillName}. ${availableSkillSummary}`, {
          level: "error",
        });
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

function renderLibraryMessage(theme: Theme, content: string, level: LibraryMessageLevel): string {
  if (level === "error") {
    return theme.fg("error", content);
  }

  return content;
}

function getMessageTextContent(content: LibraryMessageContent): string {
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
