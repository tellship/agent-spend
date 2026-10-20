---
description: Show the Claude Code token spend report for this project
allowed-tools: Bash(bash "${CLAUDE_PLUGIN_ROOT}/scripts/spend.sh":*)
argument-hint: [agent|task] [N]
disable-model-invocation: true
---

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/spend.sh" $ARGUMENTS`

Print the output above verbatim in one fenced code block. Add nothing else.
