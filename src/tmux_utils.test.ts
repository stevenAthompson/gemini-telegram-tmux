
import { describe, it, mock } from 'node:test';
import * as assert from 'node:assert';
import * as child_process from 'node:child_process';
import * as tmux from './tmux_utils.js';

describe('tmux_utils', () => {
    it('isInsideTmuxSession should return true if TMUX is set and session matches', () => {
        // Mock env
        process.env.TMUX = '/tmp/tmux-1000/default,123,0';
        const execMock = mock.method(tmux._exec, 'execSync', () => 'gemini-cli\n');
        
        assert.strictEqual(tmux.isInsideTmuxSession(), true);
        execMock.mock.restore();
    });

    it('capturePane should construct correct command', () => {
        const execMock = mock.method(tmux._exec, 'execSync', (cmd: string) => {
            if (cmd.includes('-S -100')) {
                return 'history content';
            }
            return 'pane content';
        });

        const result = tmux.capturePane('target', 100);
        assert.strictEqual(result, 'history content');
        execMock.mock.restore();
    });
});
