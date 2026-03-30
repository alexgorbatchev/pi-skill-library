import { type Skill, stripFrontmatter } from '@mariozechner/pi-coding-agent';
import { readFile } from 'node:fs/promises';

export async function expandLibrarySkill(skill: Skill, args: string): Promise<string> {
  const content = await readFile(skill.filePath, 'utf8');
  const body = stripFrontmatter(content).trim();
  const skillBlock =
    `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
  return args.length > 0 ? `${skillBlock}\n\n${args}` : skillBlock;
}
