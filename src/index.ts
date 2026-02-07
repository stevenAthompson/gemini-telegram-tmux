import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn, ChildProcess } from 'child_process';
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

let bridgeProcess: ChildProcess | null = null;
const TOKEN_FILE = path.join(__dirname, '../.bot_token');
const LOG_FILE = path.join(os.tmpdir(), 'gemini_telegram_bridge.log');

/**
 * Internal helper to start the bridge process.
 * Returns true if started or already running, false if configuration missing.
 */
function startBridge(): boolean {
    if (bridgeProcess && !bridgeProcess.killed) {
        return true;
    }

    // 1. Check Tmux
    const paneId = tmux.getPaneId();
    if (!paneId) {
        console.error("Gemini-Telegram-Bridge: Not running inside tmux. Bridge disabled.");
        return false;
    }

    // 2. Check Token
    if (!fs.existsSync(TOKEN_FILE)) {
        return false;
    }

    try {
        const token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
        if (!token) return false;

        const bridgeScript = path.join(__dirname, 'bridge.js');
        if (!fs.existsSync(bridgeScript)) {
            console.error(`Bridge script missing: ${bridgeScript}`);
            return false;
        }

        const logStream = fs.openSync(LOG_FILE, 'a');
        bridgeProcess = spawn('node', [bridgeScript], {
            detached: true,
            stdio: ['ignore', logStream, logStream],
            env: {
                ...process.env,
                TELEGRAM_BOT_TOKEN: token,
                TARGET_PANE: paneId
            }
        });
        bridgeProcess.unref();
        
        console.error(`Gemini-Telegram-Bridge: Started (PID ${bridgeProcess.pid})`);
        return true;

    } catch (e) {
        console.error("Gemini-Telegram-Bridge: Failed to start", e);
        return false;
    }
}

// Attempt auto-start on load
startBridge();

server.registerTool(
  'configure_telegram',
  {
    description: 'Sets up the Telegram Bridge with your Bot Token. Only needed once.',
    inputSchema: z.object({
      bot_token: z.string().describe('The Telegram Bot API Token obtained from @BotFather.'),
    }),
  },
  async ({ bot_token }) => {
    try {
        fs.writeFileSync(TOKEN_FILE, bot_token, { encoding: 'utf-8', mode: 0o600 });
        
        // Kill existing if any to restart with new token
        if (bridgeProcess) {
            bridgeProcess.kill();
            bridgeProcess = null;
        }

        const started = startBridge();
        
        if (started) {
             return {
                content: [{ type: 'text', text: `Configuration saved and bridge started successfully!\nLogs: ${LOG_FILE}` }]
            };
        } else {
             return {
                content: [{ type: 'text', text: `Configuration saved, but failed to start bridge. Are you running in tmux? Check logs: ${LOG_FILE}` }],
                isError: true
            };
        }

    } catch (e: any) {
        return {
            content: [{ type: 'text', text: `Failed to save configuration: ${e.message}` }],
            isError: true
        };
    }
  },
);

server.registerTool(
    'send_telegram_notification',
    {
        description: 'Sends a message to the connected Telegram user.',
        inputSchema: z.object({
            message: z.string().describe('The message to send.'),
        }),
    },
    async ({ message }) => {
        // Ensure bridge is running
        if (!startBridge()) {
             return {
                content: [{ type: 'text', text: 'Error: Telegram Bridge is not running. Has the user configured a bot token yet? Use configure_telegram.' }],
                isError: true
            };
        }

        const TMP_DIR = os.tmpdir();
        const OUTBOX_DIR = path.join(TMP_DIR, 'gemini_telegram_outbox');
        const CHAT_ID_FILE = path.join(TMP_DIR, 'gemini_telegram_chat_id.txt');
        
        if (!fs.existsSync(OUTBOX_DIR)) {
             // Should have been created by bridge, but maybe it just started
             try { fs.mkdirSync(OUTBOX_DIR); } catch {}
        }

        if (!fs.existsSync(CHAT_ID_FILE)) {
            return {
                content: [{ type: 'text', text: 'Notification queued, but no active user found yet. Please send a message to the bot from Telegram to connect.' }]
            };
        }

        const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const filename = `${msgId}.json`;
        const filePath = path.join(OUTBOX_DIR, filename);

        try {
            fs.writeFileSync(filePath, JSON.stringify({ message }));
            return {
                content: [{ type: 'text', text: `Notification queued.` }]
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
