import {
  DefaultResourceLoader,
  getAgentDir,
  loadSkills,
  type ResourceDiagnostic,
  SettingsManager,
  type Skill,
} from '@mariozechner/pi-coding-agent';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ILibrarySkillDiscovery, ILibrarySummary } from './types.js';

const SETTINGS_KEY = '@alexgorbatchev/pi-skills-library';
const LIBRARY_DIRECTORY_NAME = 'skills-library';

interface IConfiguredLibrarySettings {
  paths: string[];
}

type LibraryPathScope = 'project' | 'user' | 'temporary';

interface ILibraryPathCandidate {
  path: string;
  scope: LibraryPathScope;
}

export async function discoverLibrarySkills(
  cwd: string,
  extensionPackageRoot: string,
): Promise<ILibrarySkillDiscovery> {
  const settingsManager = SettingsManager.create(cwd);
  const projectSettings = settingsManager.getProjectSettings();
  const userSettings = settingsManager.getGlobalSettings();
  const projectSettingsBaseDir = path.join(cwd, '.pi');
  const userSettingsBaseDir = getAgentDir();

  const projectConfiguredPaths = getConfiguredLibraryPaths(projectSettings, projectSettingsBaseDir, 'project');
  const userConfiguredPaths = getConfiguredLibraryPaths(userSettings, userSettingsBaseDir, 'user');
  const projectConfiguredSkillSiblingPaths = getConfiguredSkillSiblingLibraryPaths(
    projectSettings,
    projectSettingsBaseDir,
    'project',
  );
  const userConfiguredSkillSiblingPaths = getConfiguredSkillSiblingLibraryPaths(
    userSettings,
    userSettingsBaseDir,
    'user',
  );

  const conventionalPaths = getConventionalLibraryPaths(cwd);
  const derivedPaths = await getDerivedLibraryPaths(cwd, extensionPackageRoot);

  const orderedPaths = dedupeLibraryPaths([
    ...filterPathsByScope(projectConfiguredPaths, 'project'),
    ...filterPathsByScope(projectConfiguredSkillSiblingPaths, 'project'),
    ...filterPathsByScope(conventionalPaths, 'project'),
    ...filterPathsByScope(derivedPaths, 'project'),
    ...filterPathsByScope(projectConfiguredPaths, 'temporary'),
    ...filterPathsByScope(conventionalPaths, 'temporary'),
    ...filterPathsByScope(derivedPaths, 'temporary'),
    ...filterPathsByScope(userConfiguredPaths, 'user'),
    ...filterPathsByScope(userConfiguredSkillSiblingPaths, 'user'),
    ...filterPathsByScope(conventionalPaths, 'user'),
    ...filterPathsByScope(derivedPaths, 'user'),
  ]);

  const existingPaths = orderedPaths.filter((candidate) => existsSync(candidate.path));
  const agentDir = getAgentDir();
  const libraryResult = loadSkills({
    cwd,
    agentDir,
    includeDefaults: false,
    skillPaths: existingPaths.map((candidate) => candidate.path),
  });

  const libraryPaths = existingPaths.map((candidate) => candidate.path);
  return {
    skills: libraryResult.skills,
    skillByName: createSkillMap(libraryResult.skills),
    diagnostics: libraryResult.diagnostics.map(formatDiagnostic),
    libraryPaths,
    librarySummaries: createLibrarySummaries(existingPaths, libraryResult.skills),
  };
}

function getConfiguredLibraryPaths(
  settings: object,
  baseDir: string,
  scope: LibraryPathScope,
): ILibraryPathCandidate[] {
  const configuredSettings = parseConfiguredLibrarySettings(Reflect.get(settings, SETTINGS_KEY));
  return configuredSettings.paths.map((configuredPath) => ({
    path: resolveSettingsPath(configuredPath, baseDir),
    scope,
  }));
}

function getConfiguredSkillSiblingLibraryPaths(
  settings: object,
  baseDir: string,
  scope: LibraryPathScope,
): ILibraryPathCandidate[] {
  return readStringArray(Reflect.get(settings, 'skills'))
    .map((configuredSkillPath) => resolveSettingsPath(configuredSkillPath, baseDir))
    .map((resolvedSkillPath) => toLibraryPathFromSkillPath(resolvedSkillPath))
    .filter((libraryPath): libraryPath is string => libraryPath !== null)
    .map((libraryPath) => ({ path: libraryPath, scope }));
}

function parseConfiguredLibrarySettings(value: unknown): IConfiguredLibrarySettings {
  if (!isRecord(value)) {
    return { paths: [] };
  }

  return {
    paths: readStringArray(value.paths),
  };
}

function getConventionalLibraryPaths(cwd: string): ILibraryPathCandidate[] {
  const agentDir = getAgentDir();
  const ancestorDirectories = getAncestorDirectories(cwd);

  const projectPaths = [
    path.join(cwd, '.pi', LIBRARY_DIRECTORY_NAME),
    ...ancestorDirectories.map((directoryPath) => path.join(directoryPath, '.agents', LIBRARY_DIRECTORY_NAME)),
  ];
  const userPaths = [
    path.join(agentDir, LIBRARY_DIRECTORY_NAME),
    path.join(homedir(), '.agents', LIBRARY_DIRECTORY_NAME),
  ];

  return [
    ...projectPaths.map(
      (libraryPath): ILibraryPathCandidate => ({ path: libraryPath, scope: 'project' }),
    ),
    ...userPaths.map(
      (libraryPath): ILibraryPathCandidate => ({ path: libraryPath, scope: 'user' }),
    ),
  ];
}

async function getDerivedLibraryPaths(cwd: string, extensionPackageRoot: string): Promise<ILibraryPathCandidate[]> {
  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await resourceLoader.reload();

  const skillPaths: ILibraryPathCandidate[] = [];
  const extensionScope = classifyExtensionScope(extensionPackageRoot, cwd);
  skillPaths.push({
    path: path.join(extensionPackageRoot, LIBRARY_DIRECTORY_NAME),
    scope: extensionScope,
  });

  for (const skill of resourceLoader.getSkills().skills) {
    const derivedPath = getSiblingLibraryPath(skill);
    if (derivedPath !== null) {
      skillPaths.push({
        path: derivedPath,
        scope: skill.sourceInfo.scope,
      });
    }

    const packageLibraryPath = getPackageLibraryPath(skill);
    if (packageLibraryPath !== null) {
      skillPaths.push({
        path: packageLibraryPath,
        scope: skill.sourceInfo.scope,
      });
    }
  }

  return skillPaths;
}

function classifyExtensionScope(extensionPackageRoot: string, cwd: string): LibraryPathScope {
  const normalizedPackageRoot = path.resolve(extensionPackageRoot);
  const normalizedProjectRoot = path.resolve(cwd);
  const projectPiRoot = path.resolve(cwd, '.pi');

  if (
    isPathInside(normalizedPackageRoot, normalizedProjectRoot) || isPathInside(normalizedPackageRoot, projectPiRoot)
  ) {
    return 'project';
  }

  return 'user';
}

function getSiblingLibraryPath(skill: Skill): string | null {
  return toLibraryPathFromSkillPath(skill.filePath);
}

function getPackageLibraryPath(skill: Skill): string | null {
  if (skill.sourceInfo.origin !== 'package' || skill.sourceInfo.baseDir === undefined) {
    return null;
  }

  return path.join(skill.sourceInfo.baseDir, LIBRARY_DIRECTORY_NAME);
}

function filterPathsByScope(paths: ILibraryPathCandidate[], scope: LibraryPathScope): ILibraryPathCandidate[] {
  return paths.filter((candidate) => candidate.scope === scope);
}

function dedupeLibraryPaths(paths: ILibraryPathCandidate[]): ILibraryPathCandidate[] {
  const dedupedPaths: ILibraryPathCandidate[] = [];
  const seenPaths = new Set<string>();

  for (const candidate of paths) {
    const normalizedPath = path.normalize(candidate.path);
    if (seenPaths.has(normalizedPath)) {
      continue;
    }

    seenPaths.add(normalizedPath);
    dedupedPaths.push({
      path: normalizedPath,
      scope: candidate.scope,
    });
  }

  return dedupedPaths;
}

function getAncestorDirectories(cwd: string): string[] {
  const resolvedCwd = path.resolve(cwd);
  const ancestorDirectories: string[] = [];

  let currentDirectory = resolvedCwd;
  for (;;) {
    ancestorDirectories.push(currentDirectory);

    if (existsSync(path.join(currentDirectory, '.git'))) {
      return ancestorDirectories;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return ancestorDirectories;
    }

    currentDirectory = parentDirectory;
  }
}

function createLibrarySummaries(libraryPaths: ILibraryPathCandidate[], skills: Skill[]): ILibrarySummary[] {
  const libraryPathValues = libraryPaths.map((libraryPath) => libraryPath.path);
  return libraryPaths
    .map((libraryPath) => ({
      libraryPath: libraryPath.path,
      scope: libraryPath.scope,
      skillNames: findSkillNamesForLibraryPath(libraryPath.path, libraryPathValues, skills),
    }))
    .filter((librarySummary) => librarySummary.skillNames.length > 0);
}

function findSkillNamesForLibraryPath(libraryPath: string, libraryPaths: string[], skills: Skill[]): string[] {
  return skills
    .filter((skill) => findOwningLibraryPath(skill, libraryPaths) === libraryPath)
    .map((skill) => skill.name)
    .sort();
}

function findOwningLibraryPath(skill: Skill, libraryPaths: string[]): string | null {
  const skillDirectoryPath = path.normalize(skill.baseDir);
  const matchingLibraryPaths = libraryPaths
    .filter((libraryPath) => isPathInside(skillDirectoryPath, path.normalize(libraryPath)))
    .sort((leftPath, rightPath) => rightPath.length - leftPath.length);

  const owningLibraryPath = matchingLibraryPaths[0];
  return owningLibraryPath ?? null;
}

function createSkillMap(skills: Skill[]): Map<string, Skill> {
  const skillByName = new Map<string, Skill>();
  for (const skill of skills) {
    if (!skillByName.has(skill.name)) {
      skillByName.set(skill.name, skill);
    }
  }

  return skillByName;
}

function formatDiagnostic(diagnostic: ResourceDiagnostic): string {
  const location = diagnostic.path ? ` (${diagnostic.path})` : '';
  return `${diagnostic.type}: ${diagnostic.message}${location}`;
}

function resolveSettingsPath(configuredPath: string, baseDir: string): string {
  const trimmedPath = configuredPath.trim();
  const expandedPath = expandHomeDirectory(trimmedPath);
  if (path.isAbsolute(expandedPath)) {
    return path.normalize(expandedPath);
  }

  return path.resolve(baseDir, expandedPath);
}

function expandHomeDirectory(configuredPath: string): string {
  if (configuredPath === '~') {
    return homedir();
  }

  if (configuredPath.startsWith('~/')) {
    return path.join(homedir(), configuredPath.slice(2));
  }

  return configuredPath;
}

function toLibraryPathFromSkillPath(resolvedSkillPath: string): string | null {
  const normalizedSkillPath = path.normalize(resolvedSkillPath);
  const pathSegments = normalizedSkillPath.split(path.sep).filter((segment) => segment.length > 0);
  const skillsSegmentIndex = pathSegments.lastIndexOf('skills');
  if (skillsSegmentIndex === -1) {
    return null;
  }

  const leadingSegments = pathSegments.slice(0, skillsSegmentIndex);
  if (normalizedSkillPath.startsWith(path.sep)) {
    return path.join(path.sep, ...leadingSegments, LIBRARY_DIRECTORY_NAME);
  }

  return path.join(...leadingSegments, LIBRARY_DIRECTORY_NAME);
}

function isPathInside(candidatePath: string, containerPath: string): boolean {
  const relativePath = path.relative(containerPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const stringValues: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const trimmedEntry = entry.trim();
    if (trimmedEntry.length === 0) {
      continue;
    }

    stringValues.push(trimmedEntry);
  }

  return stringValues;
}
