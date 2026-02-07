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
// PID File Management
const TMP_DIR = os.tmpdir();
const PID_FILE = path.join(TMP_DIR, 'gemini_telegram_bridge.pid');
try {
    fs.writeFileSync(PID_FILE, process.pid.toString());
    console.log(`Bridge started. PID: ${process.pid}`);
}
catch (e) {
    console.error("Failed to write PID file:", e);
}
const bot = new Telegraf(token);
const conversationLock = new FileLock('gemini-telegram-bridge', 500, 10);
const CHAT_ID_FILE = path.join(TMP_DIR, 'gemini_telegram_chat_id.txt');
const OUTBOX_DIR = path.join(TMP_DIR, 'gemini_telegram_outbox');
if (!fs.existsSync(OUTBOX_DIR)) {
    fs.mkdirSync(OUTBOX_DIR);
}
let activeChatId = null;
if (fs.existsSync(CHAT_ID_FILE)) {
    try {
        activeChatId = fs.readFileSync(CHAT_ID_FILE, 'utf-8').trim();
        console.log(`Loaded saved Chat ID: ${activeChatId}`);
    }
    catch (e) {
        console.error("Failed to load chat ID file", e);
    }
}
else {
    console.log("No saved Chat ID found. Waiting for incoming message...");
}
fs.watch(OUTBOX_DIR, (eventType, filename) => {
    if (eventType === 'rename' && filename) {
        const filePath = path.join(OUTBOX_DIR, filename);
        setTimeout(() => processOutboxMessage(filePath), 100);
    }
});
function cleanOutput(text) {
    // 1. Strip ANSI escape codes
    // eslint-disable-next-line no-control-regex
    let clean = text.replace(/\x1B\[\d+;?\d*m/g, "");
    // 2. Aggressively strip box-drawing, UI chars, and common loader symbols
    // Grouped for efficiency
    clean = clean.replace(/[│─╭╮╰╯─╼╽╾╿┌┐└┘├┤┬┴┼═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏•✓✖⚠]/g, "");
    // 3. Remove excessive blank lines (preserve single newlines)
    clean = clean.replace(/\n\s*\n/g, '\n');
    // 4. Remove Gemini CLI Status Bar specific lines
    // "Using: 8 GEMINI.md files..."
    // "YOLO mode..."
    // "Type your message..."
    clean = clean.replace(/Using: \d+ GEMINI\.md files.*$/gm, "");
    clean = clean.replace(/YOLO mode \(ctrl \+ y to toggle\).*$/gm, "");
    clean = clean.replace(/\* +Type your message or @path\/to\/file.*$/gm, "");
    clean = clean.replace(/~\/.*no sandbox.*Auto.*$/gm, ""); // Bottom path line
    return clean.trim();
}
async function processOutboxMessage(filePath) {
    if (!fs.existsSync(filePath))
        return;
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let msg = "";
        try {
            const json = JSON.parse(content);
            msg = json.message;
        }
        catch {
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
            }
            else {
                await bot.telegram.sendMessage(activeChatId, cleanMsg);
            }
        }
    }
    catch (e) {
        console.error(`Failed to process outbox message ${filePath}:`, e);
    }
    finally {
        try {
            fs.unlinkSync(filePath);
        }
        catch { } // eslint-disable-line no-empty
    }
}
bot.on(message('text'), async (ctx) => {
    let userMsg = ctx.message.text;
    const chatId = ctx.chat.id.toString();
    const msgId = ctx.message.message_id;
    // Safety: Prevent accidental shell mode trigger in Gemini CLI
    // An '!' at the start of a line often forces shell execution.
    // We prepend a space to neutralize it while keeping the message readable.
    // Also prepend [Telegram] context.
    const prefix = "[Telegram]: ";
    userMsg = userMsg.split('\n')
        .map(line => line.startsWith('!') ? ' ' + line : line)
        .join('\n');
    // Combine
    const finalMsg = `${prefix}${userMsg}`;
    if (activeChatId !== chatId) {
        activeChatId = chatId;
        try {
            fs.writeFileSync(CHAT_ID_FILE, activeChatId);
        }
        catch { } // eslint-disable-line no-empty
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
            // We look for the ECHO of what we typed to find where the response starts
            const msgIndex = contentAfter.lastIndexOf(finalMsg);
            let response = "";
            if (msgIndex !== -1) {
                response = contentAfter.substring(msgIndex + finalMsg.length).trim();
            }
            else {
                // If we can't find our message, take the last 20 lines (of the trimmed content)
                const lastLines = lines.slice(0, -5).slice(-20).join('\n');
                response = lastLines;
            }
            if (response) {
                const cleanResponse = cleanOutput(response);
                if (cleanResponse.length > 4000) {
                    const truncated = cleanResponse.substring(cleanResponse.length - 4000);
                    await ctx.reply("[...Truncated...]\n" + truncated);
                }
                else {
                    await ctx.reply(cleanResponse || "(Output was empty after cleaning)");
                }
            }
            else {
                await ctx.reply("(No output detected)");
            }
        }
        catch (e) {
            console.error(e);
            await ctx.reply(`Error: ${e.message}`);
        }
        finally {
            conversationLock.release();
        }
    }
    else {
        await ctx.reply("System is busy.");
    }
});
bot.launch();
process.once('SIGINT', () => {
    try {
        fs.unlinkSync(PID_FILE);
    }
    catch { } // eslint-disable-line no-empty
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    try {
        fs.unlinkSync(PID_FILE);
    }
    catch { } // eslint-disable-line no-empty
    bot.stop('SIGTERM');
});
