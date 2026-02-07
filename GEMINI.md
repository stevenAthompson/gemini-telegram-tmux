# gemini-telegram-tmux

A Gemini CLI extension that allows gemini to interact with telegram as if you were using the CLI by running the gemini cli instance inside tmux. Want real time communication? This is how you get it.

## Tools

### configure_telegram
Sets up the Telegram Bridge with your Bot Token. 
- `bot_token` (string): The Telegram Bot API Token obtained from @BotFather.

**Usage:**
Run this **once** to initialize the extension. After that, the bridge starts automatically whenever Gemini loads.

### send_telegram_notification
Sends a proactive message to the connected Telegram user.
- `message` (string): The text message to send.

## Usage Example

```typescript
// First time setup
configure_telegram({
  bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
});

// The bridge runs automatically in the background.
// Connect by sending a message on Telegram.

// Send a notification
send_telegram_notification({
  message: "Task completed successfully!"
});
```