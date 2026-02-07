# Gemini Telegram Tmux Bridge

> **Talk to your Gemini Agent from anywhere.**

This extension bridges your local Gemini CLI session to Telegram. It allows you to chat with your running agent from your phone, getting real-time responses and controlling your workspace remotely.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Why use this?
*   **Remote Control**: Keep your agent running on your desktop/server and interact with it from your mobile device via Telegram.
*   **Real-time Updates**: Get notified when long-running tasks complete.
*   **Seamless Integration**: It "types" into your existing tmux session, so your local terminal history remains perfectly in sync with the remote chat.
*   **Safety First**: Uses smart locking and stability checks to ensure it never interrupts the agent (or you) while typing.

## Prerequisites
1.  **Tmux**: You must be running the Gemini CLI inside a tmux session named `gemini-cli` (default).
2.  **Telegram Bot**:
    *   Open Telegram and search for **@BotFather**.
    *   Send `/newbot` and follow the instructions.
    *   Copy the **API Token** it gives you.

## Installation

### Option 1: Via Gemini CLI (Recommended)
If you have the Gemini CLI installed, you can install this extension directly from GitHub:

```bash
gemini install https://github.com/steven-thompson/gemini-telegram-tmux
```
*(Replace with the actual repository URL)*

### Option 2: Manual Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/steven-thompson/gemini-telegram-tmux.git
    cd gemini-telegram-tmux
    ```
2.  Install dependencies and build:
    ```bash
    npm install
    npm run build
    ```
3.  Add it to your Gemini config manually.

## Usage

1.  **Start Gemini in Tmux**:
    Open your terminal and create a new session (or attach to an existing one):
    ```bash
    tmux new -s gemini-cli
    gemini
    ```

2.  **Connect the Bridge**:
    Inside the Gemini CLI, tell the agent to start the bridge:
    ```text
    start_telegram_bridge bot_token="YOUR_BOT_TOKEN_HERE"
    ```

3.  **Chat**:
    Open your bot in Telegram and say "Hello!". You should see the message appear in your terminal, and the agent's response appear on your phone.

## Troubleshooting

*   **"Error: Could not determine current tmux pane"**: Ensure you are actually running inside a tmux session.
*   **No response on Telegram**: Check the logs at the path returned by the tool (usually `/tmp/gemini_telegram_bridge.log` or similar).
*   **Garbled text**: Avoid typing furiously in the terminal window while simultaneously sending messages from Telegram. The bridge tries to be polite (waiting for idle time), but race conditions are possible if you fight it.

## Architecture
This extension spawns a detached Node.js process that:
1.  Long-polls the Telegram API.
2.  Uses `tmux capture-pane` and `tmux send-keys` to interact with the shell.
3.  Uses a file lock (`/tmp/gemini-telegram-bridge.lock`) to synchronize access.
