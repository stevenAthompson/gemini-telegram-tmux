import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as os from 'os';
import * as tmux from './tmux_utils.js';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new McpServer({
  name: 'gemini-telegram-tmux',
  version: '1.0.0',
});

server.registerTool(
  'start_telegram_bridge',
  {
    description: 'Starts a background bridge that forwards Telegram messages to the current Gemini tmux session and returns responses.',
    inputSchema: z.object({
      bot_token: z.string().optional().describe('The Telegram Bot API Token. Optional if previously saved.'),
    }),
  },
  async ({ bot_token }) => {
    const paneId = tmux.getPaneId();
    if (!paneId) {
        return {
            content: [{ type: 'text', text: `
Error: Gemini is not running inside a tmux session.
This extension requires tmux to function safely.

To fix this:
1. Exit the current session.
2. Run the included helper script:
   ./gemini_tmux.sh

Or manually start tmux:
   tmux new -s gemini-cli gemini
            ` }],
            isError: true
        };
    }

    const tokenFile = path.join(__dirname, '../.bot_token');
    let effectiveToken = bot_token;

    if (effectiveToken) {
        try {
            fs.writeFileSync(tokenFile, effectiveToken, { encoding: 'utf-8', mode: 0o600 });
        } catch (e) {
            console.error("Failed to save .bot_token", e);
        }
    } else {
        if (fs.existsSync(tokenFile)) {
            try {
                effectiveToken = fs.readFileSync(tokenFile, 'utf-8').trim();
            } catch (e) {
                console.error("Failed to read .bot_token", e);
            }
        }
    }

    if (!effectiveToken) {
        return {
            content: [{ type: 'text', text: `
Error: No Telegram Bot Token provided.

Please run the command with your token once to save it:
start_telegram_bridge bot_token="123456:ABC-DEF..."

On future runs, you can simply call:
start_telegram_bridge
            ` }],
            isError: true
        };
    }

    const bridgeScript = path.join(__dirname, 'bridge.js');
    
    if (!fs.existsSync(bridgeScript)) {
         return {
            content: [{ type: 'text', text: `Error: Bridge script not found at ${bridgeScript}. Please build the project.` }],
            isError: true
        };
    }

    const logFile = path.join(os.tmpdir(), 'gemini_telegram_bridge.log');

    const child = spawn('node', [bridgeScript], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'], // We recommend redirecting to logFile manually for debugging
        // Actually, let's redirect stdout/stderr to the log file for real debugging
    });
    
    // Proper log redirection
    const logStream = fs.openSync(logFile, 'a');
    const childProcess = spawn('node', [bridgeScript], {
        detached: true,
        stdio: ['ignore', logStream, logStream],
        env: {
            ...process.env,
            TELEGRAM_BOT_TOKEN: effectiveToken,
            TARGET_PANE: paneId
        }
    });
    childProcess.unref();

    return {
      content: [
        {
          type: 'text',
          text: `Telegram bridge started! (PID: ${childProcess.pid})\nTarget Pane: ${paneId}\nLogs: ${logFile}`,
        },
      ],
    };
  },
);

server.registerTool(
    'send_telegram_notification',
    {
        description: 'Sends a message to the connected Telegram user. Requires start_telegram_bridge to be running and a user to have messaged the bot at least once.',
        inputSchema: z.object({
            message: z.string().describe('The message to send.'),
        }),
    },
    async ({ message }) => {
        const TMP_DIR = os.tmpdir();
        const OUTBOX_DIR = path.join(TMP_DIR, 'gemini_telegram_outbox');
        const CHAT_ID_FILE = path.join(TMP_DIR, 'gemini_telegram_chat_id.txt');
        
        if (!fs.existsSync(OUTBOX_DIR)) {
             return {
                content: [{ type: 'text', text: 'Error: Bridge outbox directory not found. Is start_telegram_bridge running?' }],
                isError: true
            };
        }

        // Check if we have a user to send to
        if (!fs.existsSync(CHAT_ID_FILE)) {
            return {
                content: [{ type: 'text', text: 'Error: No active Telegram user found. Please send a message to the bot from your Telegram app first to establish a connection.' }],
                isError: true
            };
        }

        const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const filename = `${msgId}.json`;
        const filePath = path.join(OUTBOX_DIR, filename);

        try {
            fs.writeFileSync(filePath, JSON.stringify({ message }));
            return {
                content: [{ type: 'text', text: `Notification queued (ID: ${msgId}).` }]
            };
        } catch (e: any) {
            return {
                content: [{ type: 'text', text: `Error queuing notification: ${e.message}` }],
                isError: true
            };
        }
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Gemini Telegram Bridge MCP Server running on stdio');