# agent-spend

[![ci](https://github.com/tellship/agent-spend/actions/workflows/ci.yml/badge.svg)](https://github.com/tellship/agent-spend/actions/workflows/ci.yml)

A small CLI plus a Claude Code `/spend` slash command. It reads the transcripts Claude Code already writes for a project and prints token spend by agent and by task. The CLI works offline and is read-only: it opens transcript files under `~/.claude/projects/` and makes no network calls. The `/spend` command puts the CLI's report into the conversation, which is sent to the API.

## Requirements

- Node >= 22
- Claude Code

## Install

In Claude Code, in any project:

```
/plugin install agent-spend --marketplace tellship/agent-spend
```

Then run `/agent-spend:report`. It takes the same arguments as `/spend` below. The plugin ships its built `dist/`, so there is no build step. To get updates automatically, open `/plugin`, go to Marketplaces, select `agent-spend` and enable auto-update.

### From source (development)

```
git clone https://github.com/tellship/agent-spend.git && cd agent-spend
npm install
npm run build
```

Open Claude Code with this repo's root as the working directory, in a fresh session so the project command in `.claude/commands/spend.md` is picked up as `/spend`. `dist/` is committed: rebuild and commit it with any change to `src/`.

## Usage

```
/spend            # spend by agent
/spend task       # spend by task
/spend task 5     # spend by task, top 5 rows
```

An argument the CLI does not accept (for example `/spend foo`) shows the CLI usage line as a "Shell command failed" error.

The CLI can be run on its own from the project's directory:

```
node dist/cli.js --by agent
node dist/cli.js --by task [--top N]
```

`--top N` takes a positive integer and applies to `--by task` only.

## What to know

- The project is the working directory. The report reads `~/.claude/projects/<cwd with every non-alphanumeric character replaced by "-">/`. If that directory has no transcripts the CLI exits with `No Claude Code transcripts found in <dir>`.
- Each successful `/spend` run costs a model turn that re-reads the whole session context, so the cost is mostly cached context and grows with the session. One measured fresh session with 2 requests came to about 93k tokens (about $0.21 estimated), nearly all of it cache reads and writes. The report enters the conversation, which is sent to the API.
- Numbers are estimates. Some rows are lower bounds, for example output tokens of responses that were still unfinished when written. The report prints the warnings that apply.
- Rates live in `prices.json`, copied from the official price page (the file records its source URL and `lastVerified` date). Update it when prices change. A model with no entry is reported as unpriced.
- The command fixes the width at 120 columns (`scripts/spend.sh` sets `COLUMNS=120`). Run on its own, the CLI uses the terminal width, or 80.
- A stale `dist/` after editing `src/` is not detected. Rerun `npm run build` and commit `dist/`.

## Development

```
npm test              # unit tests (vitest)
npm run test:e2e      # builds, then runs the e2e tests
npx tsc --noEmit      # typecheck
```

## Not verified / limitations

- The Claude Code transcript format is undocumented and may change. Every report prints a line `Claude Code version seen (max): X; tested up to Y.` (Y is currently 2.1.296). If the highest version found in the transcripts is newer than Y, it adds a second line, `Warning: transcripts are from a Claude Code version newer than Y; the format may have changed.`
