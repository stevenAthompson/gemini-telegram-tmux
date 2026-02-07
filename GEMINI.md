# gemini-telegram-tmux

A Gemini CLI extension that allows gemini to interact with telegram as if you were using the CLI by running the gemini cli instance inside tmux. Want real time communication? This is how you get it.

## Tools

### start_telegram_bridge
Starts a background bridge that forwards Telegram messages to the current Gemini tmux session and returns responses.

- `bot_token` (string): The Telegram Bot API Token obtained from @BotFather.

**Behavior:**
- This tool spawns a detached background process (`bridge.js`).
- The bridge connects to Telegram via long-polling.
- When you send a message on Telegram, the bridge:
    1.  Acquires a lock to ensure exclusive access.
    2.  Waits for the tmux pane to be stable (idle).
    3.  Types the message into the Gemini CLI.
    4.  Waits for the response to complete (stability check).
    5.  Captures the new output and replies on Telegram.
- **Note:** You must be running Gemini inside a tmux session (default name `gemini-cli`) for this to work.

## Usage Example

```typescript
// To start the bridge
start_telegram_bridge({
  bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
});
```
