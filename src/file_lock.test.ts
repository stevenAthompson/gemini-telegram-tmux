
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileLock } from './file_lock.js';

describe('FileLock', () => {
    const lockName = 'test-lock-' + Date.now();
    const lockFile = path.join(os.tmpdir(), `${lockName}.lock`);

    it('should acquire a lock', async () => {
        const lock = new FileLock(lockName);
        const acquired = await lock.acquire();
        assert.strictEqual(acquired, true);
        assert.ok(fs.existsSync(lockFile));
        lock.release();
    });

    it('should release a lock', async () => {
        const lock = new FileLock(lockName);
        await lock.acquire();
        lock.release();
        assert.strictEqual(fs.existsSync(lockFile), false);
    });

    it('should fail if locked by another', async () => {
        const lock1 = new FileLock(lockName);
        const lock2 = new FileLock(lockName, 10, 5); // Fast fail

        await lock1.acquire();
        const acquired2 = await lock2.acquire();
        assert.strictEqual(acquired2, false);
        
        lock1.release();
    });
});
