# Spend fewer Kiro credits

Bobert shows how fast your Kiro credits go and links here from its model hint. These are general habits for using fewer credits per task. Bobert doesn't measure credits per task and never reads your prompts or conversations, so how much each habit saves depends on your work.

## Pick the model for each step

Kiro charges each model at a different rate relative to **Auto**, the 1x baseline. Its model overview lists the current rates; Bobert's model hint quotes them from a dated table.

- Leave **Auto** on for routine work: small edits, renames, tests, boilerplate, explanations.
- Switch to a stronger model only for the steps that need it, such as planning a feature, a design decision or a hard bug. Then switch back.
- If a step on Auto keeps failing, a stronger model for that one step can cost less than more retries.

## Plan once, then build in small steps

A plan you can check keeps the expensive part short:

1. **Plan** with a strong model, for example with the **Plan** or **Spec** agent that Kiro offers in a new chat: the goal, the files involved and small tasks with clear done criteria.
2. **Build** each task on Auto or a lighter model, one task per request, with the files it needs.
3. **Review** at the end with one request that checks the result against the plan, rather than reviewing every small step with a strong model.

## Keep sessions short and focused

A long session carries more context into each request. Start a **new session** for unrelated work. Bobert reminds you when the latest session is about 70 % and 85 % full.

## Keep what Kiro always reads small

- **Steering:** a large Steering file with `inclusion: always` is part of every request. Use `inclusion: manual` or a narrow `fileMatch` pattern for anything you don't need every time. **Run Workspace Audit** flags large always-included files and prepares the change for you to review and save.
- **Hooks:** a hook that starts the agent on every file save can use credits all day. Run such hooks manually or narrow their pattern. The audit flags broad and agent-starting hooks too.
- **Files:** secrets, database dumps, archives and build output don't belong in Kiro's context. **Exclude from Kiro…** prepares `.kiroignore` lines. Kiro uses `.kiroignore` only when it is listed in **Agent Ignore Files** (`kiroAgent.agentIgnoreFiles`).

## Credits left before the reset

Kiro's plan credits lapse at the reset and don't carry over to the next month (Kiro pricing FAQ, checked 2026-10-29). Add-on credits you bought are different: they last 12 months. If you have time before the reset, a few kinds of work suit spare credits well:

- **Tests** for code that has none, or for the bug you fixed last week.
- **Docs:** a README, a setup guide or comments for the module only you understand.
- **A refactor you keep postponing,** planned once with the Plan or Spec agent and built in small steps.
- **A review** of a larger change with a stronger model, checked against its plan.
- **A spike:** try the library or approach you've been curious about on a branch.
- **Clean up what Kiro reads:** run **Workspace Audit** and tidy Steering and hooks so next month starts lean.

There's no need to use credits just because they're there. If this happens every month, **Bobert: Open Cost Advisor** shows whether a smaller plan would fit.

## Watch the budget, not every request

- The status bar shows your daily budget and whether you are on track. A notice warns before the reported limit is reached.
- **Bobert: Show Credit Budget** shows the forecast and, past the limit, the add-on credits you would need to keep working until the reset, with a dollar figure.
- **Bobert: Open Cost Advisor** gives one recommendation for the next billing cycle (a different plan, or your plan plus add-on credits as needed), based on your usage forecast; confirm your plan with one click to remove the assumption.

All dollar figures are modelled from list prices, not invoices. The model rates are Kiro's published list, and the credits an actual task uses vary.
