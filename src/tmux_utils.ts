import { execSync } from 'child_process';
import { FileLock } from './file_lock.js';

export const SESSION_NAME = process.env.GEMINI_TMUX_SESSION_NAME || 'gemini-cli';

// Internal exec wrapper (kept for consistency/mocking, but sendNotification uses execSync directly in reference)
export const _exec = {
    execSync: (cmd: string) => execSync(cmd, { encoding: 'utf-8' })
};

export function isInsideTmuxSession(): boolean {
  if (!process.env.TMUX) {
    return false;
  }
  try {
    const currentSessionName = execSync('tmux display-message -p "#S"', { encoding: 'utf-8' }).trim();
    return currentSessionName === SESSION_NAME;
  } catch (error) {
    return false;
  }
}

export function getPaneId(): string {
    try {
        return execSync('tmux display-message -p "#{pane_id}"', { encoding: 'utf-8' }).trim();
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
            const textContent = execSync(`tmux capture-pane -p -t ${target}`, { encoding: 'utf-8' });
            const cursorPosition = execSync(`tmux display-message -p -t ${target} "#{cursor_x},#{cursor_y}"`, { encoding: 'utf-8' }).trim();
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
    execSync(`tmux send-keys -t ${target} '${escapedKeys}'`, { encoding: 'utf-8' });
}

export function capturePane(target: string, lines?: number): string {
    let cmd = `tmux capture-pane -p -t ${target}`;
    if (lines) {
        cmd += ` -S -${lines}`;
    }
    return execSync(cmd, { encoding: 'utf-8' });
}

/**
 * Injects a command into the tmux pane using the exact logic from the reference implementation.
 * Clears line, types slowly, and double-enters.
 */
export async function injectCommand(target: string, message: string) {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Clear input
    try {
        execSync(`tmux send-keys -t ${target} Escape`, { encoding: 'utf-8' });
        await delay(100);
        execSync(`tmux send-keys -t ${target} C-u`, { encoding: 'utf-8' });
        await delay(200);

        for (const char of message) {
            const escapedChar = char === "'" ? "'\\''" : char;
            execSync(`tmux send-keys -t ${target} '${escapedChar}'`, { encoding: 'utf-8' });
            await delay(20);
        }
        await delay(500);
        execSync(`tmux send-keys -t ${target} Enter`, { encoding: 'utf-8' });
        await delay(500);
        execSync(`tmux send-keys -t ${target} Enter`, { encoding: 'utf-8' });
    } catch (e) {
        console.error(`Failed to inject command via tmux: ${e}`);
        throw e;
    }
}
