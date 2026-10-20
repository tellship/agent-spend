---
title: spend-slash-command
status: done
last_updated: 2026-10-19
---

# spend-slash-command

Conventions borrowed from wiki/tasks/claude-code-spend-report.md.

## Feature

User request (verbatim intent): "make this into a command or a mod ... in a box", referring to the spend-report CLI.

Lead offered two options:
1. An on-demand /spend command.
2. A toggleable status line.
Or both.

Lead told the USER that, to its knowledge, a custom command prints into the conversation as a normal message and cannot draw a pane over the prompt. The status line sits below the prompt and holds only a few text lines. NOT VERIFIED against current docs.

USER answered: "write the command first".

Scope now: the /spend slash command ONLY. The status line is a later, separate slice (not approved, not planned).

Constraints (unchanged from claude-code-spend-report):
- No network.
- No message text printed, except the ai-title.
- Nothing leaves the machine.
- Reuses the built CLI: `node dist/cli.js --by agent` or `--by task [--top N]`.

## Explorer findings (verbatim)

- No .claude/commands/ or .claude/skills/ in this repo. .claude/ holds settings.local.json (ignored, never read) and agent-memory/programmer/{MEMORY.md,spend-report-architecture.md}, tracked. ~/.claude has skills/<name>/SKILL.md, agents/*.md, settings.json; no commands/ dir.
- Command format reference: ~/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/command-development/README.md lines 120-156: frontmatter description, argument-hint, allowed-tools, disable-model-invocation; args $ARGUMENTS / $1; shell injection !`cmd`; locations project .claude/commands/ and personal ~/.claude/commands/. Working example: .../plugins/commit-commands/commands/commit.md (allowed-tools, !`git status` lines 8-10).
- ~/.claude/settings.json: permissions allow/ask with Bash(pattern); PreToolUse hooks on Bash (docker-guard.sh, block-git-push.sh) and Edit/Write (check-rules-read.sh).
- package.json: build = tsc -p tsconfig.build.json; no bin. dist/ is gitignored (.gitignore:2), so a fresh clone has no build; the command must build or check dist/cli.js. Node >=20.19. prices.json is read relative to the module (src/pricing.ts:58-60), root-level.
- cli.ts:7-12 uses os.homedir(), process.cwd(), width from process.stdout.columns then COLUMNS then 80 (table.ts:60-64). Piped stdout (as with !`...`) has no columns, so COLUMNS or 80.
- parseArgs (run.ts:27-35): --by agent | --by task [--top N, N>=1]; anything else exits 1 with usage on stderr. No transcripts: exit 2, stderr "No Claude Code transcripts found in <dir>". Success: exit 0, empty stderr. Note: !`...` capture may not expose the exit code; errors arrive on stderr, so the command body must surface them.
- .gitignore:4 ignores .claude/settings.local.json; .claude/commands/spend.md and .claude/settings.json are NOT ignored.
- Tests: test/e2e/cli.test.ts spawns dist/cli.js with COLUMNS and TZ; nothing tests any command file; npm test runs test/unit only.
- NOT VERIFIED: whether allowed-tools needs Bash(npm run build) and Bash(node dist/cli.js *); whether !-injected output is subject to the PreToolUse Bash hooks; how $ARGUMENTS maps "task 10" to --by task --top 10 (belongs in the command body; no run yet); build on demand vs fail with a message when dist is missing.

## Acceptance criteria

ACCEPTANCE CRITERIA (lead-written, no UI; verbatim)
- S1.1 Given the built CLI and transcripts for this project, when I type /spend, then the --by agent report appears in the conversation.
- S1.2 Given /spend task or /spend task 10, then the output is --by task or --by task --top 10.
- S1.3 Given an argument the CLI rejects (e.g. /spend foo), then the usage line is shown and nothing crashes.
- S1.4 Given a project with no transcripts, then the "No Claude Code transcripts found in <dir>" message is shown.
- S1.5 Given dist/cli.js is missing (gitignored), then the command builds it or says clearly to run npm run build.
- S1.6 Given any run, then the command reads only and writes nothing except an optional build; no network; the existing rule on message text (only the ai-title) still holds.
- S1.7 The command file is committed in the project at .claude/commands/spend.md and works from the project root.

## Plan

PLAN (programmer, advisor-reviewed 2026-10-19). Status: approved 2026-10-19 (Option B, 2 slices; open question 1 answered YES). Slice 1 DONE (2026-10-19); slice 2 DONE (2026-10-19).

### Options

- **Option A (smallest).** One markdown file, inline shell with `${1:-agent}` and a `[ -f dist/cli.js ] && ... || echo` line, no build. Risks: `$1` substitution unverified; raw `$ARGUMENTS` in shell; compound line vs allowed-tools; no shell seam for tests. One slice.
- **Option B (recommended, middle).**
  - `.claude/commands/spend.md`: frontmatter `description`, `argument-hint: [agent|task] [N]`, `allowed-tools: Bash(bash scripts/spend.sh:*)`, `disable-model-invocation: true`; a `!` line `bash scripts/spend.sh $ARGUMENTS`; an instruction to print the output verbatim in one fenced block.
  - `scripts/spend.sh` (~15 lines): first word maps to `--by`, default `agent`; second word maps to `--top N`; anything else is passed through and rejected by the CLI (single source of truth); `2>&1` so usage and no-transcripts errors reach the output; finds `dist/cli.js` relative to its own path; if missing, prints `dist/cli.js missing: run npm install && npm run build`.
  - `test/e2e/command.test.ts`: spawns the script with temp HOME and cwd; pins frontmatter and the `!` line; checks the script has no network call.
  - Git: add by explicit path, never `git add .`.
- **Option C (largest).** B plus an opt-in `claude -p "/spend task 10"` smoke script and slash-style positional args in `src/run.ts`. Overreach: needs auth, costs tokens, nondeterministic, touches a tested CLI contract. Deferred.

### Slices

- **Slice 1 (spike).** Default `/spend` end to end. Closes S1.1, S1.4, S1.6, S1.7.
- **Slice 2.** Argument mapping (`task`, `task 10`, `foo` gives usage) plus the missing-dist message. Closes S1.2, S1.3, S1.5.

### S1.5 decision

Print a message only. Do NOT auto-build: no write, no nested `npm`/`tsc` under the `!` permission check, no build output in the conversation. Auto-build only if the USER asks later.

### Slice 1 gate (pass/fail written BEFORE the run)

The USER runs `/spend` in this or a fresh session; the lead cannot. Checks:

- (a) Does the user see the table, or only the model's copy?
- (b) Is the copy exact versus a direct `node dist/cli.js --by agent` at the same COLUMNS?
- (c) Did allowed-tools prompt?
- (d) Did the command need a session restart to appear?
- (e) What is COLUMNS in the `!` environment? (One-line echo in the spike.)

PASS = the user sees correct numbers. FAIL = stop; take the bash-mode option (`!node dist/cli.js --by agent` typed in the prompt, zero model turn; unverified) to the USER; do not build slice 2 on a failed gate. Width for the command is chosen only after (e) is seen.

#### Slice 1 result (2026-10-19): DONE (commit bbee619; gate passed, see GATE RESULT)

- Files: scripts/spend.sh (100755; resolves ROOT from its own path, runs `node "$ROOT/dist/cli.js" --by agent 2>&1`, no cd); .claude/commands/spend.md (frontmatter description, allowed-tools `Bash(bash scripts/spend.sh:*)` and `Bash(echo:*)`, disable-model-invocation: true; `!bash scripts/spend.sh`; TEMPORARY spike line `!echo "COLUMNS=${COLUMNS:-unset}"`; "Print the output above verbatim in one fenced code block. Add nothing else."); test/e2e/command.test.ts (6 tests).
- Checks (lead re-ran): unit 115 passed; e2e 19 passed; tsc 0; build ok. Real run from the project root: script output equals the CLI's report.
- Test-first: all 6 new tests were run red before any implementation. The red reason was READ for 3 (ENOENT on spend.md). NOT read for the other 3 (they had to fail because scripts/spend.sh did not exist). Mostly red-first; not strictly test-first.
- Stale note: the programmer said "--by agent output does not depend on width". Since S4.2 the reconcile warnings DO depend on width.
- Review basis: lead and advisor read all three files of bbee619 (script, command file, test file). No defects.
- Verified at script level only: S1.4 (no transcripts, exit 2). At the project root the CLI exits 0, so the gate does not test whether Claude Code still inlines `!` output when the exit code is non-zero. ADD to slice 2 gate: `/spend foo` (exit 1) tests that path in the real command.
- GATE (pass = the USER sees the table in the conversation and the sums hold). The USER runs /spend in a FRESH session at the project root (this session's orchestration rules could override "Add nothing else"). Items:
  - (a) Does the user see the table, or only the model's copy?
  - (b) Is the copy intact? NOT by re-running the CLI (data drifts every turn). Instead: each token column of the printed block adds up to its TOTAL cell, Share adds to 100%, and every warning line the CLI prints is present with the same wording.
  - (c) Which line, if any, prompted for permission? (The spike echo may prompt; only a prompt on `bash scripts/spend.sh` matters for the shipped command.)
  - (d) Did /spend appear in autocomplete in the fresh session?
  - (e) The echoed COLUMNS value AND which form the reconcile warnings took ("2026-10-19 ... · HEAD (id8)" means about 95+ columns; bare ids mean below about 90).

GATE RESULT (2026-10-19, USER ran /spend in a fresh session): (b) PASS, lead verified from the pasted output: Requests 772, Input 1,180,372, Output 503,549, Cache read 36,936,195, Cache write 2,897,003 each equal the TOTAL cell, Share sums to 100.0%, all warning lines present with the CLI's wording (cache-split, unfinalized, advisor, coverage 56.7%, 5 session lines, skipped note). (c) no permission problem, (d) /spend appears in autocomplete: USER said "c,d is ok". (e) COLUMNS=0 in the ! environment; the CLI only accepts a positive COLUMNS, so it fell back to 80, and the pasted session lines show bare id8, consistent. (a) NOT answered explicitly; treated as passed because the USER pasted the table with intact sums (inferred, say so). Slice 1 DONE.

#### Slice 2 result (2026-10-19): DONE (commit 0bc116b; gate passed, no fix rounds)

- scripts/spend.sh: first arg -> --by (default agent), second -> --top N, extras passed through so the CLI prints its usage line (exit 1); keeps 2>&1, no cd, ROOT from its own path; missing dist/cli.js prints "dist/cli.js missing: run npm install && npm run build" and exits 1 (no auto-build); runs `COLUMNS=120 node ...` because the ! environment gives COLUMNS=0 (the CLI ignores it). .claude/commands/spend.md: spike echo and Bash(echo:*) removed; `!bash scripts/spend.sh $ARGUMENTS`; argument-hint [agent|task] [N]; description no longer says "(--by agent)".
- Checks (lead re-ran): unit 115, e2e 26 passed, tsc 0. Direct runs of `bash scripts/spend.sh task 2` and the usage case behave as expected.
- Tests: new e2e for task, task 1 (+1 more), foo / agent 10 / task x (usage line, exit 1), COLUMNS=0 still shows the full 32-char description, missing dist in a copied temp tree (message, exit 1, nothing written); slice-1 pins updated (no spike echo, argument-hint, allowed-tools exact).
- Test-first: every new or changed test was seen red, with the reason read, EXCEPT the no-network/no-write guard. That guard went red only after the script change (the missing-dist text contains "npm") and was narrowed to strip that one echo line, so it was not red-first. The `task 1` expectation was first wrong ("+2 more") and was corrected before green. Mostly red-first.
- Review basis: lead and advisor read the script, command file and test diff of 0bc116b. No defects. SLAP verdicts printed by the lead, all ok: scripts/spend.sh, runScript (test), projectDir (test closure).
- KEY RISK for the gate (advisor): the e2e passes arguments as an array, so it cannot catch how Claude Code expands $ARGUMENTS. The lead's own zsh loop showed `$a` ("task 2") reaching the script as ONE argument (zsh does not word-split), then the usage line. This is a harness artifact: direct runs with two arguments work (`bash scripts/spend.sh task 2` prints the task table). If Claude Code's `!` line goes through the shell like that, `/spend task 10` would give the usage line.
- SLICE 2 GATE (USER, FRESH session at the project root; the command file changed):
  1. `/spend task 10` with two words. PASS = header starts with `Task`, at most 10 rows, and a `+K more, $X (included in TOTAL)` line. FAIL-A = agent table (arguments never reached the script). FAIL-B = usage line (arguments arrived as one word). Either failure = round 1 of 2; the fix goes in scripts/spend.sh (e.g. re-split the arguments at the top; check under zsh first), not the CLI.
  2. `/spend foo`. PASS = the usage line is shown. This proves Claude Code shows `!` output when the exit code is non-zero (open since slice 1).
  3. Plain `/spend`. The reconcile lines should read "2026-10-19 ... · HEAD (0a2468f9)". This proves COLUMNS=120 works in the real `!` environment. Does the table WRAP in the terminal? (120 is a guess; lowering is a one-line change.)
  4. Yes/no: did the user see the table themselves, or only the model's copy? (Slice 1 item (a), still inferred.)
- Open risks for the report: S1.3 is met as written, but the usage line shows CLI flags (`--by task [--top N]`), not /spend syntax; each run costs a model turn; a stale dist is not detected; `$ARGUMENTS` is unquoted (the user's own typing); the copy was checked only by its sums.

SLICE 2 GATE RESULT (2026-10-19, USER ran in a fresh session):

- Item 1: the USER ran `/spend task 4` (NOT `task 10`). PASS: header starts with `Task`, 4 rows, "+72 more, $8.25 (included in TOTAL)"; the shown rows ($10.43) plus the remainder equal TOTAL $18.69; lead checked it against a local run (`task 10` gives 10 rows and `task 4` gives 4 rows plus a +K more line). Two-word arguments reach the script intact. The date-and-branch labels ("2026-10-19 21:36 · main (b65faa1d)") prove COLUMNS=120 took effect in the real ! environment.
- Item 2: PASS. `/spend foo` showed: `Shell command failed for pattern "!`bash scripts/spend.sh foo`": [stderr] Usage: spend-report --by agent | --by task [--top N]`. So Claude Code reports a non-zero exit as a "Shell command failed" error carrying the CLI's message; the command stops there and no model turn is spent. Meets S1.3 as the user sees it.
- S1.4 (no transcripts, exit 2) and S1.5 (missing dist, exit 1) were NOT run in the real command; INFERRED from `/spend foo` (same stdout path, same non-zero exit), verified at script level by e2e.
- Item 3 (does the table wrap at 120 columns): UNANSWERED, unverified; lowering the width is a one-line change in scripts/spend.sh.
- Item 4 (did the user see the table themselves): UNANSWERED; INFERRED from two pastes, not confirmed.
- Plain `/spend` was not re-run in the real command since $ARGUMENTS was added; low risk (empty or literal expands to nothing in the shell; e2e covers the no-argument path).
- The zsh loop that showed `task 2` as the usage line was a test-harness artifact (zsh does not word-split unquoted variables), not a defect.

### Tests

- Automated: Vitest e2e spawning `scripts/spend.sh`, plus frontmatter and `!` line pin, plus no-network check. Proves the shell line only; does NOT prove how Claude Code substitutes `$ARGUMENTS`.
- Manual: the gate above, once per slice.
- Unverified even after: `$ARGUMENTS` substitution and quoting; allowed-tools pattern for compound lines; PreToolUse hook behaviour on `!` injection (global hooks are docker-guard and block-git-push only; low impact); output visibility; width.
- Notes only (not blocking): `$ARGUMENTS` is unquoted (the user's own typing); a stale `dist` after a `src` edit is not detected.

### Open question 1 for the USER (blocks the build)

The original constraint is "nothing leaves the machine". The CLI is offline and read-only, but a `/spend` command puts the report (agent names, token counts, costs, session titles, and in `--by task` the subagent descriptions) into the conversation, which is sent to the API. It was already sent once inside the sessions that produced it. Each `/spend` costs one model turn, about 1-2k tokens.

Lead's recommended default: yes for `/spend`; bash mode is the zero-model alternative. If no, the plan changes.

## Decision log

- (a) 2026-10-19: USER chose "write the command first". Command before status line.
- (b) 2026-10-19: Process note. This reopens the earlier out-of-scope item "/spend skill" of claude-code-spend-report (listed under Out of scope there).
- (c) 2026-10-19: Advisor reviewed the plan: Option B in 2 slices; slice 1 as a spike gate; no auto-build (S1.5 print-only); USER question 1 (report leaves the machine via the conversation) asked. Slice 1 gate written before the run; the USER runs it, the lead cannot.
- (d) 2026-10-19: USER answered YES to open question 1 (the /spend report may enter the conversation and be sent to the API; one model turn, ~1-2k tokens per run) and YES to approving Option B in 2 slices. Supersedes "awaiting approval". Build starts: slice 1 (spike; closes S1.1, S1.4, S1.6, S1.7).
- (e) 2026-10-19: Gate passed (see Slice 1 result); the command sets COLUMNS=120 itself because the ! environment gives 0; the spike echo line and Bash(echo:*) are removed in slice 2.
- (f) 2026-10-19: Advisor reviewed 0bc116b; no defects; gate as above (see Slice 2 result, SLICE 2 GATE).
- (g) 2026-10-19: Advisor step 7: slice 2 passes; wrap and the yes/no are recorded unverified, not asked a third time; S1.4/S1.5 labelled inferred; task closed.
- (h) 2026-10-19: USER dropped the status line ("drop the status line.. This is fine for now"); NOT BUILT, NOT PLANNED, no longer a candidate.

## Resume

- Step 0 done.
- Step 1 done (2026-10-19): Explorer findings recorded; acceptance criteria written.
- Step 2 done (2026-10-19): plan drafted (Options, Slices, S1.5 decision, Slice 1 gate, Tests) and advisor-reviewed.
- Step 3 done (2026-10-19): USER approved Option B (2 slices) and answered open question 1 YES (decision d).
- Slice 1 built and reviewed (commit bbee619; see "Slice 1 result").
- Slice 1 gate passed (2026-10-19; see "Slice 1 result"). Slice 1 DONE.
- Handoff "Slice 1 done. Resume point current at wiki/tasks/spend-slash-command.md. Restart or continue?" was answered by the USER continuing (they went straight on).
- Slice 2 built and reviewed (commit 0bc116b; see "Slice 2 result"; advisor review = decision f).
- Slice 2 gate run by the USER (see SLICE 2 GATE RESULT).
- Step 7 advisor check done (decision g). Task closed.
- Resume: nothing queued; status line dropped by the USER (decision h).

## Report

Shipped:
- Slice 1 bbee619: default /spend = --by agent report; spike gate passed.
- Slice 2 0bc116b: arguments `task` / `task N`, CLI usage line for bad arguments, missing-dist message without auto-build, COLUMNS=120.

Files: .claude/commands/spend.md, scripts/spend.sh, test/e2e/command.test.ts.

Tests: unit 115, e2e 26, tsc 0.

Test-first: slice 1 mostly red-first (reason read for 3 of 6); slice 2 mostly red-first (guard not red-first).

Criteria: S1.1, S1.2, S1.3, S1.6, S1.7 verified (S1.1 and S1.2/S1.3 in the real command); S1.4 and S1.5 inferred from `/spend foo`.

Open risks:
- The usage line shows CLI flags (--by task [--top N]), not /spend syntax.
- Each successful run costs a model turn (~1-2k tokens) and sends the report to the API (USER approved).
- A stale dist after a src edit is not detected.
- $ARGUMENTS is unquoted (the user's own typing).
- The copy was checked only by its sums.
- Failures show as a "Shell command failed" error, not a clean message.
- Wrap at 120 columns, seen-by-user and plain /spend re-run are unverified (above).
- Nothing verified in a browser (CLI).

NOT BUILT: the status line (the "in a box that can be turned on" part of the original request). Dropped by the USER on 2026-10-19 (decision h): NOT BUILT, NOT PLANNED, no longer a candidate.

Resume: nothing queued; status line dropped by the USER (decision h).
