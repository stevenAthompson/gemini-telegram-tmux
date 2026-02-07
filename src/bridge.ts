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

const TMP_DIR = os.tmpdir();
const CHAT_ID_FILE = path.join(TMP_DIR, 'gemini_telegram_chat_id.txt');
const OUTBOX_DIR = path.join(TMP_DIR, 'gemini_telegram_outbox');

if (!fs.existsSync(OUTBOX_DIR)) {
    fs.mkdirSync(OUTBOX_DIR);
}

let activeChatId: string | null = null;

if (fs.existsSync(CHAT_ID_FILE)) {
    try {
        activeChatId = fs.readFileSync(CHAT_ID_FILE, 'utf-8').trim();
        console.log(`Loaded saved Chat ID: ${activeChatId}`);
    } catch (e) {
        console.error("Failed to load chat ID file", e);
    }
} else {
    console.log("No saved Chat ID found. Waiting for incoming message...");
}

fs.watch(OUTBOX_DIR, (eventType, filename) => {
    if (eventType === 'rename' && filename) {
        const filePath = path.join(OUTBOX_DIR, filename);
        // Wait for file to be fully written
        setTimeout(() => processOutboxMessage(filePath), 100);
    }
});

async function processOutboxMessage(filePath: string) {
    if (!fs.existsSync(filePath)) return;

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let msg = "";
        try {
            const json = JSON.parse(content);
            msg = json.message;
        } catch {
            msg = content;
        }

        if (activeChatId) {
             console.log(`Sending notification to ${activeChatId}: ${msg.substring(0, 50)}...`);
             let sentMsg;
             if (msg.length > 4000) {
                 const chunks = msg.match(/.{1,4000}/g) || [];
                 for (const chunk of chunks) {
                     sentMsg = await bot.telegram.sendMessage(activeChatId, chunk);
                 }
             } else {
                 sentMsg = await bot.telegram.sendMessage(activeChatId, msg);
             }
             console.log(`Notification sent. Message ID: ${sentMsg?.message_id}`);
        } else {
            console.warn("Attempted to send notification but no active Chat ID found. User must message first.");
        }
    } catch (e) {
        console.error(`Failed to process outbox message ${filePath}:`, e);
    } finally {
        try { fs.unlinkSync(filePath); } catch {}
    }
}

console.log(`Starting Telegram Bridge for pane ${targetPane}...`);

bot.on(message('text'), async (ctx) => {
    const userMsg = ctx.message.text;
    const chatId = ctx.chat.id.toString();
    const msgId = ctx.message.message_id;
    
    if (activeChatId !== chatId) {
        activeChatId = chatId;
        console.log(`New active Chat ID detected: ${activeChatId}`);
        try {
            fs.writeFileSync(CHAT_ID_FILE, activeChatId);
        } catch (e) {
            console.error("Failed to save Chat ID", e);
        }
    }

    console.log(`[Msg ${msgId}] Received: "${userMsg}" from ${chatId}`);

    if (await conversationLock.acquire()) {
        try {
            console.log(`[Msg ${msgId}] Acquired lock. Waiting for stability...`);
            await tmux.waitForStability(targetPane);
            
            console.log(`[Msg ${msgId}] Typing message...`);
            tmux.sendKeys(targetPane, userMsg);
            tmux.sendKeys(targetPane, 'Enter');
            
            console.log(`[Msg ${msgId}] Waiting for response...`);
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
                console.log(`[Msg ${msgId}] Sending response (${response.length} chars)...`);
                if (response.length > 4000) {
                    response = response.substring(response.length - 4000);
                    response = "[...Truncated...]\n" + response;
                }
                const reply = await ctx.reply(response);
                console.log(`[Msg ${msgId}] Response sent. Reply ID: ${reply.message_id}`);
            } else {
                console.log(`[Msg ${msgId}] No output detected.`);
                await ctx.reply("(No output detected)");
            }

        } catch (e: any) {
            console.error(`[Msg ${msgId}] Error:`, e);
            await ctx.reply(`Error bridging message: ${e.message}`);
        } finally {
            conversationLock.release();
            console.log(`[Msg ${msgId}] Lock released.`);
        }
    } else {
        console.warn(`[Msg ${msgId}] Lock busy.`);
        await ctx.reply("System is busy. Please try again.");
    }
});

bot.launch(() => {
    console.log("Telegram bot started.");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
