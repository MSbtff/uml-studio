import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SUPPORT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SUPPORT_DIRECTORY, '../../..');
const SERVER_SCRIPT = path.join(SUPPORT_DIRECTORY, 'run_test_server.py');
const START_TIMEOUT_MS = 10_000;
const STOP_TIMEOUT_MS = 3_000;

function timeout(milliseconds, message) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    timer.unref?.();
  });
}

async function firstOutputLine(child, stderr) {
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    const result = await Promise.race([
      once(lines, 'line').then(([line]) => line),
      once(child, 'exit').then(([code, signal]) => {
        throw new Error(`E2E server exited before startup (code=${code}, signal=${signal}): ${stderr()}`);
      }),
      timeout(START_TIMEOUT_MS, `E2E server did not start within ${START_TIMEOUT_MS}ms`),
    ]);
    return result;
  } finally {
    lines.close();
  }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  try {
    await Promise.race([once(child, 'exit'), timeout(STOP_TIMEOUT_MS, 'E2E server did not stop after SIGTERM')]);
  } catch (_) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await once(child, 'exit').catch(() => {});
  }
}

export async function startTestServer() {
  let stderr = '';
  const child = spawn(process.env.PYTHON || 'python3', ['-u', SERVER_SCRIPT], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  let metadata;
  try {
    metadata = JSON.parse(await firstOutputLine(child, () => stderr.trim()));
  } catch (error) {
    await stopChild(child);
    throw error;
  }
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(metadata.url || '')) {
    await stopChild(child);
    throw new Error(`Invalid E2E server metadata: ${JSON.stringify(metadata)}`);
  }

  return Object.freeze({
    ...metadata,
    processId: child.pid,
    async stop() {
      await stopChild(child);
    },
  });
}
