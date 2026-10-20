---
title: spend-readme
status: done
last_updated: 2026-10-19
---

# spend-readme

Conventions borrowed from wiki/tasks/spend-slash-command.md.

## Feature

User request (verbatim intent): "add a README on how to install the command".

Scope: a README.md at the repo root explaining how to install and use the /spend command. The command is this repo's project-level command .claude/commands/spend.md, with scripts/spend.sh and dist/cli.js.

Docs only. Steps 1, 5, 6 skipped (no UI, nothing to e2e).

## Facts the README may state (all verified)

- Requirements: Node >=20.19.
- Install: clone, `npm install`, `npm run build`.
- dist/ is gitignored, so a fresh clone has no build. Without it the command prints "dist/cli.js missing: run npm install && npm run build".
- Open Claude Code with the project root (this repo) as the working directory, in a fresh session so the command is picked up.
- Usage: `/spend`, `/spend task`, `/spend task N`.
- `/spend foo` shows the CLI usage line as a "Shell command failed" error.
- The CLI alone: `node dist/cli.js --by agent` or `node dist/cli.js --by task [--top N]`.
- Reads only ~/.claude/projects/<cwd with non-alphanumerics replaced by "-">/ transcripts. The project is the working directory.
- The CLI is offline and writes nothing. /spend sends the report to the API (it enters the conversation).
- Each /spend run re-reads the session context; the README gives no constant. Measured (session 818d1072, 2026-10-19 21:59, fresh session that ran /spend): 2 requests, 4 input, 1,183 output, 71,273 cache read, 21,204 cache write, est. $0.21, about 93k tokens, about 99% cache.
- The printed numbers are estimates and lower bounds (see the report's warnings).
- Prices are in prices.json, taken from the official price page. Update when prices change.
- Width is fixed at 120 columns for the command.

## NOT verified (README must say so, or omit)

- Using /spend from other projects. The script uses the caller's cwd and ROOT from its own path, so a user-level ~/.claude/commands/spend.md with an absolute path MIGHT work. Untested.
- Anything about the status line (dropped).

## Decision log

- (a) 2026-10-19: USER asked "add a README on how to install the command".
- (b) 2026-10-19: Advisor check (step 7) done; three claims fixed in 9f96eac. Task closed.

## Resume

- Step 0 done.
- Steps 1, 5, 6 skipped (no UI; nothing to e2e).
- Step 7 advisor check done (decision b). Task closed.
- Resume: nothing queued.

## Report

Shipped: README.md at the repo root, commits 93a3769 (new) and 9f96eac (three fixes). Full report: [spend-slash-command](spend-slash-command.md).

Sections of README.md: what it is, requirements, install, usage, what to know, development, not verified.

Advisor step 7 found 3 claims to fix, all fixed in 9f96eac:
1. The "about 1-2k tokens per run" figure was an unmeasured estimate and wrong. Measured with the tool on a fresh session that ran /spend (session 818d1072, 2026-10-19 21:59): 2 requests, 4 input, 1,183 output, 71,273 cache read, 21,204 cache write, est. $0.21, about 93k tokens, about 99% cache. The README now says the cost re-reads the session context and gives no constant. This also corrects what the lead told the USER earlier in this session.
2. The "warns when transcripts are newer" line was checked in src/diagnostics.ts versionLines/TESTED_UP_TO (2.1.296): every report prints "Claude Code version seen (max): X; tested up to Y." and a second Warning line only when the seen version is newer. The README now says exactly that.
3. "Works offline" is scoped to the CLI; /spend sends the report to the API.

Checked against the repo: engines >=20.19, scripts build/test/test:e2e, dist gitignored, the missing-dist message text, usage forms, parseArgs rules, project-dir mangling, COLUMNS=120, prices.json fields. "Shell command failed" is verified by the USER's /spend foo run (the programmer had listed it unverified).

Not verified:
- Use from other projects (user-level command with an absolute path; never run).
- The clone URL: no git remote exists, so README has the placeholder `git clone <this repo>`.

Docs only: no tests run; steps 1, 5, 6 skipped.

Resume: nothing queued. Decision (b): task closed after the advisor check.
