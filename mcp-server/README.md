# Keycard Workshop: Support Escalation MCP Server

An MCP server that lets an AI agent triage customer support tickets and escalate them to engineering as Linear issues.

It works. It is also **deliberately insecure** — that's the point. Over the workshop you'll find the leaks and fix them with [Keycard](https://keycard.ai).

## What it does

| Tool | What it does |
| --- | --- |
| `get_support_tickets` | Reads support tickets (Supabase, credential brokered per request by Keycard) |
| `escalate_ticket` | Creates a Linear issue from a ticket; an LLM writes the title, masks PII out of the body, and assigns labels first (Anthropic key brokered per request by Keycard) |
| `delete_issue` | Trashes a Linear issue |

## Prerequisites

- Node.js >= 22.9 (the npm scripts use `--env-file-if-exists`, which older Node doesn't have)
- The shared workshop Linear API key and team ID (provided by the instructor)

## Setup

```bash
npm install
cp .env.example .env
# fill in the values listed below (each one is explained in .env.example)
npm run dev
```

This checkpoint is the server as of Chapter 5, so `.env` needs:

- `LINEAR_API_KEY` + `LINEAR_TEAM_ID` — the shared workshop Linear key and team (Chapter 0)
- `KEYCARD_URL` + `MCP_RESOURCE_URL` — bearer auth on `/mcp` (Chapter 2)
- `KEYCARD_CLIENT_ID` + `KEYCARD_CLIENT_SECRET` — the application's own credentials, used for token exchange (Chapter 4)
- `SUPABASE_URL` — where the tickets live; doubles as the vault resource identifier (Chapter 4)

Each one is explained in `.env.example`. Without them the server exits at startup with a message telling you what's missing.

Two credentials are deliberately **not** in `.env`: the Supabase secret API key and the Anthropic API key both live in Keycard's vault, and the server exchanges the caller's token for them per request.

If you're running your own Supabase project instead of the workshop's shared one, seed it with `data/seed.sql` first.

The server speaks Streamable HTTP at `http://localhost:8000/mcp`. Leave `npm run dev` running and connect your coding agent to that URL.

## Connect your agent

**Claude Code** (and any client that supports HTTP MCP directly):

```bash
claude mcp add --transport http support-escalation http://localhost:8000/mcp
```

**Claude Desktop** (its config only launches stdio servers, so bridge with `mcp-remote`). Edit `claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "support-escalation": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8000/mcp"]
    }
  }
}
```

Then fully quit and reopen Claude Desktop. (The server must already be running when the client connects.)

**Codex CLI** (supports HTTP MCP directly). Edit `~/.codex/config.toml` and add:

```toml
[mcp_servers.support-escalation]
url = "http://localhost:8000/mcp"
```

Once connected, ask your agent to look at the open support tickets and escalate one to engineering.

## Workshop

The chapter-by-chapter guide lives on the workshop docs site. Start at the first chapter and work through in order.
