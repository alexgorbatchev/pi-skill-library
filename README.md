# @alexgorbatchev/pi-skill-library

[pi](https://pi.dev) extension that discovers `skills-library` roots and exposes their skills through `/library:<skill-name>` commands. This extension solves the problem of too many skills. There are skills that you need only occasionally and maybe don't even need them discoverable.

## Install

```bash
pi install npm:@alexgorbatchev/pi-skill-library
```

## What it does

This package does **not** register bundled skills through Pi's normal skill loader.
Instead, it discovers `skills-library` directories, loads the skills from those roots itself, and expands:

```text
/library:<skill-name>
```

into the same `<skill ...>...</skill>` block format Pi uses for built-in `/skill:<name>` expansion.

That keeps these skills out of Pi's default skill discovery flow while still making them explicitly invokable.

## Library root locations

The extension looks for `skills-library` in these places:

- `<cwd>/.pi/skills-library`
- `<cwd>` and ancestor `.agents/skills-library` directories, stopping at the git root (or filesystem root when no git root exists)
- `~/.pi/agent/skills-library`
- `~/.agents/skills-library`
- package-local `skills-library` directories derived from discovered package skill roots
- extra paths configured via Pi settings under `@alexgorbatchev/pi-skills-library.paths`

## Settings

Use a namespaced block in Pi settings:

```json
{
  "@alexgorbatchev/pi-skills-library": {
    "paths": ["./skills-library", "~/shared/pi-skills-library"]
  }
}
```

Path resolution follows normal Pi settings behavior:

- paths in `~/.pi/agent/settings.json` resolve relative to `~/.pi/agent`
- paths in `.pi/settings.json` resolve relative to `.pi`
- absolute paths are supported
- `~/...` is supported

## Directory layout

Each library root should contain normal skill directories:

```text
skills-library/
├── my-skill/
│   └── SKILL.md
└── another-skill/
    ├── SKILL.md
    └── references/
```

## Commands

Invoke a library skill directly:

```text
/library:my-skill
/library:my-skill additional context here
```

Discovered library skills are registered as real extension slash commands at startup and reload, so they show up in slash-command autocomplete like other commands.

On startup, the extension prints a library-discovery message into the transcript listing each discovered library root and its skills. Home-directory paths are rendered with the `~/` convention.

Use the package info command to print the same report again:

```text
/pi-skill-library
```
