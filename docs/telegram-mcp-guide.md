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

---

## ngrok Tunneling (External Access for Telegram Mini App)

The Telegram Mini App requires a public HTTPS URL so Telegram can load it in its
embedded browser. Use [ngrok](https://ngrok.com/) to tunnel your local
orchestrator (port 6969) to the internet.

### Prerequisites

Install ngrok if you haven't already:

```bash
# Windows (Chocolatey)
choco install ngrok

# Windows (winget)
winget install ngrok.ngrok

# macOS (Homebrew)
brew install ngrok

# Linux (snap)
snap install ngrok

# Or download directly from https://ngrok.com/download
```

After installing, authenticate with your ngrok account (free tier works):

```bash
ngrok config add-authtoken <YOUR_NGROK_AUTH_TOKEN>
```

### Quick Start

1. Start the orchestrator first:

```bash
python orchestrator.py --start-all
```

2. In a separate terminal, run the ngrok tunnel script:

```bash
# Linux / macOS / Git Bash on Windows
./scripts/start-ngrok.sh

# Windows Command Prompt
scripts\start-ngrok.bat
```

3. The script prints the public URL. Copy it.

4. Register the URL with BotFather:
   - Open **@BotFather** in Telegram
   - Send `/mybots` and select your bot
   - Go to **Bot Settings** > **Menu Button** > **Edit menu button URL**
     (or **Configure Mini App**)
   - Set the URL to: `https://<your-id>.ngrok-free.app/telegram-app`

### Using the PUBLIC_URL Environment Variable

If you set `PUBLIC_URL` (or `NGROK_URL`) before starting the orchestrator, it
will be logged at startup and used by the Telegram bot for any external-facing
references:

```bash
# Linux / macOS
export PUBLIC_URL=https://abc123.ngrok-free.app
python orchestrator.py --start-all --telegram

# Windows
set PUBLIC_URL=https://abc123.ngrok-free.app
python orchestrator.py --start-all --telegram
```

### How It Works

- ngrok creates an HTTPS tunnel from a public URL to `localhost:6969`
- The Mini App (`telegram-app.html`) uses `window.location.origin` to detect
  its API base URL, so it automatically uses the ngrok URL when loaded through
  the tunnel -- no code changes needed
- CORS is already set to `Access-Control-Allow-Origin: *` so cross-origin
  requests from the Telegram embedded browser work out of the box
- The API bearer token is injected server-side into the HTML, so authentication
  works identically through the tunnel

### Notes

- Free ngrok URLs change every time you restart the tunnel. You will need to
  update the BotFather URL each time.
- For a stable URL, use ngrok's paid plan with a custom domain, or set up a
  static subdomain on the free tier (if available in your region).
- The ngrok inspect UI at `http://127.0.0.1:4040` lets you monitor all requests
  flowing through the tunnel.
