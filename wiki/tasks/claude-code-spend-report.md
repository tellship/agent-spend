---
title: claude-code-spend-report
status: done
last_updated: 2026-10-19
---

# claude-code-spend-report

Conventions borrowed from the ai-spend-guard-theme task page (wiki/tasks/ai-spend-guard-theme.md).

## Feature

User need (verbatim intent): "As a customer of Claude Code, I want to see where I spent the most tokens. Agent-wise and task-wise."


Integration model: NO integration with Claude Code. A separate local program reads the files Claude Code already writes. Optional later (out of scope now): /spend skill, status line. Nothing leaves the machine; message text is never read or printed.

CLI name is a placeholder: `spend-report`.

## Explorer findings (verbatim)

Verbatim facts; structure only, verified on real files in this project.

- Line types: attachment, assistant, user, queue-operation, last-prompt, mode, permission-mode, atis-latch, system, file-history-snapshot, agent-setting, ai-title, cost-state.
- Usage only on `assistant` lines: message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cache_creation{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}, service_tier, speed, inference_geo, output_tokens_details{thinking_tokens}, server_tool_use{web_search_requests, web_fetch_requests}}. Model: message.model (seen: claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5); also requestedModel.
- DUPLICATES: streaming writes one line per content block; each repeats the same message.id and requestId. Last line per group has the max output_tokens. Dedupe key (message.id, requestId), keep LAST line. Raw sums double-count (snapshot: output 104,663 raw vs 47,141 deduped; cache_creation 718,579 vs 269,792; cache_read 3,457,364 vs 1,430,722).
- Metadata on usage lines: sessionId, cwd, gitBranch, entrypoint, version, timestamp, uuid, parentUuid, isSidechain, agentId (subagent lines only), requestId, userType, attributionAgent, requestedModel, effort, advisorModel. No slug/task/feature key anywhere.
- Subagents: separate files; lines have isSidechain:true and agentId; their sessionId equals the parent session UUID (280/280). meta.json keys: agentType, description (free text written by the lead), toolUseId (points to the parent Agent tool_use), spawnDepth, requestShape, requestNonInteractive.
- Cost: no per-line cost. Only `cost-state` lines (per session): totalCostUSD, modelUsage{model: {inputTokens, outputTokens, thinkingTokens, cacheReadInputTokens, cacheCreationInputTokens, webSearchRequests, costUSD}}, hasUnknownModelCost, totalAPIDuration, etc. Use as a cross-check, not per-agent.
- Other: ~/.claude/stats-cache.json is global and lags (do not use).
- NOT VERIFIED: (a) whether the lead's own usage lines already include subagent tokens (double-count risk); (b) gitBranch value stability (not needed for agent/task views); (c) contents of attachment lines. A live session's file is still being written (last line may be truncated).
- Format is an undocumented internal interface: may change between Claude Code versions.

## Acceptance criteria

Lead-written; no UI involved. Verbatim, grouped by slice.

Defaults: reads the project dir derived from the current working directory (cwd with "/"->"-" under ~/.claude/projects/). THIS PROJECT ONLY; no all-projects mode.

### Slice 1: `spend-report --by agent`

- 1.1 Given a project with session and subagent transcripts, when I run `spend-report --by agent`, then I see a table: Agent | Requests | Input | Output | Cache read | Cache write | Est. cost | Share, one row per agentType plus a row "lead" for the main-session lines and a row "advisor" for advisor-model usage, sorted by Est. cost descending when every row is priced (otherwise by total tokens, and the output says which sort was used), with a TOTAL footer.
- 1.2 Given a response written on several lines (same message.id + requestId), then it counts once, using the last line for that key.
- 1.3 Given usage lines inside <sessionId>/subagents/agent-<id>.jsonl, then they are attributed to the agentType in the matching meta.json; lines in the main session file go to "lead". If a subagent's usage is also present in the lead's lines, it is not counted twice (proven by a fixture).
- 1.4 Given a model in the price table, then cost = tokens x per-model rates, with cache writes priced separately for the 5m and 1h tiers and cache reads at their own rate. Given a model not in the table, then its row shows "unpriced", it is excluded from the cost total, a warning is printed, and the exit code is 0.
- 1.5 Given a session file whose last line is truncated (live session), then that line is skipped, the report says "1 incomplete line skipped", and the tool does not crash.
- 1.6 Given any run, then no message text, prompt, tool input or output, and no meta.json `description`, is printed in this slice. The tool makes no network requests and writes no files.
- 1.7 Given the project has no transcripts, then it prints a clear message naming the directory it looked in and exits with code 2.
- 1.8 Given sessions that have a cost-state line, then the report prints one aggregate coverage line ("transcripts account for X% of recorded session cost"), plus a per-session reconcile line (our estimated total vs totalCostUSD and the percentage difference, with a warning) only for sessions above 5%. Sessions without a cost-state line are counted in a "skipped" note. With null prices, it prints "n/a (prices unverified)".
- 1.9 Given a response whose lines together carry N advisor `server_tool_use` blocks (collected across ALL lines of its dedupe group, by block id) while the kept last line has M < N `advisor_message` iterations, then both views print one warning: "K advisor calls have no usage record; the advisor row is a lower bound." (K = N - M summed over responses). Given N == M everywhere, no warning. Only block type and id are read, never content; the canary and no-text guarantees (1.6) still hold.

### Slice 2: `spend-report --by task`

- 2.1 Given the project, when I run `spend-report --by task`, then there is one row per subagent invocation: description (from meta.json) | agentType | Requests | tokens | Est. cost, plus one "lead" row per session; sorted by Est. cost descending when every row is priced (otherwise by total tokens, and the output says which sort was used). Advisor tokens stay with the row whose line carried them.
- 2.2 Given `--top N`, then only the N most expensive rows are shown, with a line for the remainder ("+K more, $X").
- 2.3 Given a description longer than the terminal width (`process.stdout.columns`, then the `COLUMNS` env var, then 80 when not a TTY; `tput` is not used because child_process is forbidden; e2e sets COLUMNS), then it is truncated with an ellipsis and the table does not wrap.
- 2.4 Given a delegation whose meta.json is missing or has no description, then the row is labelled "(no description)" and the tool still runs.
- 2.5 Given the deduped rows, then the sum of --by task equals the sum of --by agent equals the TOTAL from slice 1, on the TOKEN columns (Input, Output, Cache read, Cache write; cost later). Requests is NOT part of this invariant: in --by agent TOTAL Requests counts advisor iterations, while in --by task advisor tokens ride on the carrying row.

### Slice 4: readable lead labels

- 4.1 Given a session file with one or more `ai-title` lines, when I run `spend-report --by task`, then that session's lead row shows "<title> (<first 8 chars of sessionId>)", using the LAST ai-title line.
- 4.2 Given a session with no ai-title line, then the lead row shows "<YYYY-MM-DD HH:MM> · <gitBranch> (<8-char id>)" from the session's first timestamp and gitBranch (date only if no gitBranch).
- 4.3 Given `--by agent` per-session reconcile warnings, then they use the same label instead of the bare id.
- 4.4 Given any run, the ai-title is the only message-derived text printed (amends 1.6); control characters are stripped from it, it is truncated per 2.3, and a canary in prompts, assistant text, tool input/output and meta description is still never printed.
- 4.5 The token and cost sum invariant of 2.5 is unchanged, and the 8-char id stays visible after truncation.

## Out of scope

All-projects mode, grouping delegations into features/branches/hook tags, inference, a /spend skill, a status line, live watching, a web UI, any network or telemetry.

## Constraints

- Test fixtures are SYNTHETIC JSONL written for the tests. Never copy real transcripts (they contain prompts).
- Price table lives in one data file with a "last verified" date; do not invent prices: the programmer must tell the user which prices are placeholders and where they must be filled from the official price page.
- Defaults from the earlier ai-spend-guard-theme task apply: TS/Node/Vitest to match rates-app if a stack is chosen (Node >=20.19, TS ^5.9, Vitest ^3.2, npm, ESM). Playwright does not apply (no browser): CLI "e2e" = Vitest spawning the built CLI against a synthetic fixture dir.
- Git and npm commands go in the programmer's brief (no runner agent exists in this session). The project is a git repo (git/npm commands still go in the programmer's brief).

## Plan

S4 readable lead labels: the USER chose LABEL option C (title + date/branch fallback) and approved PLAN Option B (two slices) on 2026-10-19. Test-first required.

Status: DONE. Slice 4 (readable lead labels) closed; previous report = S1-S3 + round 2. Earlier status text follows: step 2 drafted and advisor-reviewed (2026-10-19). USER approved Option B in the 3-slice order and chose "unpriced for now" (2026-10-19). Step 3 (build): slices 1-3 DONE; build complete (S1 42c0595, ad9b799; S2 1faed48, 7f65da1; S3 b7ecd1e, fa87920, 3d88bf8; S3 round 2 8304c01; prices abd9339). S3 round 2 (criterion 1.9, 8304c01) also DONE; task COMPLETE, nothing queued (see Resume and Report).

### Options

- **Option A (smallest).** Plain Node ESM (.mjs), node:test, no build and no deps. Fastest, but no typecheck on an undocumented format.
- **Option B (recommended, middle).** TypeScript ^5.9, Vitest ^3.2, tsc build, ESM, Node >=20.19, zero runtime deps. Layout: src/{cli,projectDir,transcripts,dedupe,pricing,reportAgent,reportTask,table,guard,reconcile}.ts, prices.json at the root, test/unit, test/e2e, test/helpers/fixture.ts (synthetic JSONL builder). Commands: `npm install`; `npm test` (vitest run test/unit); `npx tsc --noEmit`; `npm run build`; `node dist/cli.js --by agent` (or `--by task --top 10`); `npm run test:e2e` (build, then vitest run test/e2e, which spawns the CLI with HOME set to a temp fixture root). ~550 LOC source, ~700 tests.
- **Option C (largest).** B plus zod, golden-file tests, an npm bin/npm link, and a perf fixture generator. Overreach: packaging and a runtime dep beyond the criteria. ~30% more code.

Recommended: Option B.

### Slices

The programmer's original 8 slices (V1-V8) were collapsed into 3 (advisor). Each slice must work on this session's live file; a lead-only report would answer the user's question wrongly; fewer stops.

- **S1 `--by agent`, tokens only, on real data.** Lead, subagents by agentType, and an `advisor` row; cost shown as "unpriced". Closes 1.2, 1.3, 1.5, 1.6, 1.7 and the rows/columns of 1.1. Includes the live-file guard (a truncated last line must not throw) and the format guard (shape-based warnings; max Claude Code version seen vs "tested up to 2.1.296"). Extra test: on real data, the kept last line of each dedupe group carries the complete usage.iterations array.
- **S2 `--by task`.** One row per delegation plus a lead row per session; --top N; width truncation. Closes 2.1-2.5, in tokens.
- **S3 pricing + reconcile.** Est. cost, Share, TOTAL, the unpriced row and warning, the 5m/1h/cache-read split. Closes 1.4 and 1.8 and completes 1.1. Last because it waits on the user filling prices.json; that wait blocks nothing before it.

#### S1 result (2026-10-19): DONE

- Commits: 42c0595 (wiki/, mockup/, .gitignore, scaffolding incl. prices.json with all-null rates); ad9b799 (slice 1: src/, test/, lockfile, plus .claude/agent-memory/programmer/ with 2 structural notes; the lead verified they hold no transcript text and no key).
- Verified: .claude/settings.local.json is untracked and ignored (.gitignore:4).
- Tests: npm test 20 passed (19 run.test + 1 forbiddenImports); npm run test:e2e 2 passed; tsc --noEmit exit 0; build exit 0.
- Closed: 1.2, 1.3, 1.5, 1.6, 1.7, and the rows/columns of 1.1 (incl. the advisor row). The cost column shows "unpriced".
- Review basis: the programmer's report and test results. The advisor did NOT read the diff line by line.
- Playwright does not apply (CLI). The Vitest e2e spawns the built CLI on a synthetic fixture.
- The "Status?" pings every 5 minutes could not be sent (no way to message a running agent); results were checked on completion.
- Real-data table at the time of the run (the live session grows, so numbers drift):

| Agent | Requests | Share |
|---|---|---|
| lead | 37 | 44.6% |
| programmer | 40 | 29.4% |
| scribe | 42 | 15.6% |
| explorer | 15 | 6.3% |
| advisor | 3 (173,100 input, 17,080 output, no cache) | 3.3% |
| uxer | 2 | 0.8% |

- TOTAL: 139 requests; input 173,404; output 123,820; cache read 4,887,513; cache write 503,497.
- Share is of total tokens, dominated by cache reads (the cheapest tokens), so the ranking will reorder once priced.
- Programmer's choices: TOTAL Requests counts advisor iterations (139 = 136 responses + 3); incomplete line = any unparseable line; only agentType is read from meta.json; warnings go to stdout; the no-transcripts error goes to stderr with exit 2; terminal width deferred to S2.
- Real-data probe (one-off, not a repo test): 0 of 113 dedupe groups had a kept last line with a shorter iterations array than an earlier line; 0 groups had a message-iteration output sum differing from the top-level output; 40 groups have no iterations; 0 keys appear in more than one file; 0 synthetic or missing-requestId lines today.
- Open risks:
  1. Dedupe is per session. A resumed or forked session that copies earlier lines would double-count (no overlap today, unproven).
  2. The format is undocumented, covered only by the shape guard and the hand-bumped "tested up to 2.1.296" constant.
  3. The sort by total tokens is dominated by cache reads.
  4. prices.json rates are all null; the USER must fill them.
  5. Reconcile (1.8) is not built; it is S3.
  6. rowsByAgent is keyed by agent label only, so S3 needs per-(agent, model) buckets and per-advisor-model buckets (a rework).
- Test-first note: S1 was NOT strictly test-first. Most tests were written after the code. Only the dedupe, empty-dir and subagent-attribution tests were seen failing first; the dotted-path test was shown able to fail via a mutation. About 15 mutations were each caught by a test. The S2 brief requires the programmer to show EACH test failing before writing its code.

First failing test of S1 (through run(), synthetic fixture): HOME=<tmp>; project dir for the fake cwd /work/demo; session s1.jsonl with 3 assistant lines for message.id m1/requestId r1 (output_tokens 5, 9, 12; input 100; cache_read 1000; cache_creation 200), 1 assistant line m2/r2 (output 7, input 50) and 1 user line. Expect: exit 0; lead row Requests 2, Input 150, Output 19 (not 33), Cache read 1000, Cache write 200; TOTAL equal to the lead row.

Later S1 tests: empty dir exits 2 naming the path; dotted-path mangling; a `<synthetic>` line without requestId is skipped; a canary string never appears in stdout; the fixture root is unchanged after a run; no network imports.

Cross-cutting tests: canary string in message text, tool output and meta.description is never printed; no files written; source does not import http, https, net, fetch or child_process; sum invariant (task sum = agent sum = TOTAL).

#### S2 result (2026-10-19): DONE

- Commit: 1faed48 (Add spend-report --by task (slice 2, tokens only)).
- Review basis: the advisor reviewed the actual diff this time (lead ran `git show 1faed48`), not just the programmer's report.
- Checks on the diff: wiki/ and .claude/settings.local.json not staged; agent-memory note holds structure only.
- Mention only: the unused `LEAD` import in reportAgent.ts predates S2 (already unused in ad9b799). Left untouched.
- Closed: 2.1, 2.2, 2.4, 2.5. 2.3 closed at >=78 columns (documented limit).
- CLI e2e = Vitest spawning the built CLI with COLUMNS set: 4 passed. Playwright n/a (CLI).
- Departure #2: S2 was NOT test-first (see decision log (v)).
- Open risks (S2):
  1. FIXED in 7f65da1 (2026-10-19). The lead label `lead (<8 chars>)` was cut to `lead (0a2…` at 80 columns, so sessions could look alike. The Agent cell already says "lead", so the prefix was dropped and all 8 id characters show. Minor note: label() is also the sort tie-break key, so a lead id prefix could theoretically collide with a description (cosmetic).
  2. Real-TTY width path is unit-tested only.
  3. Wide characters count as 1 column.
  4. `agentType` is unsanitised in --by agent (predates S2).
- Follow-up fix 7f65da1 (2026-10-19): lead rows in --by task now show the bare 8-char session id prefix (the `lead (` prefix was redundant with the Agent column and was cut at 80 columns). Unit 42 passed, e2e 5 passed, tsc and build clean; real project at COLUMNS=80 shows 2 distinct 8-char lead labels. Red seen first for the unit test; the e2e test was confirmed red only afterwards (stash check), no behaviour added ahead of its test.

#### S3 result (2026-10-19): DONE (commits b7ecd1e, fa87920, 3d88bf8)

- Commit: b7ecd1e "Add pricing and cost-state reconcile (slice 3)". New files: src/pricing.ts, src/reconcile.ts; tests pricing, cost.
- Checks: unit 68 passed; e2e 10 passed; tsc 0; build 0.
- Design (as advisor decided, decision log (aa)):
  - Each deduped call is priced at its own model into the row that carries it. No per-model buckets.
  - Haiku-only over100k tier; boundary > 100,000 on input + cacheRead + cacheWrite of that call.
  - Cache tiers clamped, with 1h taken first, 5m clamped; the remainder is priced at the 5m rate with a warning.
  - A partly unpriced row shows "unpriced"; TOTAL sums the priced calls.
  - Sort and Share use cost only if every row is priced; otherwise tokens.
  - Reconcile runs only in --by agent: last cost-state line per lead file, compared vs lead + subagents + advisor of that session. Any unpriced call gives "Coverage: n/a (prices unverified)".
  - --top remainder line: "+K more, $X (included in TOTAL)".
- Advisor model seen: claude-opus-5-5 (priced).
- Review basis: the lead and the advisor read the actual source diff (git show b7ecd1e) and ran the CLI. No defects found. Note: the 1h-taken-first, 5m-clamped rule may slightly overprice.
- Real data (live file, numbers drift):
  - Est. cost TOTAL $7.03-$7.60.
  - Coverage 56.7% of recorded session cost ($5.81 estimated vs $10.25 recorded, 3 sessions).
  - Sessions: 0a2468f9 -39.1%; 134dd848 -51.9%.
  - 1 session skipped (live session, no cost-state line).
- OPEN RISK #1 (S3): the reconcile gap is large. cost-state records far more sonnet tokens than the transcripts:
  - 0a2468f9: sonnet output 154k recorded vs 72.5k; sonnet input 60.8k vs 208; opus input 426k vs 288k.
  - 134dd848: sonnet output 87.8k recorded vs 20.8k.
  - Opus rates reproduce costUSD exactly.
  - The top-3 agent order lies within the unexplained gap.
  - A numbers-only probe ran (thinking tokens, first cost-state carry-over, uniform ratio, extra files). Results: see Gap probe below.
- Note: the cost part of criterion 2.5 is weakly tested. The row-sum uses toBeCloseTo(..,1) on rounded cells, and TOTAL strings match by construction.
- Superseded: the earlier advisor line "gaps above 5% are informational" (Key findings) was based on the ~19% finding, now reconsidered.
- Test-first: NOT strictly test-first. Departure #3 (see decision log (ab)).
- **Gap probe (2026-10-19, numbers only).**
  - MEASURED:
    - cost-state lines are cumulative and byte-identical. A: 4 lines, totalCostUSD 6.167224 on all. B: 2 lines, 3.904005.
    - The last line covers the whole session. No carry-over: startTime is about 1 s before the first transcript timestamp.
    - cost-state lines sit at the end of the lead file.
    - Lead responses are finalized (stop_reason set). Most SUBAGENT responses are unfinalized streaming snapshots (stop_reason null, tiny output_tokens, large content). A sonnet: 41 such messages = 350 output tokens. B sonnet: 65 = 552.
    - Duplicate lines differ only in output_tokens, never in input or cache.
    - Advisor: A has 8 advisor server_tool_use blocks, only 4 with an advisor_message iteration. B has 4 and 1. The missing ones (4 and 3) are in subagent files and have no iterations at all.
    - Transcript output as share of recorded: A sonnet 47%, A haiku 68%, A opus-advisor 54%; B sonnet 24%, B haiku 84%, B opus-advisor 40%.
    - out+thinking does not close the gap (thinking is inside output_tokens; partly inferred).
    - Input ratios recorded/transcript: sonnet ~150-290x; cache read 1.4-1.6x; cache write 1.0-1.2x; non-uniform.
    - No extra transcript files for either session.
  - INFERRED (inference, not measured):
    - opus gap = missing subagent advisor calls.
    - haiku output gap ~closed by snapshot content size.
    - sonnet output = snapshots + invisible thinking.
    - sonnet fresh-input and cache-read gaps = calls cost-state counted that no transcript persists. UNVERIFIED, cause unknown.
  - Conclusion: not fixable in pricing. The undercount is one-directional: subagent rows and the advisor row are FLOORS; the lead's share is overstated.

**Round 1 (fa87920, 3d88bf8; decision log (ac)).**

- fa87920 "Warn that unfinalized responses make output a lower bound (slice 3 round 1)": ApiRequest.finalized (stop_reason is a string); diagnostics.unfinalizedLines printed in both views.
- Real-data warning: "Warning: 208 of 314 subagent responses (and 0 of 85 lead) were still unfinalized when written (no stop_reason); their output tokens, and so Est. cost, are lower bounds." The count drifts upward while subagents run.
- Per-session null stop_reason counts (kept responses): A sonnet 41/43, haiku 23/63, lead 0/42; B sonnet 65/68, haiku 7/44, lead 0/28.
- Unrounded-sum test (item C): the 2.5 cost check, rowsByAgent and rowsByTask vs totalCost, to <1e-9. It went red only on the missing rowsByTask export; its assertions were never seen failing.
- 3d88bf8 "refactor: inline usableCost into its only caller": SLAP FAIL on usableCost (one caller, one-line body); fixed by this commit. tierCount and hasCacheSplitMismatch kept: tierCount has two callers; hasCacheSplitMismatch keeps the mismatch definition beside splitCacheWrites across a module boundary.
- Test-first for round 1: red-first except item C; the fixture helper change preceded the tests (suite stayed 68/68 green); the 2 no-warning cases pass trivially.
- Checks after round 1 (lead re-ran): tsc 0, unit 81 passed, e2e 10 passed, build ok.
- Review basis: lead and advisor read the actual diffs of b7ecd1e, fa87920, 3d88bf8 (src and test helpers); agent-memory diff checked: structure only.
- Not covered by e2e: the new unfinalized warning is pinned by unit tests through run() only; no CLI e2e.

**Round 2 (8304c01; decision log (ag)).**

- Criterion 1.9 built. ApiRequest.advisorCallIds (Set) is unioned on each dedupe map.set across all lines of a key (also across lead and subagent files). diagnostics.advisorWithoutUsageLines = sum of max(0, ids - kept advisor_message count). The line is printed in both views after the unfinalized warning.
- Checks (lead re-ran): tsc 0, unit 91 passed, e2e 11 passed, build 0.
- Review basis: lead and advisor read the actual src and test diff of 8304c01. Agent-memory diff checked: structure only. The lead also read the e2e diff (test/e2e/cli.test.ts): it asserts the exact warning line in both views against the built CLI and adds no named function.
- Real data: 14 advisor calls without usage on the whole project (25 ids, 11 records).
- Independent per-session check via hard-linked scratch HOME: session 0a2468f9 K=4 (8 blocks, 4 records); session 134dd848 K=3 (4 blocks, 1 record). Correction: the first run did not capture the per-session exit codes (zsh has no PIPESTATUS). Re-measured with the exit code taken outside the pipe: both sessions exit 0, one warning line each (K=4 and K=3). They match the gap-probe measurements taken before the code existed.
- Test-first: NOT strictly. Departure #4. Three tests (the 3-line spread unit test, the e2e, the --by task variant) were seen red for the right reason. The N==M, canary, shortfall-sum and name/type-filter tests were green on arrival and covered by mutation checks (kept-line-only, dropped name/type check, dropped clamp, ignored records); each mutation turned a test red.
- Wording quirks, shipped as the criterion text says: "the advisor row" appears in --by task where no such row exists; "1 advisor calls" at K=1; no "Warning:" prefix.
- Clamp per response at 0 is the programmer's assumption.
- Ids on lines skipped before map.set (zero-token without iterations, malformed usage) are lost. None on real advisor-block lines.
- readAdvisorCallIds kept (one caller, short body) because it is the only code reading message.content, so the 1.6 never-content guarantee is auditable in one place, mirroring readAdvisorUsage.

#### S4 explorer findings (2026-10-19)

- Entry points: src/cli.ts:10, src/run.ts:48.
- Labels: built at reportTask.ts:33-35 in label() (lead -> id.slice(0,8)). The sort tie-break at reportTask.ts:51 uses label.
- Truncation: table.ts renderTable cuts from the END with an ellipsis, so an "(id8)" suffix would be lost first. Shrink floors: column 0 floor 8. printable() at table.ts:49-51.
- reconcile.ts:31 uses s.id.slice(0,8) and receives SessionInfo[] only (transcripts.ts:45-48).
- ingestFile transcripts.ts:82-115 drops non-assistant lines at line 99, so ai-title is ignored today.
- Real data: the ai-title line has keys {type, aiTitle, sessionId}; no timestamp or gitBranch on it. Only 1 of 6 real sessions has one (two identical interior lines, 34 chars). The fallback (4.2) is the common case.
- First timestamp: ISO-8601 UTC with milliseconds. It is first found on an attachment line (idx 4-5), not on the first line.
- gitBranch: present on user/assistant lines only; one value per file. "HEAD" (detached) is real; the others seen are "main".
- Tests that will change: e2e cli.test.ts:148-156 (regex `^0a2c91d4 {2,}lead`); task.test.ts:211-222.
- No fixture builder exists for ai-title.
- Canary tests: run.test.ts:245-261, task.test.ts:280-299.

#### S4 plan (2026-10-19)

Options:

- **Option A (one slice).** All of 4.1-4.5 in one slice, ~60 lines.
- **Option B (two slices, RECOMMENDED).**
  - S4.1 `--by task` labels. Closes 4.1, 4.2, 4.4 and 4.5.
    - LeadFacts are read inside ingestFile with no second file read: last ai-title, first timestamp, first gitBranch.
    - SessionInfo gains title, startedAt and gitBranch.
    - New src/sessionLabel.ts with sessionLabel() and cutSessionLabel().
    - Optional `cut` hook on table.ts FitOptions, applied to lead cells only.
    - formatTaskReport gains a sessions param.
  - S4.2 reconcile warnings use sessionLabel. Closes 4.3 (one-line change plus test).
- **Option C (three slices).** Title, fallback, reconcile. More ceremony than value.

Label rules:

- Width ladder: the lead cell shows "<head>… (id8)" when the column is wide enough, else the bare id8 (today's output). The id is always visible (4.5). The closed 2.3 limit (>=78 columns) is untouched.
- Titles are readable from roughly 95-100 columns. At 80 columns lead rows look as today.
- Ladder threshold: fall back to the bare id when the head would be under ~8 characters (not at width 14).
- Timestamps are formatted in LOCAL time as YYYY-MM-DD HH:MM. Tests pin TZ in the e2e spawn env and the vitest env. Keep a 23:30Z rollover test.
- Last ai-title wins. A non-string title, or one empty after printable(), counts as absent.
- gitBranch "HEAD" is printed as is, via printable().
- Branch without timestamp gives "<branch> (id8)". No title and no timestamp gives the bare id8.
- No 80-character title cap.

Advisor note: the width limit is the existing 2.3 limit (decision (u)), not a new defect. It goes into the plan-approval message.

Optional follow-up, not S4: compact number formatting (e.g. 24.8M) to free width. This would change the token columns and the 2.5 tests.

#### S4.1 result (2026-10-19): DONE (commit b9a9f12)

- Closed 4.1, 4.2, 4.4, 4.5 (4.3 = S4.2, pending).
- Checks (lead re-ran): unit 110 passed; e2e 12 passed (exit 0); tsc 0.
- Files: new src/sessionLabel.ts; changed src/transcripts.ts (LeadFacts, one file read), src/table.ts (renderTable cut hook), src/reportTask.ts, src/run.ts, vitest.config.ts (TZ=Asia/Kolkata), tests, agent-memory note (structure only). No wiki or .claude/settings.local.json staged.
- Live output:
  - COLUMNS=140: lead rows like "2026-10-19 17:00 · HEAD (0a2468f9)"; the only titled session is "AI Spend Guard product exploration (32a70518)".
  - COLUMNS=100: head cut "2026-10-19 17:00 ·… (0a2468f9)", id visible.
  - COLUMNS=80: bare id8, as before.
  - Titles and stamps show from ~88 columns.
- Test coverage (lead and advisor read the test diff):
  - last title wins; non-string, control/bidi and empty titles;
  - 23:30Z rollover to the next day in Asia/Kolkata;
  - HEAD printed as is; stamp without branch; branch without stamp; neither gives bare id;
  - width 80: lines <=80; mid-width ellipsis keeps the id tail; 8-char threshold;
  - canary in prompt, assistant text, tool input/output and meta description is never printed, while the title is;
  - e2e sets TZ.
- Review basis: lead and advisor read the source diff and the test diff and re-ran checks.
- Process: the programmer hit its 60-turn limit and sent NO report, but had committed b9a9f12.
- Test-first: UNVERIFIED (no report). Departure #5. Never describe S4.1 as test-first.
- SLAP verdicts printed by the lead, all ok: pad2; localStamp (kept deliberately: one caller, but inlining would bury the date template in the label decision); sessionLabel; cutSessionLabel; renderTable; ingestFile; loadProject; formatTaskReport; the label and cut closures.
- Open risks:
  1. Titles only show from ~88 columns. Optional follow-up: compact numbers to free width.
  2. Local-time tests rely on the pinned TZ.
  3. The label and cut closures index rows by position.
- For the S4.2 brief: tell the programmer to commit and report EARLY (turn limit). It must flip the run.test.ts assertion that `--by agent` prints no title, and update the reconcile warning string in the e2e tests.

#### S4.2 result (2026-10-19): DONE (commits c1efc1a, 5a71c6a; round 1 of 2 used)

- Facts:
  - c1efc1a: `reconcileLines` takes a width and builds "Warning: session <label> estimated … vs recorded … (±N%)." from sessionLabel, cut with cutSessionLabel when the label does not fit.
  - src/reportAgent.ts and src/run.ts pass the width (default 80).
  - Aggregate coverage line and "skipped" note unchanged.
  - Lead re-ran: unit 115 passed, e2e 12 passed, tsc 0.
- Test-first: 4 new tests in test/unit/cost.test.ts were seen red for the right reason (bare id). They went red AGAIN on the first implementation because they ran at the default 80 columns, and were re-targeted to widths 120 / 100 / 90. The bare-id fallback test at widths undefined/80/60 was NOT red-first. The comment change in the run.test.ts canary test was not red-first. Mostly red-first, NOT strictly. Departure #6.
- (as) Advisor: the 80-column behaviour (reconcile warning shows bare id8; titles/stamps appear from ~90-100 columns because the fixed part of the line is ~63 chars and MIN_HEAD is 8) is NOT a defect. Criterion 4.3 says "the same label", and the approved plan defines that label with the width ladder. Recorded as a known limitation; no escalation.
- Lead checks: the `?? label` fallback in reconcile.ts is safe (cutSessionLabel returns undefined only for a label with no " (id)" tail, i.e. a bare id). Real data, `--by agent`: reconcile lines are 69 chars at COLUMNS=80 (bare id8), 95 chars at 100 and 140 (stamp · branch (id8)). None overflows. Width pass-through works.
- (at) Advisor: the slice needs a CLI e2e for 4.3, because the e2e fixture has no title, stamp or branch, so no e2e exercised the new label. Round 1 of 2 launched to the programmer: one Vitest e2e against the built CLI asserting the exact labelled warning at COLUMNS=120 (red first), plus a fix to the stray space in the run.ts width comment.

**Round 1 (5a71c6a; decision log (au)).**

- One CLI e2e: synthetic titled session "Refactor the invoice export", $12.00 est vs $24.00 recorded. It asserts the exact labelled warning at COLUMNS=120 and the bare id8 at COLUMNS=80. Plus the stray-space comment fix in src/run.ts.
- The e2e was seen RED against the pre-c1efc1a src (old code printed the bare id), then green.
- Checks (lead re-ran): unit 115 passed, e2e 13 passed, tsc 0, build ok.
- Review basis: lead and advisor read the src diff and test diffs of c1efc1a and 5a71c6a; lead re-read formatAgentReport, run, reconcileLines in full; SLAP verdicts all ok (reconcileLines, gaps flatMap closure, formatAgentReport, run).
- The e2e fixture is per-test (beforeEach), so the new test does not leak.
- Real data, --by agent: COLUMNS=80 reconcile lines are 69 chars with bare id8; COLUMNS=100/140 are 95 chars with "stamp · branch (id8)"; none overflows.
- Closes 4.3.

### Criteria amendments (advisor)

Applied in place in Acceptance criteria: (i) 2.3 width source (process.stdout.columns, then COLUMNS, then 80 when not a TTY; not tput; e2e sets COLUMNS). (ii) 1.1 and 2.1 sort rule (est. cost when every row is priced, otherwise total tokens, and the output says which). (iii) 1.1 gains an `advisor` row; in --by task, advisor tokens stay with the row whose line carried them. (iv) 1.8 becomes one aggregate coverage line, per-session lines only above 5%, a "skipped" note, and "n/a (prices unverified)" with null prices.

### Key findings (structure-only probe)

The programmer's probe was structure-only. It also read numeric fields from 12 sessions of OTHER projects to verify these; the tool itself stays project-only.

- Lead usage does NOT include subagent tokens (~95% confidence): no (message.id, requestId) overlap between lead and subagent files; haiku appears only in subagent files yet is in cost-state; sonnet cache totals reach the cost-state figure only when subagents are added; a finished session in this project matched exactly. This resolves the Explorer's NOT VERIFIED item (a).
- Advisor tokens are NOT in top-level usage: usage.iterations[] items have type `message` or `advisor_message` (own model). Top-level equals the sum of the `message` items only. Ignoring advisors would understate opus spend badly (one session: advisor iterations were 4.37M of 5.34M opus input).
- SUPERSEDED by the Gap probe (S3 result). The earlier claim that cost-state includes "hidden small calls" (e.g. haiku 2810 in / 21 out) and that a ~19% gap is expected and informational no longer stands. The gap is one-directional (transcripts undercount) and not fixable in pricing.
- CORRECTION: the S1 iteration-completeness probe (0 of 113 dedupe groups) checked only groups that carry an iterations array. It missed advisor calls with NO iterations at all (4 in A, 3 in B; see Gap probe).
- Dedupe: the last line always has the max output; in 26 of 13,101 groups the input/cache fields differ (harmless with keep-last).
- Thinking tokens are already inside output_tokens; do not add them.
- cache_creation 5m+1h equals cache_creation_input_tokens on 41,558 of 42,244 lines (1.6% mismatch).
- 18 `<synthetic>` assistant lines have no requestId and zero tokens: skip them, and let the dedupe key fall back to uuid.
- The project dir name replaces EVERY non-alphanumeric character with "-" (not just "/"). This corrects the Explorer note above.
- Six Claude Code versions (2.1.165-2.1.296) share a stable structure.

### Price table


Answer (USER, 2026-10-19): "unpriced for now". prices.json ships with null rates; the user fills them later.

Filled 2026-10-19 by the lead from https://platform.claude.com/docs/en/about-claude/pricing (the USER supplied the URL and asked for the fill). USD per MTok, input/output/cacheWrite5m/cacheWrite1h/cacheRead:
- claude-sonnet-5-5: 2 / 10 / 2.5 / 4 / 0.10
- claude-opus-5-5: 4 / 20 / 5 / 8 / 0.20
- claude-haiku-5-5: 0.10 / 0.50 / 0.125 / 0.20 / 0.01 (the up-to-100k-prompt tier)

### Known limitations (must be handled or documented in S3)

- (a) Haiku 5.5 is priced PER REQUEST by prompt length (input + cache read + cache write of that request). Over 100,000 tokens it is 0.50 / 2.50 / 0.625 / 1 / 0.05. prices.json has one rate per model, so S3 needs an over-100k tier and per-request pricing; otherwise Haiku cost is understated for long prompts.
- (b) Ignored modifiers (decision (g)): US-only inference_geo 1.1x, Opus 5.5 fast mode ($8 input / $40 output), batch discounts.
- (c) The advisor model name is still unknown. Its rates must be added when seen.
- (d) Opus 5.5 and Sonnet 5.5 cache reads are 0.05x input, not the usual 0.1x (already in the numbers). Slices 1-2 do not depend on it. S3 waits on the fill.

#### How to provide prices

- Per model, five numbers in USD per million tokens: input, output, cacheWrite5m, cacheWrite1h, cacheRead.
- Per model also: lastVerified and sourceUrl.
- Copy the numbers from the official price page, not from memory.

### Repo setup (not a slice; no vertical cut, justified)

Write .gitignore first (node_modules/, dist/, coverage/, .claude/settings.local.json); git init; before the first add, run `git check-ignore -v .claude/settings.local.json`; confirm with `git status --porcelain` and `git diff --cached --name-only` that it is not staged (plaintext key). First commit: wiki/, mockup/, .gitignore, scaffolding; then one commit per green slice. Git and npm commands go in the programmer's brief (no runner agent exists in this session).

### Escalated to the USER (answered 2026-10-19)

1. Approve Option B in the 3-slice order (S1-S3). Answered: APPROVED.
2. The price question. Answered: "unpriced for now" (see Price table).

## Decision log

- (a) The user approved producing a PLAN for a local, this-project-only report of Claude Code token spend by agent and by task. This is not yet approval to build.
- (b) The earlier discussion concluded that feature-level grouping is unstable for assistant sessions (no label in the data). So v1 reports by agent and by delegation only; labels, hooks and inference are deferred.
- (c) "No integration": a separate local program reads files Claude Code already writes.
- (d) 2026-10-19, step 2: the programmer's V1-V8 slices collapsed into S1-S3 (advisor). Rationale: each slice must work on the live file; a lead-only report answers the user's question wrongly; fewer stops.
- (e) 2026-10-19: criteria amended per advisor (i)-(iv): 2.3 width source; 1.1 and 2.1 sort rule; 1.1 `advisor` row and 2.1 advisor attribution; 1.8 aggregate coverage line. Applied in place under Acceptance criteria.
- (f) Advisor tokens are counted at their own model, with a separate `advisor` row in --by agent. Rationale: folding them into lead would hide likely the biggest spend.
- (g) Modifiers speed, service_tier, inference_geo and fallback_credit are ignored; recorded as a known limitation.
- (h) The cache-split remainder is priced at the 5m rate, with a count warning.
- (i) A missing meta.json shows "(unknown agent)".
- (j) Tooling is tsc only, no ESLint. Run as `node dist/cli.js` from the project root; no npm link; no --since. The check:prices script is dropped (the runtime warning satisfies the constraint). The agent-memory question is dropped (nothing there).
- (k) Repo setup as in Plan: .gitignore first, git init, `git check-ignore` before the first add.
- (l) Escalated to the USER: approve Option B in the 3-slice order; the price question. Both answered 2026-10-19 (see (m) and (n)).
- (m) 2026-10-19: the USER APPROVED Option B in the 3-slice order (S1-S3). Build starts at step 3.
- (n) 2026-10-19: the USER chose "unpriced for now". prices.json ships with null rates; the USER fills them later from Anthropic's official price page. Slices 1-2 do not depend on it; S3 waits on it.
- (o) 2026-10-19: S1 brief to the programmer: git init as build step 0, with .gitignore written first so .claude/settings.local.json is never staged; one commit at the end of the slice.
- (p) 2026-10-19: S1 done (commits 42c0595, ad9b799). Closed 1.2, 1.3, 1.5, 1.6, 1.7 and the rows/columns of 1.1. Results and open risks under "S1 result" in Slices. Cost shows "unpriced".
- (q) 2026-10-19: S1 was not strictly test-first (see S1 result, test-first note). Recorded as a departure; not to be described as strictly test-first.
- (r) 2026-10-19: criterion 2.5 pinned. The sum invariant between --by task and --by agent is on the TOKEN columns (and later cost), NOT on Requests, because in --by agent TOTAL Requests counts advisor iterations while in --by task advisor tokens ride on the carrying row. Applied in place under Acceptance criteria.
- (s) 2026-10-19: terminal width deferred to S2 (criterion 2.3).
- (t) 2026-10-19: Session restarted via the task slug; this counts as the USER's answer "restart and continue" to the slice-1 handoff question. Slice 2 (`--by task`) starts now. Explorer is not re-run.
- (u) 2026-10-19: criterion 2.3 closed at >=78 columns (documented limit; at 80 columns the description gets ~10 chars). Advisor decision: S2 ships with a note. Do NOT drop the Est. cost column or merge the Agent column: 2.1 names both, and S3 restores them.
- (v) 2026-10-19: S2 was NOT strictly test-first. This is departure #2 (S1 was #1), despite an explicit instruction. Mutation checks show the tests can fail. Do not describe S2 as test-first.
- (w) 2026-10-19: S2 closed (commit 1faed48; see "S2 result"). The lead-label tweak (drop the `lead (<8 chars>)` prefix so all 8 id characters show) was NOT done; no extra round. Recorded as an optional open risk.
- (x) 2026-10-19: at the USER's request the lead-label fix was done (7f65da1) and the wiki page committed (1c5170b). Supersedes the "not done" part of (w).
- (y) 2026-10-19: prices.json filled for claude-sonnet-5-5, claude-opus-5-5 and claude-haiku-5-5 (values in Price table). Committed in abd9339. The "unpriced for now" answer (n) is superseded for these models. Advisor model still unpriced (limitation (c)).
- (z) 2026-10-19: Session resumed via slug claude-code-spend-report; counted as USER's "continue" to the slice-2 handoff question (same as decision (t)). Step 3, slice 3 (pricing + reconcile) starting. Explorer not re-run.
- (aa) 2026-10-19: Advisor S3 design: price each deduped request (message part at message.model, each advisor_message at its own model) into the row already carrying the tokens, so no per-(agent,model) bucket rework (open risk 6 largely moot); Haiku over-100k tier as optional over100k block for haiku only; partly unpriced row shows "unpriced", TOTAL sums priced pieces, sort/Share fall back to tokens; cost-state = last line per session vs lead+subagents+advisor; --by task gains Est. cost and --top remainder $; advisor model names to be listed from real data, never guessed. Programmer launched in background for S3 with strict red-first reporting.
- (ab) 2026-10-19: S3 was NOT strictly test-first. This is departure #3 (S1 #1, S2 #2). Stubs and test helpers were written before tests. 3 tests never went red (parsePrices empty-doc, no-price-table unpriced, reconcile agent-only). 5 new e2e tests were written after the code; red was confirmed afterwards against the old dist. 7 mutations were caught. Never describe S3 as test-first.
- (ac) 2026-10-19: Advisor, step 4/7: gap is detectable but not fixable in pricing; ship S3 with round 1 of 2 = a structure-only warning that unfinalized responses (null stop_reason) make output a lower bound (+ advisor-without-usage warning only if cheap), plus tighter unrounded 2.5 cost check and a SLAP check of usableCost/tierCount/hasCacheSplitMismatch. Fits S1's approved shape-based warnings; no user escalation needed.
- (ad) 2026-10-19: No round 2. The "advisor calls with no usage record" warning is NOT built. A correct count needs per-key advisor block ids collected across ALL lines of a response (blocks sit on earlier lines; a kept-line check is wrong: ai-spend lead 9 blocks across lines vs 1 on kept lines), which touches the dedupe path. Consequence: the advisor row (top row at $2.67) is a floor with no warning on screen; subagent-carried advisor calls without usage were 4 of 8 in session A, 3 of 4 in B. Offered to the USER as a follow-up (round 2 candidate / slice 4).
- (ae) 2026-10-19: Departure #3 plus round 1 recorded. Never describe S3 as test-first.
- (af) 2026-10-19: Session resumed via slug claude-code-spend-report. Advisor ruled the advisor-calls-without-usage warning (decision (ad)) is new scope: it closes no existing criterion, touches the dedupe path, and was offered to the USER as optional. Escalated to the USER: build it (adds one new criterion) or close the task. Waiting on the answer. Explorer not re-run.
- (ag) 2026-10-19: The USER answered 'build it' to the build-or-close question (decision (af)). Criterion 1.9 added by the lead; built as S3 round 2 (the '2 rounds max' limit is not exceeded: round 1 was fa87920). Programmer launched with strict red-first and a CLI e2e test; the red-first fixture spreads advisor blocks across lines with the kept line carrying fewer (decision (ad) trap). Supersedes the 'not built' part of (ad).
- (ah) 2026-10-19: Round 2 done (8304c01). Departure #4 (not strictly test-first; see Round 2). Supersedes the 'no warning on screen' consequence in (ad): the advisor row's floor status is now printed. Wording quirks accepted (advisor decision).
- (ai) 2026-10-19: USER reported that the `lead` rows in `--by task` show only an 8-char session id (e.g. 0a2468f9) and asked for human-readable text. Lead offered A title / B date+branch / C both / D user labels; USER chose C. This amends criterion 1.6: the session `ai-title` is the ONLY message-derived text allowed to be printed, in the lead-row label only. Criteria added as Slice 4 (4.1-4.5). Status reopened to in-progress.
- (aj) 2026-10-19: Explorer hand-back received (see "S4 explorer findings"). Programmer asked for a read-only plan with 2-4 vertical-slice options. Open questions: last-vs-first title; which timestamp; UTC vs local; keep id8 on truncation.
- (ak) 2026-10-19: Advisor: the width limit is the existing 2.3 limit (decision (u)), not a new defect. It goes into the plan-approval message. Optional follow-up, not S4: compact number formatting (e.g. 24.8M) to free width; this would change token columns and the 2.5 tests.
- (al) 2026-10-19: Advisor decided: timestamps are formatted in LOCAL time (a plain YYYY-MM-DD HH:MM reads as the user's clock; UTC would roll the date over in the evening). Tests pin TZ in the e2e spawn env and the vitest env; keep a 23:30Z rollover test. Supersedes the programmer's UTC recommendation.
- (am) 2026-10-19: Advisor decided: drop the programmer's proposed 80-character title cap (not in the criteria; real titles are 34 characters; speculative guard).
- (an) 2026-10-19: Ladder threshold: fall back to the bare id when the head would be under ~8 characters (not at width 14).
- (ao) 2026-10-19: Programmer's other recommendations kept: last ai-title wins; non-string or empty-after-printable title counts as absent; gitBranch "HEAD" printed as is, via printable(); branch without timestamp gives "<branch> (id8)"; no title and no timestamp gives the bare id8.
- (ap) 2026-10-19: USER approved plan Option B with local-time fallback date and no title cap (as in (al), (am)). Build step 3 starts: S4.1 `--by task` labels (4.1, 4.2, 4.4, 4.5); S4.2 reconcile (4.3) follows after S4.1 passes review and tests.
- (aq) 2026-10-19: S4.1 closed (commit b9a9f12; see "S4.1 result"). Departure #5: S4.1 test-first is UNVERIFIED (programmer hit its turn limit with no report). Never describe S4.1 as test-first.
- (ar) 2026-10-19: Session resumed via slug claude-code-spend-report; counted as the USER's "continue" to the S4.1 handoff question (same as (t), (z)). Step 3, slice S4.2 (reconcile warnings use sessionLabel; closes 4.3) starting. Explorer not re-run.
- (as) 2026-10-19: Advisor: the 80-column behaviour of the S4.2 reconcile warning (bare id8) is NOT a defect; criterion 4.3 "the same label" and the approved plan's width ladder define it. Recorded as a known limitation (see "S4.2 result"); no escalation.
- (at) 2026-10-19: Advisor: S4.2 needs a CLI e2e for 4.3 (the e2e fixture has no title, stamp or branch). Round 1 of 2 launched to the programmer: Vitest e2e against the built CLI at COLUMNS=120 asserting the exact labelled warning (red first), plus the run.ts width comment spacing fix.
- (au) 2026-10-19: S4.2 closed after round 1 (5a71c6a). Step 7 advisor check done; no defects.

## Resume

- Task COMPLETE (2026-10-19). Slice 4 closed: S4.1 b9a9f12; S4.2 c1efc1a + 5a71c6a. Nothing queued.
- Handoff line "Slice 4.2 done. Resume point current... Restart or continue?" posted.
- Optional follow-up only, not queued: compact number formatting (e.g. 24.8M) to free width. It would change the token columns and the 2.5 tests.
- Delivered before Slice 4: S1, S2, S3, and S3 round 2 (8304c01). Wiki commit: fe7ac91.

## Report (Slices 1-4; S1-S3 + round 2 were the earlier report)

Final report (2026-10-19). Shipped per slice:

- S1 `--by agent` (tokens): 42c0595, ad9b799.
- S2 `--by task` (tokens): 1faed48; lead-label fix 7f65da1.
- S3 pricing + reconcile: b7ecd1e; round 1 fa87920 and 3d88bf8. Prices fill: abd9339.
- S3 round 2: 8304c01 (criterion 1.9).
- S4.1 readable lead labels in `--by task`: b9a9f12.
- S4.2 reconcile warnings use the same label: c1efc1a; round 1 5a71c6a.

Test results: unit 115 passed; e2e 13 passed; tsc 0; build 0.

Step 7: advisor-consulted; no defects found.

MAIN RISK: Coverage: transcripts account for 56.7% of recorded session cost ($14.17 estimated, $24.97 recorded, 6 session(s)). Reconciled gaps: 0a2468f9 -39.1%, 134dd848 -51.9%, 1bb28f3c -24.9%, 2e85631c -46.6%, 3032872b -47.8%. 1 session skipped (live, no cost-state).
- Subagent output (programmer, scribe, explorer, uxer) and advisor rows are floors: 208 of 314 subagent responses were unfinalized vs 0 of 85 lead, so the lead's share is overstated.
- The sonnet/haiku fresh-input and cache-read gap is unexplained and not assignable to a row.
- Opus rates reproduce cost-state exactly, so the rates are right.
- The advisor row is now flagged on screen: "14 advisor calls have no usage record; the advisor row is a lower bound." (verified independently: K=4 and K=3 on the two reconciled sessions). K=14 drifts while sessions run.

Other risks:

- Ignored modifiers: US-only 1.1x, fast mode, batch.
- Undocumented format (tested up to 2.1.296).
- Dedupe per session only.
- >=78 column limit; wide chars count 1; real-TTY width unit-tested only.
- Unsanitised agentType in --by agent.
- Missing prices.json throws.
- 1h-first cache clamp can slightly overprice.
- 6-7 cache-split warnings on real data.
- Playwright/browser n/a (CLI); nothing verified in a browser.
- Not covered by e2e: the unfinalized warning is pinned by unit tests through run() only.
- Round 2 wording quirks: "the advisor row" appears in --by task where no such row exists; "1 advisor calls" at K=1; no "Warning:" prefix.
- Round 2: ids on lines skipped before map.set (zero-token without iterations, malformed usage) are lost; none on real advisor-block lines.
- Slice 4 limitations:
  - Titles and stamps in reconcile warnings (and lead rows) show only from about 90-100 columns (88 for lead rows); at 80 columns the bare id8 is shown.
  - A titled reconcile warning was verified only on a synthetic e2e, because the one titled real session (32a70518) has no reconcile line.
  - Label/cut closures index rows by position.
  - Local-time tests rely on the pinned TZ.
- Nothing verified in a browser (CLI).

Test-first departures: S1 (#1), S2 (#2), S3 (#3), S3 round 2 (#4), S4.1 (#5, unverified), S4.2 (#6; mostly red-first; the round-1 e2e was seen red properly). S3 round 1 mostly red-first (see Round 1); round 2 see Round 2.
