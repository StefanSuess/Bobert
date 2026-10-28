<img src="https://raw.githubusercontent.com/StefanSuess/Bobert/HEAD/assets/branding/bobert-icon-128.png" alt="Bobert icon" width="96" height="96">

# Bobert: Kiro Credit Tracker

**Bobert worries about your Kiro credits, so you don't have to.**

[![Open VSX version](https://img.shields.io/open-vsx/v/StefanSuess/bobert)](https://open-vsx.org/extension/StefanSuess/bobert)
![Development version 1.2.0 stable](https://img.shields.io/badge/development-1.2.0%20stable-blue)
[![CI + coverage ≥80%](https://img.shields.io/github/actions/workflow/status/StefanSuess/Bobert/ci.yml?branch=main&label=CI%20%2B%20coverage%20%E2%89%A580%25)](https://github.com/StefanSuess/Bobert/actions/workflows/ci.yml?query=branch%3Amain)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/StefanSuess/Bobert/blob/HEAD/LICENSE)

Bobert looks like he has seen a ghost. He has: your credit forecast.

Kiro tells you how many credits you have used. Bobert helps you plan ahead: whether they are likely to last until the reset and what additional credits could cost. It also highlights files and automatic hooks worth reviewing. Start with your credit budget in the status bar.

<p align="center">
  <img src="https://raw.githubusercontent.com/StefanSuess/Bobert/main/docs/media/demo.gif" alt="Animated story with invented data: Bobert, a robot with a gauge for a mouth, watches the Kiro credit meter drain to 0% before the reset; a notice warns five days before the credits run out; the credit view shows a modelled cost of about $38 for the add-on credits that would avoid running out; a notice shows the model hint that a pricier model uses more credits than Auto; the workspace audit finds 190 MB of dumps and a hook that runs on every change; Bobert prepares the fix for review; the end card types Bobert into an extensions search box." width="900">
</p>

## Why you'll want it

- **Plan ahead for your next reset.** Once enough comparable history is available, Bobert estimates when your credits could run out and warns you about your budget: at 80 % (adjustable), when a run-out before the reset becomes likely, and when the limit is reached.
- **Estimate additional credit costs.** For paid consumer plans, Bobert estimates the add-on credits you may need and their cost at list prices. These are purchase estimates, not automatic charges. The Cost Advisor leads with one recommendation, which can be a smaller plan plus add-on credits when that is cheaper, and keeps its assumptions in a collapsed section. When a smaller plan would have been enough, Bobert says so.
- **Review files Kiro may not need.** The workspace audit flags possible secret files, database dumps, archives and build output by filename and prepares `.kiroignore` lines for you to review. It does not measure their credit consumption.
- **Review automatic context and agent work.** Bobert flags large always-included Steering files and hooks that trigger agent work automatically. It suggests changes for you to review; actual credit savings depend on how you use Kiro.
- **Keep context and model choices in view.** You get a nudge when a session's context is about 70 % or 85 % full, or a model hint based on Kiro's published credit rates when your budget is tight or context is filling up, with [tips for spending fewer credits](https://github.com/StefanSuess/Bobert/blob/HEAD/docs/credit-tips.md).
- **Your whole cycle at a glance.** The status bar shows today's usage against your daily budget, and you can spread that budget over only the days you work. The credit view adds a usage chart with forecast scenarios and a recap of the last cycle that you can share.

Free and open source, with no account, no sign-in and no telemetry. Everything stays on your machine, and Kiro's files are only ever read.

<p align="center">
  <img src="https://raw.githubusercontent.com/StefanSuess/Bobert/main/docs/media/credit-view.png" alt="Bobert credit view in Kiro with invented data: Likely to exceed, 4210 of 5000 reported credits used, the credits run out on 27 Oct before the 1 Nov reset, about 950 add-on credits (about $37.98, modelled) needed to avoid running out, and the usage chart with forecast lines, with the status bar warning below. No real account information is shown." width="900">
</p>

<details>
<summary><b>More screenshots:</b> budget notice, Cost Advisor, workspace audit, Steering and Hooks review, session hint</summary>

<p align="center">
  <img src="https://raw.githubusercontent.com/StefanSuess/Bobert/main/docs/media/budget-notice.png" alt="Budget notice and status bar with invented data: at this pace the Kiro credits run out on 27 Oct, 5 days before the reset (about $37.98 over the limit, modelled), with Show details and Turn off budget notices buttons, above the warning status bar item Kiro credits: Likely to exceed, runs out 27 Oct." width="900">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/StefanSuess/Bobert/main/docs/media/cost-advisor.png" alt="Cost Advisor in the credit view with invented data: your plan Pro Max, assumed from the 5,000-credit limit, with Confirm and Change buttons, and the recommendation to stay on Pro Max and buy add-on credits as needed for about $131.64 a month, with the note that it is an estimate from list prices before tax, not a guarantee." width="760">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/StefanSuess/Bobert/main/docs/media/workspace-audit.png" alt="Workspace Audit view with invented files: 4 suggestions, Kiro may read about 190.7 MiB, a database dump and an archive to exclude with their rules prepared but unsaved, a large always-included Steering file to load only when needed and a hook that runs on every file change, beside the prepared .kiroignore lines that stay unsaved until you save them." width="900">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/StefanSuess/Bobert/main/docs/media/steering-hooks.png" alt="Steering and Hooks review with invented files: a large always-included Steering file and a hook that runs on every file change, with Kiro's refactor preview switching the Steering file from inclusion always to manual, with Apply and Discard buttons." width="900">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/StefanSuess/Bobert/main/docs/media/session-hint.png" alt="Session hint with invented data: your Kiro credit budget is tight and your most recent session in this workspace uses Claude Opus 4.8, which Kiro lists at about 2.2x the credits of Auto (Kiro model table, as of 2026-10-18), with Show credit budget, Tips and Turn off session hints buttons." width="760">
</p>

</details>

## Get started in a minute

1. Install **Bobert** from [Open VSX](https://open-vsx.org/extension/StefanSuess/bobert), or search for it in Kiro's Extensions view. You can also install the VSIX from the [latest release](https://github.com/StefanSuess/Bobert/releases) with **Extensions: Install from VSIX...**.
2. Click the credit item in the status bar, or run **Bobert: Show Credit Budget**.
3. Run **Bobert: Run Workspace Audit** to see what Kiro reads that it doesn't need.

The status bar shows "Collecting data" until Kiro has logged its first account usage. From the first update it shows the credits left and your daily allowance whenever it can compute them (for example "380 left • 55/100 today": 55 credits used today of a fixed allowance of 100), and forecasts follow after a few days of history. The allowance stays fixed during the day. If you work only some weekdays, run **Bobert: Set Up** to choose your budget days. Settings, the command-line tool and troubleshooting are in the [usage guide](https://github.com/StefanSuess/Bobert/blob/HEAD/docs/usage.md).

## Good to know

- **Honest numbers.** Figures are the last values Kiro logged, shown with an as-of time; they are not a live balance. Forecasts are labelled scenarios, unknown periods stay unknown and are never counted as zero, and dollar amounts are modelled from a dated list price (before tax), not an invoice.
- **Private by design.** Bobert has no network code. It keeps only allowlisted billing figures in its own storage. Prompts, code and credentials are never stored or shown. Session hints read your open folder's latest Kiro session in memory and keep only its model, context percentage and time; turn them off with `bobert.sessionHints`. Every fix is prepared as an unsaved edit that you review and save yourself. Details are in [privacy and storage](https://github.com/StefanSuess/Bobert/blob/HEAD/docs/privacy-and-storage.md).
- **Platforms.** Works on macOS, Windows and Linux. See [platform support](https://github.com/StefanSuess/Bobert/blob/HEAD/docs/platform-support.md).
- **Verifiable builds.** CI attests each release VSIX before it is published ([attestations](https://github.com/StefanSuess/Bobert/attestations), [release process](https://github.com/StefanSuess/Bobert/blob/HEAD/docs/release-process.md)).
- **Not using Kiro?** In other editors the workspace audit still works, though there is no credit view there.
- **Something wrong?** **Bobert: Report a Problem** creates a short diagnostic report of fixed codes and counts for you to review before you paste it anywhere. Please never post real Kiro data in issues.

## Like it?

[Leave a review on Open VSX](https://open-vsx.org/extension/StefanSuess/bobert) · [Star on GitHub](https://github.com/StefanSuess/Bobert) · [Support development ☕](https://ko-fi.com/stefansuess)

Bobert is free, with no paid features. Support is entirely optional.

[Documentation](https://github.com/StefanSuess/Bobert/blob/HEAD/docs/README.md) · [Changelog](https://github.com/StefanSuess/Bobert/blob/HEAD/CHANGELOG.md) · [Roadmap](https://github.com/StefanSuess/Bobert/blob/HEAD/ROADMAP.md) · [Contributing](https://github.com/StefanSuess/Bobert/blob/HEAD/CONTRIBUTING.md) · [Security](https://github.com/StefanSuess/Bobert/blob/HEAD/SECURITY.md) · [MIT License](https://github.com/StefanSuess/Bobert/blob/HEAD/LICENSE)

> Unofficial open-source project. Not affiliated with, endorsed by or sponsored by Amazon Web Services or Kiro. "Kiro" is a trademark of its owner. The code is MIT-licensed; the Bobert name, icon and mascot are not (see [name, icon and mascot](https://github.com/StefanSuess/Bobert/blob/HEAD/TRADEMARKS.md)).
