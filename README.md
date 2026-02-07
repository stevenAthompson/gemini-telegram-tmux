# Gemini Telegram Tmux Bridge

> **Talk to your Gemini Agent from anywhere.**

This extension bridges your local Gemini CLI session to Telegram. It allows you to chat with your running agent from your phone, getting real-time responses and controlling your workspace remotely.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

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
    ```bash
    ./gemini_tmux.sh
    ```

2.  **Configure (Once)**:
    Inside the Gemini CLI:
    ```text
    configure_telegram bot_token="YOUR_BOT_TOKEN_HERE"
    ```

3.  **Chat**:
    Open your bot in Telegram and say "Hello!".

## How it Works
- The extension automatically starts a background bridge process when Gemini loads (if configured).
- It uses `tmux` to safely inject messages and capture responses.