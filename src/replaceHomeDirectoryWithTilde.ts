import { homedir } from 'node:os';
import path from 'node:path';

export function replaceHomeDirectoryWithTilde(value: string): string {
  const homeDirectoryPath = homedir();
  const normalizedHomeDirectoryPath = path.normalize(homeDirectoryPath);
  const normalizedValue = path.normalize(value);

  if (normalizedValue === normalizedHomeDirectoryPath) {
    return '~';
  }

  const homeDirectoryPrefix = `${normalizedHomeDirectoryPath}${path.sep}`;
  if (!normalizedValue.startsWith(homeDirectoryPrefix)) {
    return value;
  }

  return `~${path.sep}${normalizedValue.slice(homeDirectoryPrefix.length)}`;
}
