import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ToolDef } from './index.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_CHARS = 10_000;

/* ─────────────────────────────────────────────────────────────────
 * run_code — sandboxed Python executor.
 *
 * Isolation: --network none, --read-only rootfs, --tmpfs /tmp,
 * bounded RAM + swap, 0.5 CPU, hard timeout via execFile timeout.
 *
 * Script is written to a host temp file and volume-mounted read-only
 * into the container — avoids shell injection via -c flags.
 *
 * Input data: passed as SANDBOX_INPUT env var (JSON string).
 * Output: stdout, capped at MAX_OUTPUT_CHARS.
 * ───────────────────────────────────────────────────────────────── */

export const runCodeTool: ToolDef = {
  name: 'run_code',
  description:
    'Execute a Python 3 script in an isolated sandbox (no network, 256 MB RAM, 30 s timeout). ' +
    'Libraries available: beautifulsoup4, lxml, pandas, requests (parsing only — no outbound calls). ' +
    'Pass data in via `input` (string or JSON); read it with: ' +
    '  import os, json; data = json.loads(os.environ.get("SANDBOX_INPUT", "null")). ' +
    'Everything printed to stdout is returned (max 10 000 chars). ' +
    'Use for: parsing HTML tables, fuzzy-matching company lists, structuring scraped text.',
  parametersSchema: '{"code": string, "input"?: string}',
  handler: async (args, _ctx) => {
    if (!env.SANDBOX_ENABLED) {
      return {
        ok: false,
        output:
          'Code sandbox is disabled. Set SANDBOX_ENABLED=true and build the image: ' +
          'docker build -t leadreai-sandbox:latest workers/sandbox/',
      };
    }

    const code = String(args?.code ?? '').trim();
    if (!code) return { ok: false, output: 'code is required' };

    // Always JSON-encode so the value is a safe, single-line string with no
    // newlines or null bytes that could corrupt Docker's -e argument parsing.
    const inputStr: string = JSON.stringify(
      args?.input == null ? null : args.input,
    );

    const runId = randomUUID();
    const containerName = `leadreai-sandbox-${runId}`;
    const tmpDir = join(tmpdir(), `sandbox-${runId}`);
    const scriptPath = join(tmpDir, 'script.py');

    try {
      await mkdir(tmpDir, { recursive: true });
      await writeFile(scriptPath, code, 'utf-8');

      const dockerArgs = [
        'run', '--rm',
        '--name', containerName,
        '--network', 'none',
        '--memory', `${env.SANDBOX_MEMORY_MB}m`,
        '--memory-swap', `${env.SANDBOX_MEMORY_MB}m`, // disable swap
        '--cpus', '0.5',
        '--read-only',
        '--tmpfs', '/tmp:size=64m,mode=1777',
        '-v', `${scriptPath}:/sandbox/script.py:ro`,
        '-e', `SANDBOX_INPUT=${inputStr}`,
        env.SANDBOX_IMAGE,
        'python', '-u', '/sandbox/script.py',
      ];

      const startMs = Date.now();
      const result = await execFileAsync('docker', dockerArgs, {
        timeout: env.SANDBOX_TIMEOUT_MS,
        maxBuffer: (MAX_OUTPUT_CHARS + 4096) * 4,
      });
      const durationMs = Date.now() - startMs;

      const stdout = result.stdout.slice(0, MAX_OUTPUT_CHARS);
      const truncated = result.stdout.length > MAX_OUTPUT_CHARS;

      logger.info('[runCode] complete', { durationMs, truncated });

      return {
        ok: true,
        output: truncated ? `${stdout}\n[output truncated at ${MAX_OUTPUT_CHARS} characters]` : stdout,
        meta: { durationMs, truncated },
      };
    } catch (err: unknown) {
      const e = err as {
        killed?: boolean;
        stdout?: string;
        stderr?: string;
        message?: string;
      };

      if (e.killed) {
        return {
          ok: false,
          output: `Sandbox timed out after ${env.SANDBOX_TIMEOUT_MS} ms.`,
        };
      }

      // Docker exits non-zero on Python exceptions — stderr has the traceback.
      const stderr = (e.stderr ?? '').slice(0, 2000);
      if (stderr) {
        return { ok: false, output: `Python error:\n${stderr}` };
      }

      logger.warn('[runCode] error', { err: e.message });
      return {
        ok: false,
        output: `Sandbox error: ${e.message ?? String(err)}`,
      };
    } finally {
      // Force-remove the container in case execFile timeout left it running.
      await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
