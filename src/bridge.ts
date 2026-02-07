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
}

// Watch Outbox
fs.watch(OUTBOX_DIR, (eventType, filename) => {
    if (eventType === 'rename' && filename) {
        const filePath = path.join(OUTBOX_DIR, filename);
        setTimeout(() => processOutboxMessage(filePath), 100);
    }
});

function cleanOutput(text: string): string {
    // 1. Strip ANSI escape codes
    // eslint-disable-next-line no-control-regex
    let clean = text.replace(/\x1B\[\d+;?\d*m/g, "");
    
    // 2. Strip box-drawing characters common in CLI UIs
    clean = clean.replace(/[│─╭╮╰╯─]/g, "");
    
    // 3. Remove excessive blank lines resulting from the strip
    clean = clean.replace(/\n\s*\n/g, "\n");
    
    return clean.trim();
}

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
             const cleanMsg = cleanOutput(msg);
             console.log(`Sending notification: ${cleanMsg.substring(0, 50)}...`);
             
             if (cleanMsg.length > 4000) {
                 const chunks = cleanMsg.match(/.{1,4000}/g) || [];
                 for (const chunk of chunks) {
                     await bot.telegram.sendMessage(activeChatId, chunk);
                 }
             } else {
                 await bot.telegram.sendMessage(activeChatId, cleanMsg);
             }
        }
    } catch (e) {
        console.error(`Failed to process outbox message ${filePath}:`, e);
    } finally {
        try { fs.unlinkSync(filePath); } catch {} // eslint-disable-line no-empty
    }
}

bot.on(message('text'), async (ctx) => {
    const userMsg = ctx.message.text;
    const chatId = ctx.chat.id.toString();
    
    if (activeChatId !== chatId) {
        activeChatId = chatId;
        try { fs.writeFileSync(CHAT_ID_FILE, activeChatId); } catch {} // eslint-disable-line no-empty
    }

    if (await conversationLock.acquire()) {
        try {
            await tmux.waitForStability(targetPane);
            
            // Type message (slowly, mimicking human input)
            await tmux.typeText(targetPane, userMsg, 30);
            
            // Wait for typing to settle
            await new Promise(r => setTimeout(r, 800));
            
            // Send Enter (C-m is safer)
            console.log(`[Msg ${msgId}] Sending Enter (C-m)...`);
            tmux.sendKeys(targetPane, 'C-m');
            
            // Wait again
            await new Promise(r => setTimeout(r, 500));
            
            // Double tap if needed (Enter key this time)
            tmux.sendKeys(targetPane, 'Enter'); 

            await tmux.waitForStability(targetPane, 3000, 500, 60000);
            
            const contentAfter = tmux.capturePane(targetPane, 200);
            const msgIndex = contentAfter.lastIndexOf(userMsg);
            let response = "";
            
            if (msgIndex !== -1) {
                // Heuristic: Get text after the message
                response = contentAfter.substring(msgIndex + userMsg.length).trim();
            } else {
                 response = tmux.capturePane(targetPane, 20);
            }

            if (response) {
                // CLEAN UP THE RESPONSE
                const cleanResponse = cleanOutput(response);
                
                if (cleanResponse.length > 4000) {
                    const truncated = cleanResponse.substring(cleanResponse.length - 4000);
                    await ctx.reply("[...Truncated...]\n" + truncated);
                } else {
                    await ctx.reply(cleanResponse || "(Output was empty after cleaning)");
                }
            } else {
                await ctx.reply("(No output detected)");
            }

        } catch (e: any) {
            console.error(e);
            await ctx.reply(`Error: ${e.message}`);
        } finally {
            conversationLock.release();
        }
    } else {
        await ctx.reply("System is busy.");
    }
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));