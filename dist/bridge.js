import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import * as tmux from './tmux_utils.js';
import { FileLock } from './file_lock.js';
const token = process.env.TELEGRAM_BOT_TOKEN;
const targetPane = process.env.TARGET_PANE;
if (!token || !targetPane) {
    console.error("Missing TELEGRAM_BOT_TOKEN or TARGET_PANE env vars");
    process.exit(1);
}
const bot = new Telegraf(token);
// Lock to ensure we don't mix up conversation turns
// We use a file lock shared with the Gemini extension to prevent Gemini from typing while we are processing
// Actually, Gemini itself uses locks? No, Gemini is single threaded per turn.
// But if the User types in Telegram, we are injecting keys. We should avoid injecting if Gemini is typing.
const conversationLock = new FileLock('gemini-telegram-bridge', 500, 10); // Short retry, fail fast? No, wait.
console.log(`Starting Telegram Bridge for pane ${targetPane}...`);
bot.on(message('text'), async (ctx) => {
    const userMsg = ctx.message.text;
    console.log(`Received: ${userMsg}`);
    // Acquire lock to ensure exclusive control over the tmux pane interaction
    if (await conversationLock.acquire()) {
        try {
            // 1. Wait for pane stability (ensure previous turn is done)
            await tmux.waitForStability(targetPane);
            // 2. Capture state before (optional, maybe just rely on message finding)
            // const contentBefore = tmux.capturePane(targetPane);
            // 3. Send message
            tmux.sendKeys(targetPane, userMsg);
            tmux.sendKeys(targetPane, 'Enter');
            // 4. Wait for Gemini to process and reply
            await tmux.waitForStability(targetPane, 3000, 500, 60000); // Wait up to 60s for reply
            // 5. Capture state after (include history to handle scrolling)
            const contentAfter = tmux.capturePane(targetPane, 200);
            // 6. Diff / Extract
            // Find the *last* occurrence of the user message. 
            // This assumes the user message is unique enough or we just take the most recent one.
            const msgIndex = contentAfter.lastIndexOf(userMsg);
            let response = "";
            if (msgIndex !== -1) {
                // Get text after the message
                // + userMsg.length to skip the message itself
                // + 1 usually for the newline if it was echoed with a newline
                let rawResponse = contentAfter.substring(msgIndex + userMsg.length).trim();
                // optional: Strip the very last line if it looks like a prompt (e.g. ends with '$ ' or '> ')
                // But this is risky. Let's just return the raw text for now.
                response = rawResponse;
            }
            else {
                // Fallback: If we can't find our message, return the last 20 lines (likely the new output)
                response = tmux.capturePane(targetPane, 20);
            }
            if (response) {
                // Telegram has a 4096 char limit. Truncate if needed.
                if (response.length > 4000) {
                    response = response.substring(response.length - 4000);
                    response = "[...Truncated...]\n" + response;
                }
                await ctx.reply(response);
            }
            else {
                await ctx.reply("(No output detected)");
            }
        }
        catch (e) {
            console.error(e);
            await ctx.reply(`Error bridging message: ${e.message}`);
        }
        finally {
            conversationLock.release();
        }
    }
    else {
        await ctx.reply("System is busy. Please try again.");
    }
});
bot.launch(() => {
    console.log("Telegram bot started.");
});
// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
