import { execSync } from 'child_process';
import { FileLock } from './file_lock.js';

export const SESSION_NAME = process.env.GEMINI_TMUX_SESSION_NAME || 'gemini-cli';

export const _exec = {
    execSync: (cmd: string) => execSync(cmd, { encoding: 'utf-8' })
};

export function isInsideTmuxSession(): boolean {
  if (!process.env.TMUX) {
    return false;
  }
  try {
    const currentSessionName = _exec.execSync('tmux display-message -p "#S"').trim();
    return currentSessionName === SESSION_NAME;
  } catch (error) {
    return false;
  }
}

export function getPaneId(): string {
    try {
        return _exec.execSync('tmux display-message -p "#{pane_id}"').trim();
    } catch (e) {
        return '';
    }
}

export async function waitForStability(target: string, stableDurationMs: number = 2000, pollingIntervalMs: number = 500, timeoutMs: number = 30000): Promise<boolean> {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const requiredChecks = Math.ceil(stableDurationMs / pollingIntervalMs);
    
    let lastContent = '';
    let stableChecks = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        await delay(pollingIntervalMs);
        
        let currentContent = '';
        try {
            const textContent = _exec.execSync(`tmux capture-pane -p -t ${target}`);
            const cursorPosition = _exec.execSync(`tmux display-message -p -t ${target} "#{cursor_x},#{cursor_y}"`).trim();
            currentContent = `${textContent}
__CURSOR__:${cursorPosition}`;
        } catch (e) {
            continue;
        }

        if (currentContent === lastContent) {
            stableChecks++;
        } else {
            stableChecks = 0;
            lastContent = currentContent;
        }

        if (stableChecks >= requiredChecks) {
            return true;
        }
    }
    return false;
}

export function sendKeys(target: string, keys: string) {
    const escapedKeys = keys.replace(/'/g, "'\\''");
    _exec.execSync(`tmux send-keys -t ${target} '${escapedKeys}'`);
}

/**
 * Types text into the tmux pane character by character with delays.
 * This mimics human typing to avoid overwhelming the shell/REPL buffer.
 */
export async function typeText(target: string, text: string, delayMs: number = 20) {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Clear line first (optional, but safer)
    // _exec.execSync(`tmux send-keys -t ${target} Escape C-u`);
    // await delay(100);

    for (const char of text) {
        let key = char;
        // Escape single quote for shell
        if (key === "'") key = "'\\''";
        
        // Handle special chars if needed, but usually literal is fine for send-keys
        // except for Space which might be treated as argument separator if not quoted?
        // tmux send-keys handles most.
        
        try {
            _exec.execSync(`tmux send-keys -t ${target} '${key}'`);
        } catch (e) {
            // ignore
        }
        await delay(delayMs);
    }
}

export function capturePane(target: string, lines?: number): string {
    let cmd = `tmux capture-pane -p -t ${target}`;
    if (lines) {
        cmd += ` -S -${lines}`;
    }
    return _exec.execSync(cmd);
}