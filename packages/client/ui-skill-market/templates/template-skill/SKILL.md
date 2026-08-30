---
name: skill-market-template
description: A complete marketplace skill template for authoring a safe, installable ZIP package.
---

# Marketplace Skill Template

Use this skill as a starting point for a small, focused capability. Replace the
name and description in the frontmatter before publishing your own archive.

Keep `SKILL.md` at the archive root. The marketplace reads its metadata to name
the installed directory and describe the skill to users.

## Authoring Checklist

1. Use a lowercase kebab-case `name`.
2. Write a clear `description` that says what the skill helps with.
3. Keep references as ordinary files inside the archive.
4. Do not include symbolic links, executables, nested archives, or generated
   dependency folders.

Read `references/authoring-notes.md` for an example of optional package
material that can support the primary skill instructions.
