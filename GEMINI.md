# gemini-telegram-tmux

A Gemini CLI extension that allows gemini to interact with telegram as if you were using the CLI by running the gemini cli instance inside tmux. Want real time communication? This is how you get it.

## Tools

### configure_telegram
Sets up the Telegram Bridge with your Bot Token. 
- `bot_token` (string): The Telegram Bot API Token obtained from @BotFather.

**Usage:**
Call this tool when the user provides their token in the chat.

### check_telegram_status
Checks if the Telegram Bridge is configured and running. Use this to diagnose connection issues or determine if you need to ask the user for a token.

### send_telegram_notification
Sends a proactive message to the connected Telegram user.
- `message` (string): The text message to send.

## Workflow for Agents

1.  **Check Status**: If you are unsure if the bridge is working, call `check_telegram_status`.
2.  **Configure**: If status says "Not Configured", ask the user: "Please provide your Telegram Bot Token." When they reply, call `configure_telegram(token)`.
3.  **Connect**: If status says "Not Connected", tell the user: "Please send a message to your bot on Telegram so I can capture your Chat ID."
    *   **Note**: Incoming messages from Telegram will appear in your context prefixed with `[Telegram]:`. Treat them as user messages.
4.  **Notify**: Use `send_telegram_notification` to ping the user about completed tasks.

# IMPORTANT NOTES FOR DEVELOPERS
- Gemini extensions are distributed via Github and must include all requirements. 
- **MANDATORY**: You MUST include the `dist/` and `node_modules/` folders in the git repository. Do NOT ignore them.
- **SYNC RULE**: Every time you modify files in `src/`, you MUST run `npm run build` and `git add dist/` before committing. Failure to do this results in users running stale code.
- Always gitignore any secrets, keys, or other sensitive information (like `.bot_token`).
- Exclude the "reference" folder from any git pushes. That code is for reference only.