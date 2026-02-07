import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import * as tmux from './tmux_utils.js';
import { FileLock } from './file_lock.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const token = process.env.TELEGRAM_BOT_TOKEN;
const targetPane = process.env.TARGET_PANE;

if (!token || !targetPane) {
    console.error("Missing TELEGRAM_BOT_TOKEN or TARGET_PANE env vars");
    process.exit(1);
}

const bot = new Telegraf(token);
const conversationLock = new FileLock('gemini-telegram-bridge', 500, 10);

// -- Persistence and Outbox Logic --
const TMP_DIR = os.tmpdir();
const CHAT_ID_FILE = path.join(TMP_DIR, 'gemini_telegram_chat_id.txt');
const OUTBOX_DIR = path.join(TMP_DIR, 'gemini_telegram_outbox');

if (!fs.existsSync(OUTBOX_DIR)) {
    fs.mkdirSync(OUTBOX_DIR);
}

let activeChatId: string | null = null;

// Load previous chat ID if exists
if (fs.existsSync(CHAT_ID_FILE)) {
    try {
        activeChatId = fs.readFileSync(CHAT_ID_FILE, 'utf-8').trim();
        console.log(`Loaded saved Chat ID: ${activeChatId}`);
    } catch (e) {
        console.error("Failed to load chat ID file", e);
    }
}

// Watch Outbox for new messages from Gemini
fs.watch(OUTBOX_DIR, (eventType, filename) => {
    if (eventType === 'rename' && filename) {
        const filePath = path.join(OUTBOX_DIR, filename);
        if (fs.existsSync(filePath)) {
            // Wait slightly to ensure write complete? usually atomic rename is better but simple write might be racey.
            // But if the tool writes then close, it should be fine.
            // Let's add a small delay or retry.
            setTimeout(() => processOutboxMessage(filePath), 100);
        }
    }
});

async function processOutboxMessage(filePath: string) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let msg = "";
        try {
            const json = JSON.parse(content);
            msg = json.message;
        } catch {
            msg = content; // Fallback to raw text
        }

        if (activeChatId) {
             // Split long messages
             if (msg.length > 4000) {
                 const chunks = msg.match(/.{1,4000}/g) || [];
                 for (const chunk of chunks) {
                     await bot.telegram.sendMessage(activeChatId, chunk);
                 }
             } else {
                 await bot.telegram.sendMessage(activeChatId, msg);
             }
        } else {
            console.warn("Attempted to send notification but no active Chat ID found.");
        }
    } catch (e) {
        console.error(`Failed to process outbox message ${filePath}:`, e);
    } finally {
        try { fs.unlinkSync(filePath); } catch {}
    }
}
// ----------------------------------

console.log(`Starting Telegram Bridge for pane ${targetPane}...`);

bot.on(message('text'), async (ctx) => {
    const userMsg = ctx.message.text;
    const chatId = ctx.chat.id.toString();
    
    // Update active chat ID
    if (activeChatId !== chatId) {
        activeChatId = chatId;
        try {
            fs.writeFileSync(CHAT_ID_FILE, activeChatId);
        } catch (e) {
            console.error("Failed to save Chat ID", e);
        }
    }

    console.log(`Received: ${userMsg} from ${chatId}`);

    if (await conversationLock.acquire()) {
        try {
            await tmux.waitForStability(targetPane);
            tmux.sendKeys(targetPane, userMsg);
            tmux.sendKeys(targetPane, 'Enter');
            await tmux.waitForStability(targetPane, 3000, 500, 60000);
            
            const contentAfter = tmux.capturePane(targetPane, 200);
            const msgIndex = contentAfter.lastIndexOf(userMsg);
            let response = "";
            
            if (msgIndex !== -1) {
                let rawResponse = contentAfter.substring(msgIndex + userMsg.length).trim();
                response = rawResponse;
            } else {
                 response = tmux.capturePane(targetPane, 20);
            }

            if (response) {
                if (response.length > 4000) {
                    response = response.substring(response.length - 4000);
                    response = "[...Truncated...]\n" + response;
                }
                await ctx.reply(response);
            } else {
                await ctx.reply("(No output detected)");
            }

        } catch (e: any) {
            console.error(e);
            await ctx.reply(`Error bridging message: ${e.message}`);
        } finally {
            conversationLock.release();
        }
    } else {
        await ctx.reply("System is busy. Please try again.");
    }
});

bot.launch(() => {
    console.log("Telegram bot started.");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));