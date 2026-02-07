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

// PID File Management & Singleton Check
const TMP_DIR = os.tmpdir();
const PID_FILE = path.join(TMP_DIR, 'gemini_telegram_bridge.pid');

try {
    if (fs.existsSync(PID_FILE)) {
        const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
        if (!isNaN(existingPid)) {
            try {
                process.kill(existingPid, 0); // Check if running
                console.error(`Bridge already running (PID ${existingPid}). Aborting.`);
                process.exit(0);
            } catch (e) {
                // Process not running, stale file. Overwrite it.
            }
        }
    }
    fs.writeFileSync(PID_FILE, process.pid.toString());
    console.log(`Bridge started. PID: ${process.pid}`);
} catch (e) {
    console.error("Failed to manage PID file:", e);
}

const bot = new Telegraf(token);
const conversationLock = new FileLock('gemini-telegram-bridge', 500, 10);

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
    if (eventType === 'rename' && filename && !filename.endsWith('.processing')) {
        const filePath = path.join(OUTBOX_DIR, filename);
        // Small delay to ensure write complete, but use locking
        setTimeout(() => processOutboxMessage(filePath), 50);
    }
});

function cleanOutput(text: string): string {
    // 1. Strip ANSI escape codes
    // eslint-disable-next-line no-control-regex
    let clean = text.replace(/\x1B\[\d+;?\d*m/g, "");
    
    // 2. Aggressively strip box-drawing, UI chars, and common loader symbols
    clean = clean.replace(/[│─╭╮╰╯─╼╽╾╿┌┐└┘├┤┬┴┼═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏•✓✖⚠]/g, "");

    // 3. Remove Gemini CLI Status Bar specific lines
    clean = clean.replace(/Using: \d+ GEMINI\.md files.*$/gm, "");
    clean = clean.replace(/YOLO mode \(ctrl \+ y to toggle\).*$/gm, "");
    clean = clean.replace(/\* +Type your message or @path\/to\/file.*$/gm, "");
    clean = clean.replace(/~\/.*no sandbox.*Auto.*$/gm, ""); 

    // 4. Convert all newline sequences to exactly TWO newlines for readability
    clean = clean.replace(/\n+/g, "\n\n");
    
    return clean.trim();
}

async function processOutboxMessage(filePath: string) {
    if (!fs.existsSync(filePath)) return;

    // ATOMIC LOCK: Rename to .processing to claim ownership
    const processingPath = filePath + '.processing';
    try {
        fs.renameSync(filePath, processingPath);
    } catch (e) {
        return; // Failed to rename (already taken or gone), abort
    }

    try {
        const content = fs.readFileSync(processingPath, 'utf-8');
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
        console.error(`Failed to process outbox message ${processingPath}:`, e);
    } finally {
        try { fs.unlinkSync(processingPath); } catch {} // Ignore errors during cleanup
    }
}

bot.on(message('text'), async (ctx) => {
    let userMsg = ctx.message.text;
    const chatId = ctx.chat.id.toString();
    const msgId = ctx.message.message_id;
    
    // Safety: Prevent accidental shell mode trigger in Gemini CLI
    const prefix = "[Telegram]: ";
    userMsg = userMsg.split('\n')
                     .map(line => line.startsWith('!') ? ' ' + line : line)
                     .join('\n');
    
    const finalMsg = `${prefix}${userMsg}`;
    
    if (activeChatId !== chatId) {
        activeChatId = chatId;
        try { fs.writeFileSync(CHAT_ID_FILE, activeChatId); } catch {} // Ignore errors during save
    }

    console.log(`[Msg ${msgId}] Received: "${userMsg}"`);

    if (await conversationLock.acquire()) {
        try {
            await tmux.waitForStability(targetPane);
            
            console.log(`[Msg ${msgId}] Injecting message...`);
            await tmux.injectCommand(targetPane, finalMsg);
            
            console.log(`[Msg ${msgId}] Waiting for response...`);
            await tmux.waitForStability(targetPane, 3000, 500, 20000);
            
            let contentAfter = tmux.capturePane(targetPane, 200);
            
            // Remove the last 5 lines (Status bar, prompts) to avoid garbage
            const lines = contentAfter.split('\n');
            if (lines.length > 5) {
                contentAfter = lines.slice(0, -5).join('\n');
            }

            const msgIndex = contentAfter.lastIndexOf(finalMsg);
            let response = "";
            
            if (msgIndex !== -1) {
                response = contentAfter.substring(msgIndex + finalMsg.length).trim();
            } else {
                 const lastLines = lines.slice(0, -5).slice(-20).join('\n');
                 response = lastLines;
            }

            if (response) {
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

process.once('SIGINT', () => {
    try { fs.unlinkSync(PID_FILE); } catch {} // Ignore errors during cleanup
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    try { fs.unlinkSync(PID_FILE); } catch {} // Ignore errors during cleanup
    bot.stop('SIGTERM');
});