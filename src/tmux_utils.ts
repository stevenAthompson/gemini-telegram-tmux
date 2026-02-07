import { execSync, spawnSync } from 'child_process';
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
 * Pastes text using tmux load-buffer + paste-buffer.
 * Safer for large blocks of text.
 */
export function pasteText(target: string, text: string) {
    // 1. Load buffer (using spawnSync to safely handle stdin)
    const child = spawnSync('tmux', ['load-buffer', '-'], {
        input: text,
        encoding: 'utf-8'
    });
    
    if (child.error) throw child.error;

    // 2. Paste
    _exec.execSync(`tmux paste-buffer -t ${target}`);
}

/**
 * Types text into the tmux pane character by character.
 */
export async function typeText(target: string, text: string, delayMs: number = 20) {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    for (const char of text) {
        let key = char;
        if (key === "'") key = "'\\''";
        try {
            _exec.execSync(`tmux send-keys -t ${target} '${key}'`);
        } catch (e) { /* ignore */ }
        await delay(delayMs);
    }
}

/**
 * Smart injection:
 * - Clears line.
 * - If short, types it (natural).
 * - If long, pastes it (fast).
 * - Submits with atomic Double-Enter sequence.
 */
export async function injectCommand(target: string, message: string) {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // 1. Clear Input
    try {
        _exec.execSync(`tmux send-keys -t ${target} Escape`);
        await delay(100);
        _exec.execSync(`tmux send-keys -t ${target} C-u`);
        await delay(200);

        // 2. Type or Paste
        if (message.length > 200) {
            pasteText(target, message);
        } else {
            await typeText(target, message, 20);
        }

        // 3. Submit
        await delay(500);
        _exec.execSync(`tmux send-keys -t ${target} Enter`);
        await delay(500);
        _exec.execSync(`tmux send-keys -t ${target} Enter`);
        
    } catch (e) {
        console.error(`Failed to inject command via tmux: ${e}`);
        throw e;
    }
}

export function capturePane(target: string, lines?: number): string {
    let cmd = `tmux capture-pane -p -t ${target}`;
    if (lines) {
        cmd += ` -S -${lines}`;
    }
    return _exec.execSync(cmd).toString();
}