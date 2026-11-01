# Recipes: copy, paste, adjust

Short, ready-to-use snippets for keeping Kiro's context small. Each one says what it does and when **not** to use it. They are general habits, not measurements: Bobert never reads your prompts, files or conversations, so how many credits a recipe saves depends on your work. Check any file you save with **Bobert: Run Workspace Audit** and **Bobert: Review Kiro Steering and Hooks**.

## Steering

### Load a large guide only when you ask for it

Put this at the top of a Steering file in `.kiro/steering/` that you don't need in every request, such as a long style guide or a migration plan:

```markdown
---
inclusion: manual
---
```

Kiro then adds the file only when you reference it with `#` in a chat. **Don't use it** for rules Kiro must always follow (for example "never commit secrets"): keep those short and always included.

### Load a guide only for matching files

For rules that matter in one part of the project:

```markdown
---
inclusion: fileMatch
fileMatchPattern: "src/api/**/*.ts"
---
```

Adjust the pattern to the files the rules apply to. A pattern that matches every file (`*` or `*.*`) behaves like always-included, and the review flags it.

### Keep what is always included short

A Steering file with `inclusion: always` (or no front matter at all) is part of every request. Keep it to a page: the build and test commands, the folder layout, and the three rules that matter most. Move the rest into `manual` or `fileMatch` files.

## What Kiro should not read

### A starting `.kiroignore`

Secrets, database dumps, archives, logs, large data files, build output and installed dependencies rarely help Kiro. A starting point (same pattern style as `.gitignore`; keep only the lines that fit your project):

```gitignore
.env
.env.*
*.pem
*.sqlite
*.dump
*.zip
*.tar.gz
*.log
data/
node_modules/
dist/
build/
```

Kiro uses `.kiroignore` only when it is listed in **Agent Ignore Files** (`kiroAgent.agentIgnoreFiles`). **Don't use** a broad pattern for files Kiro actually needs, such as a `data/` folder that holds fixtures your tests read. **Exclude from Kiro…** in the Workspace Audit view prepares lines for the files it found, and you review them before saving.

## Hooks

### Run agent hooks by hand

A hook that starts the agent on every file save or prompt can use credits all day. Set that hook's `trigger` to `"Manual"` so it runs only when you start it. **Run only manually…** in the review does exactly that change for one hook and shows a preview first. **Don't use it** if the hook has to run without you, for example a safety check. Use a narrow matcher or a shell command action there.

## Prompts

These templates keep each request small. Replace the parts in angle brackets.

**Plan once (strong model, Plan or Spec agent):**

```text
Goal: <what should be true when this is done>
Files involved: <paths, if you know them>
Break this into small tasks. For each task give a done criterion I can check.
Do not change any files yet.
```

**Build one task (Auto or a lighter model):**

```text
Do only task <number> from the plan above.
Touch only <files>. Stop when <done criterion> is true and tell me what changed.
```

**Review once at the end:**

```text
Check the result against the plan above. List what is missing or different.
Do not make changes; I will decide what to fix.
```

More habits are in [credit-tips.md](credit-tips.md). What Bobert's numbers mean is in [guide.md](guide.md).
