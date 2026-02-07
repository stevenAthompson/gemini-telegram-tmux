# Gemini Telegram Tmux Bridge

> **Talk to your Gemini Agent from anywhere.**

This extension bridges your local Gemini CLI session to Telegram. It allows you to chat with your running agent from your phone, getting real-time responses and controlling your workspace remotely.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Why use this?
*   **Remote Control**: Keep your agent running on your desktop/server and interact with it from your mobile device via Telegram.
*   **Real-time Updates**: The agent can proactively ping you when long-running tasks (like training or builds) complete.
*   **Seamless Integration**: It "types" into your existing tmux session, so your local terminal history remains perfectly in sync with the remote chat.
*   **Smart & Safe**: 
    *   Uses **Smart Injection** to type short messages naturally and paste long blocks instantly.
    *   Waits for **Screen Stability** so it never interrupts the agent while it's thinking or typing.
    *   **Context Awareness**: Incoming messages are prefixed with `[Telegram]: ` so the agent knows the source.
    *   **Mobile Optimized**: Automatically strips CLI garbage and adds double-spacing for readability on small screens.
    *   **Auto-Healing**: Automatically kills stale bridge processes on restart to ensure reliability.

## Prerequisites
1.  **Tmux**: You must be running the Gemini CLI inside a tmux session (default name `gemini-cli`).
2.  **Telegram Bot**:
    *   Open Telegram and search for **@BotFather**.
    *   Start a chat and send `/newbot`.
    *   Follow the prompts to name your bot.
    *   **Copy the API Token** (it looks like `123456:ABC-DEF...`).

## Installation

### Option 1: Via Gemini CLI (Recommended)
```bash
gemini extension install https://github.com/stevenAthompson/gemini-telegram-tmux
```

### Option 2: Manual Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/stevenAthompson/gemini-telegram-tmux.git
    cd gemini-telegram-tmux
    ```
2.  Install dependencies and build:
    ```bash
    npm install
    npm run build
    ```

## Usage

1.  **Start Gemini in Tmux**:
    Use the included helper script to launch a session:
    ```bash
    ./gemini_tmux.sh
    ```
    *(Or manually: `tmux new -s gemini-cli gemini`)*

2.  **Connect (One Time Only)**:
    In the Gemini CLI, simply tell the agent you want to connect:
    > "Connect my Telegram"
    
    The agent will ask for your token. Paste it in, and the agent will handle the rest!

3.  **Chat**:
    Open your bot in Telegram and say "Hello!". You should see the message appear in your terminal, and the agent's response appear on your phone.

4.  **Receive Notifications**:
    Once connected, the agent can proactively ping you when tasks finish:
    > "Hey, that build you started 20 minutes ago just finished!"

## Troubleshooting

*   **"Error: Could not determine current tmux pane"**: Ensure you are running inside tmux (`echo $TMUX` should not be empty).
*   **No response on Telegram**: 
    *   Check the logs: `tail -f /tmp/gemini_telegram_bridge.log`
    *   Verify the bridge process is running: `ps aux | grep bridge.js`
*   **Garbled text**: The extension aggressively cleans ANSI codes and box-drawing characters for mobile readability. If text looks weird, check the terminal on your desktop to see the raw output.
*   **Restarting**: If the bridge gets stuck, simply restart the extension or the Gemini CLI. The "Zombie Killer" logic will automatically clean up old processes and start a fresh one.

## Architecture
This extension spawns a detached Node.js process (`bridge.js`) that:
1.  **Long-polls** the Telegram API for updates.
2.  **Injects** messages into tmux using `send-keys` (for short text) or `paste-buffer` (for code blocks).
3.  **Captures** the pane content after the agent replies.
4.  **Cleans** the output (strips ANSI/ASCII art) and sends it back to Telegram.
5.  **Manages Lifecycle** using a PID file (`/tmp/gemini_telegram_bridge.pid`) to ensure only one instance runs per session.
