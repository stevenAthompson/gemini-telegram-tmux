
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class FileLock {
  private lockFilePath: string;
  private retryInterval: number;
  private maxRetries: number;

  constructor(lockName: string, retryInterval: number = 100, maxRetries: number = 600) { // Default: 60s timeout
    const tmpDir = os.tmpdir();
    this.lockFilePath = path.join(tmpDir, `${lockName}.lock`);
    this.retryInterval = retryInterval;
    this.maxRetries = maxRetries;
  }

  async acquire(): Promise<boolean> {
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        // 'wx' flag fails if file exists
        const fd = fs.openSync(this.lockFilePath, 'wx');
        // Add PID to lock file for debugging and stale check
        fs.writeSync(fd, process.pid.toString());
        fs.closeSync(fd);
        return true;
      } catch (e: any) {
        if (e.code === 'EEXIST') {
          // Check for stale lock
          try {
              const pid = parseInt(fs.readFileSync(this.lockFilePath, 'utf-8'), 10);
              if (!isNaN(pid)) {
                  try {
                      process.kill(pid, 0); // Check if process exists
                  } catch (err: any) {
                      if (err.code === 'ESRCH') {
                          // Process dead, remove stale lock
                          try { fs.unlinkSync(this.lockFilePath); } catch (ignore) {}
                          continue; // Retry immediately
                      }
                  }
              }
          } catch (err) {
              // Ignore read errors, maybe it was just deleted
          }

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, this.retryInterval));
        } else {
          throw e;
        }
      }
    }
    return false;
  }

  release(): void {
    try {
      if (fs.existsSync(this.lockFilePath)) {
          fs.unlinkSync(this.lockFilePath);
      }
    } catch (e) {
      // Ignore errors on release
    }
  }
}
