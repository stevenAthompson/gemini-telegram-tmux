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

# IMPORTANT NOTES
- This will be installed by a user from github. It will need to work wihtout requiring them to "npm install" things are create symlinks, etc.
- Code should have comments and unit tests.
- Unit tests shoudl test fucntionality and not just be simple Assert(true) placeholders.
- .gitignore should ignore the temp folder, an reference folder if there is one, and any secrets or keys. 
- Unique MCP Server Names: Never default to "main" for the MCP server name in gemini-extension.json. Always generate a unique ID or use the extension's name (e.g., "astGrep", "myTool"). Conflicting names cause extensions to silently overwrite each other's tool registrations.
- Avoid `node_modules/.bin` Symlinks: When distributing node_modules via Git (to avoid npm install for end-users), do not rely on the symlinks in .bin/. They often contain absolute paths generated at build time which break on other machines. Always resolve the path to the executable package directly (e.g., node_modules/@scope/pkg/bin/cli.js).
- Portable Path Resolution: Always resolve internal paths (like binaries, worker scripts, or config files) relative to import.meta.url (ESM) or __dirname (CJS), never relative to process.cwd(). This ensures the extension works regardless of the user's current working directory.
- Detached Workers for Async Tasks: Long-running tasks (like large searches or those waiting for external events like tmux stability) must run in a detached process. Blocking the main Node.js event loop—even for a few seconds—causes the MCP server to miss heartbeats, leading the Gemini CLI to assume the extension has crashed and disconnect it.
- Shared Resources require Shared Locks: If multiple extensions interact with a singleton resource (like the terminal via tmux), they must coordinate using a shared lock file ID. Using unique lock names for each extension defeats the purpose and leads to race conditions (garbled text).
- Fail Fast in Stability Checks: When waiting for a resource (like a tmux session), explicitly check for "resource not found" errors and abort immediately. Indefinite retries or long timeouts for fatal errors cause the tool to hang and frustrate the user.
- Explicit Exit Codes: Wrapper tools should handle underlying CLI exit codes semantically. For search tools, exit code 1 often means "nothing found", which is a valid result, not an error. The tool should return a helpful message ("No matches") rather than throwing a generic error.
- Output to Files for Large Results: For async operations returning potentially large data, write to a temporary file and return the path. Passing huge strings through tmux notifications or even IPC can be slow, truncated, or unstable.
- Test Environment Awareness: Integration tests involving system resources (like tmux) should be aware of the test environment (CI vs local) and skip or mock interactions that cannot be reliably reproduced in an automated setting.
- Include Compiled Code: If the user is not expected to build the project, ensure the dist/ (or build output) directory is committed and kept in sync with src/ changes. A mismatch here leads to "it works on my machine" bugs.