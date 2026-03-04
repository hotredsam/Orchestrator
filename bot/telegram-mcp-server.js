#!/usr/bin/env node
/**
 * Telegram MCP Server for Claude Code
 * Exposes Telegram bot tools via the Model Context Protocol.
 *
 * Tools:
 *   - telegram_send_message: Send a text message
 *   - telegram_send_photo: Send a photo by file path
 *   - telegram_get_updates: Get recent messages
 *   - telegram_get_chat_info: Get chat information
 *   - telegram_send_document: Send a file/document
 */

const http = require("https");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8310291869:AAEGGLhVldtQ_kExJkeUF3QLBZdBlL6nzu4";
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "5652086820";

// ─── Telegram API helpers ────────────────────────────────────────────────────

function telegramAPI(method, params = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(params);
    const options = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${BOT_TOKEN}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ ok: false, error: data });
        }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function telegramSendPhoto(chatId, filePath, caption = "") {
  return new Promise((resolve, reject) => {
    const boundary = "----FormBoundary" + Date.now();
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    let body = "";
    body += `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
    if (caption) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
      body += `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`;
    }
    const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const bodyStart = Buffer.from(body + fileHeader, "utf-8");
    const bodyEnd = Buffer.from(footer, "utf-8");
    const fullBody = Buffer.concat([bodyStart, fileData, bodyEnd]);

    const options = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${BOT_TOKEN}/sendPhoto`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": fullBody.length,
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ ok: false, error: data }); }
      });
    });
    req.on("error", reject);
    req.write(fullBody);
    req.end();
  });
}

function telegramSendDocument(chatId, filePath, caption = "") {
  return new Promise((resolve, reject) => {
    const boundary = "----FormBoundary" + Date.now();
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    let body = "";
    body += `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
    if (caption) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
    }
    const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const bodyStart = Buffer.from(body + fileHeader, "utf-8");
    const bodyEnd = Buffer.from(footer, "utf-8");
    const fullBody = Buffer.concat([bodyStart, fileData, bodyEnd]);

    const options = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${BOT_TOKEN}/sendDocument`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": fullBody.length,
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ ok: false, error: data }); }
      });
    });
    req.on("error", reject);
    req.write(fullBody);
    req.end();
  });
}

// ─── MCP Protocol ────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "telegram_send_message",
    description: "Send a text message via Telegram. Supports Markdown formatting.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The message text to send. Supports Markdown." },
        chat_id: { type: "string", description: "Chat ID to send to. Defaults to the configured chat." },
      },
      required: ["text"],
    },
  },
  {
    name: "telegram_send_photo",
    description: "Send a photo/image file via Telegram.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the image file to send." },
        caption: { type: "string", description: "Optional caption for the photo." },
        chat_id: { type: "string", description: "Chat ID. Defaults to configured chat." },
      },
      required: ["file_path"],
    },
  },
  {
    name: "telegram_send_document",
    description: "Send a file/document via Telegram.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the file to send." },
        caption: { type: "string", description: "Optional caption." },
        chat_id: { type: "string", description: "Chat ID. Defaults to configured chat." },
      },
      required: ["file_path"],
    },
  },
  {
    name: "telegram_get_updates",
    description: "Get recent messages/updates from Telegram. Returns the latest messages sent to the bot.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max number of updates to return. Default 10." },
      },
    },
  },
  {
    name: "telegram_get_chat_info",
    description: "Get information about the configured Telegram chat.",
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "Chat ID. Defaults to configured chat." },
      },
    },
  },
];

async function handleToolCall(name, args) {
  const chatId = args.chat_id || DEFAULT_CHAT_ID;

  switch (name) {
    case "telegram_send_message": {
      const result = await telegramAPI("sendMessage", {
        chat_id: chatId,
        text: args.text,
        parse_mode: "Markdown",
      });
      return result.ok
        ? `Message sent successfully. Message ID: ${result.result.message_id}`
        : `Failed to send message: ${JSON.stringify(result)}`;
    }

    case "telegram_send_photo": {
      if (!fs.existsSync(args.file_path)) {
        return `File not found: ${args.file_path}`;
      }
      const result = await telegramSendPhoto(chatId, args.file_path, args.caption || "");
      return result.ok
        ? `Photo sent successfully. Message ID: ${result.result.message_id}`
        : `Failed to send photo: ${JSON.stringify(result)}`;
    }

    case "telegram_send_document": {
      if (!fs.existsSync(args.file_path)) {
        return `File not found: ${args.file_path}`;
      }
      const result = await telegramSendDocument(chatId, args.file_path, args.caption || "");
      return result.ok
        ? `Document sent successfully. Message ID: ${result.result.message_id}`
        : `Failed to send document: ${JSON.stringify(result)}`;
    }

    case "telegram_get_updates": {
      const limit = args.limit || 10;
      const result = await telegramAPI("getUpdates", { limit, offset: -limit });
      if (!result.ok) return `Failed to get updates: ${JSON.stringify(result)}`;
      const messages = (result.result || [])
        .filter((u) => u.message)
        .map((u) => ({
          from: u.message.from?.first_name || "Unknown",
          text: u.message.text || "(media)",
          date: new Date(u.message.date * 1000).toISOString(),
        }));
      return JSON.stringify(messages, null, 2);
    }

    case "telegram_get_chat_info": {
      const result = await telegramAPI("getChat", { chat_id: chatId });
      if (!result.ok) return `Failed to get chat info: ${JSON.stringify(result)}`;
      const chat = result.result;
      return JSON.stringify(
        {
          id: chat.id,
          type: chat.type,
          title: chat.title || chat.first_name,
          username: chat.username,
          description: chat.description,
        },
        null,
        2
      );
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── JSON-RPC stdio transport ────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, terminal: false });
let buffer = "";

function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result });
  const header = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n`;
  process.stdout.write(header + msg);
}

function sendNotification(method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
  const header = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n`;
  process.stdout.write(header + msg);
}

function sendError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
  const header = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n`;
  process.stdout.write(header + msg);
}

async function handleMessage(message) {
  try {
    const { id, method, params } = message;

    switch (method) {
      case "initialize":
        sendResponse(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "telegram-mcp", version: "1.0.0" },
        });
        break;

      case "notifications/initialized":
        // Client acknowledged initialization
        break;

      case "tools/list":
        sendResponse(id, { tools: TOOLS });
        break;

      case "tools/call": {
        const { name, arguments: args } = params;
        try {
          const result = await handleToolCall(name, args || {});
          sendResponse(id, {
            content: [{ type: "text", text: result }],
          });
        } catch (err) {
          sendResponse(id, {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          });
        }
        break;
      }

      default:
        if (id) {
          sendError(id, -32601, `Method not found: ${method}`);
        }
    }
  } catch (err) {
    process.stderr.write(`Error handling message: ${err.message}\n`);
  }
}

// Parse incoming messages (Content-Length header + JSON body)
process.stdin.on("data", (chunk) => {
  buffer += chunk.toString();

  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const header = buffer.substring(0, headerEnd);
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      buffer = buffer.substring(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(contentLengthMatch[1], 10);
    const bodyStart = headerEnd + 4;

    if (buffer.length < bodyStart + contentLength) break;

    const body = buffer.substring(bodyStart, bodyStart + contentLength);
    buffer = buffer.substring(bodyStart + contentLength);

    try {
      const message = JSON.parse(body);
      handleMessage(message);
    } catch (err) {
      process.stderr.write(`Failed to parse message: ${err.message}\n`);
    }
  }
});

process.stderr.write("Telegram MCP Server started\n");
