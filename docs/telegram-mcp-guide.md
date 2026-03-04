# Telegram MCP — Usage Guide

## Available in ANY Claude Code / Codex / Gemini Session

The Telegram MCP server is registered globally. Every CLI AI session on this PC can send you Telegram messages.

---

## Tools Available

| Tool | What it does |
|------|-------------|
| `telegram_send_message` | Send text (Markdown supported) |
| `telegram_send_photo` | Send an image file |
| `telegram_send_document` | Send any file |
| `telegram_get_updates` | Read recent messages |
| `telegram_get_chat_info` | Get chat details |

---

## How to Call (Claude Code)

```
Use the telegram_send_message tool:
  text: "Hello from Claude Code!"
  header: "My Project"
```

The `header` parameter adds a bold prefix like **[My Project]** so you know which session sent it.

---

## How to Call (Codex CLI)

Codex CLI supports MCP servers. Add to your project's `.codex/config.json`:

```json
{
  "mcpServers": {
    "telegram": {
      "type": "stdio",
      "command": "node",
      "args": ["<PATH_TO>/telegram-mcp-server.js"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "<YOUR_BOT_TOKEN>",
        "TELEGRAM_CHAT_ID": "<YOUR_CHAT_ID>"
      }
    }
  }
}
```

Then: `codex "Send me a Telegram message saying hello"`

---

## How to Call (Gemini CLI)

Gemini CLI supports MCP via its config. Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["<PATH_TO>/telegram-mcp-server.js"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "<YOUR_BOT_TOKEN>",
        "TELEGRAM_CHAT_ID": "<YOUR_CHAT_ID>"
      }
    }
  }
}
```

Then: `gemini "Use telegram to send me a status update"`

---

## Quick Reference

```
Server: node telegram-mcp-server.js
Path:   <PATH_TO>/telegram-mcp-server.js
Token:  <YOUR_BOT_TOKEN>
Chat:   <YOUR_CHAT_ID>
```

## Headers by Context

| Context | Header |
|---------|--------|
| Swarm Orchestrator | `Swarm Town` |
| Claude Code session | `Claude Code` |
| Codex CLI | `Codex CLI` |
| Gemini CLI | `Gemini CLI` |
| Telegram Bot | `Telegram Bot` |
| Mini App | `Mini App` |
