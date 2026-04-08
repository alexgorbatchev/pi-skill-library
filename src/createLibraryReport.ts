import { groupLibrarySummariesByScope } from "./groupLibrarySummariesByScope.js";
import { replaceHomeDirectoryWithTilde } from "./replaceHomeDirectoryWithTilde.js";
import type { ILibraryReportDetails, ILibrarySummary } from "./types.js";

export function createLibraryReport(details: ILibraryReportDetails): string {
  const lines = ["[@alexgorbatchev/pi-skill-library]"];
  if (details.librarySummaries.length === 0) {
    lines.push("  No library skills were discovered.");
    return lines.join("\n");
  }

  const librarySummariesByScope = groupLibrarySummariesByScope(details.librarySummaries);
  for (const [scope, librarySummaries] of librarySummariesByScope) {
    lines.push(`  ${scope}`);
    for (const librarySummary of librarySummaries) {
      appendLibrarySummary(lines, librarySummary);
    }
  }

  if (details.diagnostics.length > 0) {
    lines.push("  diagnostics");
    for (const diagnostic of details.diagnostics) {
      lines.push(`    ${replaceHomeDirectoryWithTilde(diagnostic)}`);
    }
  }

  return lines.join("\n");
}

function appendLibrarySummary(lines: string[], librarySummary: ILibrarySummary): void {
  lines.push(`    ${replaceHomeDirectoryWithTilde(librarySummary.libraryPath)}`);
  for (const skillName of librarySummary.skillNames) {
    lines.push(`      /library:${skillName}`);
  }
}
