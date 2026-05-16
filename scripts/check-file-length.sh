#!/usr/bin/env bash
#
# Claude Code hook: warn when a file Claude just wrote grew past the limit.
#
# The rule this enforces is in CLAUDE.md: a file nobody can read in one sitting
# hides its own bugs. The hook never blocks - it hands the model a note, so the
# split happens in the same turn instead of in a review three weeks later.
#
# Reads the hook payload on stdin, prints JSON on stdout (or nothing).
set -uo pipefail

LIMIT="${CLAUDE_MAX_FILE_LINES:-1000}"

file="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty' 2>/dev/null)"
[ -n "$file" ] && [ -f "$file" ] || exit 0

case "$file" in
  # Generated, vendored or data files - splitting them would be nonsense.
  */node_modules/*|*/@cds-models/*|*/gen/*|*/coverage/*|*package-lock.json|*.csv|*.properties|*.png|*.svg)
    exit 0
    ;;
esac

lines="$(wc -l < "$file" | tr -d '[:space:]')"
[ "$lines" -le "$LIMIT" ] && exit 0

message="$(basename "$file") has $lines lines (limit $LIMIT). Split it into modules with names that say what they do - see CLAUDE.md."
jq -nc --arg m "$message" \
  '{systemMessage: $m, hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
