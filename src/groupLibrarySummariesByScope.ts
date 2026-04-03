import type { ILibrarySummary } from "./types.js";

export function groupLibrarySummariesByScope(librarySummaries: ILibrarySummary[]): Map<string, ILibrarySummary[]> {
  const librarySummariesByScope = new Map<string, ILibrarySummary[]>();
  for (const librarySummary of librarySummaries) {
    const displayScope = toDisplayScope(librarySummary.scope);
    const existingSummaries = librarySummariesByScope.get(displayScope) ?? [];
    existingSummaries.push(librarySummary);
    librarySummariesByScope.set(displayScope, existingSummaries);
  }

  const orderedScopes = ["project", "user", "path"];
  const orderedLibrarySummariesByScope = new Map<string, ILibrarySummary[]>();
  for (const orderedScope of orderedScopes) {
    const scopedSummaries = librarySummariesByScope.get(orderedScope);
    if (scopedSummaries === undefined) {
      continue;
    }

    orderedLibrarySummariesByScope.set(
      orderedScope,
      [...scopedSummaries].sort((leftSummary, rightSummary) =>
        leftSummary.libraryPath.localeCompare(rightSummary.libraryPath),
      ),
    );
  }

  return orderedLibrarySummariesByScope;
}

function toDisplayScope(scope: ILibrarySummary["scope"]): string {
  if (scope === "temporary") {
    return "path";
  }

  return scope;
}
