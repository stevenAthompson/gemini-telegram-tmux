import { execSync } from 'child_process';
export const SESSION_NAME = process.env.GEMINI_TMUX_SESSION_NAME || 'gemini-cli';
/**
 * Internal exec wrapper to facilitate mocking in tests.
 */
export const _exec = {
    execSync: (cmd) => execSync(cmd, { encoding: 'utf-8' })
};
export function isInsideTmuxSession() {
    if (!process.env.TMUX) {
        return false;
    }
    try {
        const currentSessionName = _exec.execSync('tmux display-message -p "#S"').trim();
        return currentSessionName === SESSION_NAME;
    }
    catch (error) {
        return false;
    }
}
export function getPaneId() {
    try {
        return _exec.execSync('tmux display-message -p "#{pane_id}"').trim();
    }
    catch (e) {
        return '';
    }
}
export async function waitForStability(target, stableDurationMs = 2000, pollingIntervalMs = 500, timeoutMs = 30000) {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
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
            currentContent = `${textContent}\n__CURSOR__:${cursorPosition}`;
        }
        catch (e) {
            continue;
        }
        if (currentContent === lastContent) {
            stableChecks++;
        }
        else {
            stableChecks = 0;
            lastContent = currentContent;
        }
        if (stableChecks >= requiredChecks) {
            return true;
        }
    }
    return false;
}
export function sendKeys(target, keys) {
    const escapedKeys = keys.replace(/'/g, "'\\''");
    _exec.execSync(`tmux send-keys -t ${target} '${escapedKeys}'`);
}
export function capturePane(target, lines) {
    let cmd = `tmux capture-pane -p -t ${target}`;
    if (lines) {
        cmd += ` -S -${lines}`;
    }
    return _exec.execSync(cmd);
}
