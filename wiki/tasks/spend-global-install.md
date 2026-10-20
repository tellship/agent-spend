---
title: spend-global-install
status: open
last_updated: 2026-10-20
---

# spend-global-install

## Request
USER: "i need to install ai-spend globally". Asked to clarify (every-project /spend vs shell command on PATH), USER answered: "How do i ensure a seamless non dev involved run".

## Scope change to flag
wiki/tasks/spend-slash-command.md constrained the tool to THIS PROJECT ONLY. Global use reverses that; README "Not verified" already notes use from other projects was never run.

## Facts found (2026-10-20)
- No git remote configured. Anything another machine installs from needs a hosted repo or a published package.
- dist/ is gitignored; every current install path needs npm install + npm run build (developer steps).
- Runtime needs Node >= 20.19. Claude Code's native installer does not bring Node, so a non-dev may not have it.
- Paths are self-relative: scripts/spend.sh finds dist/ from its own location; pricing.ts reads ../prices.json relative to dist/. So the CLI runs from any cwd once built.
- package.json has no `bin` field; private: true.

## Options (increasing scope)
1. User-level command ~/.claude/commands/spend.md calling the absolute path of scripts/spend.sh. This machine only; still needs clone + build. Not non-dev.
2. Claude Code plugin in this repo (plugin manifest + commands/spend.md + committed built JS). Non-dev installs with /plugin marketplace add <repo> then /plugin install, no terminal. Needs: hosted repo, built output committed (or bundled to one file), Node on the machine. NOT VERIFIED: exact plugin manifest fields and whether ${CLAUDE_PLUGIN_ROOT} expands inside a command's ! line; check current docs before building.
3. Publish to npm with a bin, command runs npx -y spend-report. Needs npm publish (outward-facing), network on first run, Node.

Recommendation: option 2 (plugin), bundled to a single committed file so there is no build step for the user.

## USER answers (2026-10-20)
- Hosting: private GitHub repo.
- Assume Node is installed.

## Verified against docs (2026-10-20)
Sources: code.claude.com/docs/en/plugins-reference, /plugin-marketplaces, /plugins/host-marketplace.
- Manifest .claude-plugin/plugin.json; only `name` required. Names starting claude-/anthropic- are reserved.
- Marketplace .claude-plugin/marketplace.json needs name, owner, plugins[]; entry source may be the marketplace root.
- ${CLAUDE_PLUGIN_ROOT} is substituted anywhere in the Markdown body of a command. NOT stated for frontmatter (allowed-tools); must test.
- Plugin commands are namespaced: plugin `spend-report` + commands/spend.md => /spend-report:spend.
- Private repo: Claude Code runs non-interactive git with the user's own credentials. Each user needs read access to the repo AND a stored credential: an SSH key in ssh-agent, or `gh auth login` + `gh auth setup-git`. Users without a GitHub SSH key should set CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 (in-session installs and updates do not fall back to HTTPS).
- Team/Enterprise plans can distribute via claude.ai Organization settings > Plugins & skills; then user git credentials are not involved.
- Auto-update is off by default for third-party marketplaces; users enable it under /plugin > Marketplaces. Omitting `version` makes users track commits.

## Plan (proposed, not approved)
1. Commit dist/: remove dist/ from .gitignore. The package has no runtime dependencies, so tsc output runs with plain node; no bundler needed (supersedes the earlier "bundle to one file" idea).
2. Add .claude-plugin/plugin.json (name spend-report, description, author; no version) and .claude-plugin/marketplace.json (one entry, source = repo root).
3. Add commands/spend.md: same body as .claude/commands/spend.md but calling bash "${CLAUDE_PLUGIN_ROOT}/scripts/spend.sh" $ARGUMENTS. Keep .claude/commands/spend.md for in-repo dev use.
4. README: a "Install for your team" section with prerequisites (Node >= 20.19, git, repo access, stored GitHub credential) and the two commands: /plugin marketplace add <owner>/<repo>, /plugin install spend-report@<marketplace>; then enable auto-update.
5. Test first: an e2e test that runs `claude plugin validate .` and expects pass (red before step 2).

## Verification
- claude plugin validate . passes.
- After push: install from the GitHub repo on this machine (writes user settings), run /spend-report:spend in a different project, confirm the report prints.

## Risks
- Stale dist/: committed JS can drift from src/. Mitigation: rebuild before each commit; optionally a test that rebuilds and fails on git diff in dist/.
- allowed-tools with ${CLAUDE_PLUGIN_ROOT} may not substitute; users may then get a permission prompt on first run.
- Reverses the earlier THIS PROJECT ONLY scope.
- Non-devs still need GitHub repo access plus a stored credential; that is the main friction unless the org uses claude.ai org sync.
- Creating the GitHub repo and pushing is outward-facing; needs USER go-ahead.
