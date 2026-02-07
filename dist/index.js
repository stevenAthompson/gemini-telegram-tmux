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
server.registerTool('start_telegram_bridge', {
    description: 'Starts a background bridge that forwards Telegram messages to the current Gemini tmux session and returns responses.',
    inputSchema: z.object({
        bot_token: z.string().describe('The Telegram Bot API Token.'),
    }),
}, async ({ bot_token }) => {
    const paneId = tmux.getPaneId();
    if (!paneId) {
        return {
            content: [{ type: 'text', text: 'Error: Could not determine current tmux pane. Are you running inside tmux?' }],
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
    // Spawn detached process
    const child = spawn('node', [bridgeScript], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'], // We could redirect to log file for debugging
        env: {
            ...process.env,
            TELEGRAM_BOT_TOKEN: bot_token,
            TARGET_PANE: paneId
        }
    });
    child.unref();
    return {
        content: [
            {
                type: 'text',
                text: `Telegram bridge started! (PID: ${child.pid})\nTarget Pane: ${paneId}\nLogs: ${logFile} (Not enabled in code yet, check stdout/stderr if not detached)`,
            },
        ],
    };
});
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Gemini Telegram Bridge MCP Server running on stdio');
