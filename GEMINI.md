# gemini-telegram-tmux

A Gemini CLI extension that allows gemini to interact with telegram as if you were using the CLI by running the gemini cli instance inside tmux. Want real time communication? This is how you get it.

## Tools

### start_telegram_bridge
Starts a background bridge that forwards Telegram messages to the current Gemini tmux session and returns responses.

- `bot_token` (string, optional): The Telegram Bot API Token obtained from @BotFather. **Required only for the first run.** Subsequent calls can omit this, as the token is saved locally.

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

### send_telegram_notification
Sends a proactive message to the connected Telegram user.

- `message` (string): The text message to send.

**Requirements:**
- `start_telegram_bridge` must be running.
- A user must have messaged the bot at least once (to establish the Chat ID).

**Usage:**
Use this to notify the user of completed tasks, errors, or important events without waiting for them to ask.

## Usage Example

```typescript
// First time setup (token is saved automatically)
start_telegram_bridge({
  bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
});

// Future sessions (token loaded from file)
start_telegram_bridge({});

// Send a notification
send_telegram_notification({
  message: "Task completed successfully!"
});
```
