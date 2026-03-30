import type { Theme } from '@mariozechner/pi-coding-agent';
import { groupLibrarySummariesByScope } from './groupLibrarySummariesByScope.js';
import { replaceHomeDirectoryWithTilde } from './replaceHomeDirectoryWithTilde.js';
import type { ILibraryReportDetails } from './types.js';

export function renderLibraryReport(theme: Theme, details: ILibraryReportDetails): string {
  const lines: string[] = [theme.fg('mdHeading', '[Skills Library]')];
  if (details.librarySummaries.length === 0) {
    lines.push(theme.fg('dim', '  No library skills were discovered.'));
    return lines.join('\n');
  }

  const groupedSummaries = groupLibrarySummariesByScope(details.librarySummaries);
  for (const [scope, librarySummaries] of groupedSummaries) {
    lines.push(`  ${theme.fg('accent', scope)}`);
    for (const librarySummary of librarySummaries) {
      lines.push(theme.fg('dim', `    ${replaceHomeDirectoryWithTilde(librarySummary.libraryPath)}`));
      for (const skillName of librarySummary.skillNames) {
        lines.push(theme.fg('dim', `      /library:${skillName}`));
      }
    }
  }

  if (details.diagnostics.length > 0) {
    lines.push(`  ${theme.fg('warning', 'diagnostics')}`);
    for (const diagnostic of details.diagnostics) {
      lines.push(theme.fg('warning', `    ${replaceHomeDirectoryWithTilde(diagnostic)}`));
    }
  }

  return lines.join('\n');
}
