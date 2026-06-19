# ADR 0002: Claude Config Architecture

Date: 2026-06-17

## Status

Accepted.

## Decision

Use root `CLAUDE.md` as the concise auto-loaded project contract, `.claude/settings.json` for real Claude Code settings, `.claude/agents/` for focused subagents, `.claude/commands/` for slash-command workflows, and `.claude/hooks/` for deterministic local gates.

## Rationale

- `CLAUDE.md` is loaded at session start, so core rules belong there.
- Long procedures are cheaper and clearer as linked docs.
- Settings should contain enforceable permissions and hooks, not a custom reference schema.
- Agents and commands give repeatable review/test/audit workflows without bloating every session.
- PowerShell hooks match the Windows-first project and local developer environment.

## Consequences

- The canonical local gate is `npm run ship`.
- The admin dashboard is documented as Vite React, matching the codebase.
- FFmpeg integration is documented as direct `ffmpeg-static`/`ffprobe-static` usage.
- Supabase repository support is documented as an optional backend path.
- Future config changes should run the skills health check before merge.
