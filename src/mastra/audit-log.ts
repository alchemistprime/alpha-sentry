import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface AuditEntry {
  ts: string;
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
  sourceUrls: string[];
  toolCallId: string;
  duration?: number;
}

const AUDIT_DIR = join(process.cwd(), '.dexter', 'scratchpad');
const AUDIT_FILE = join(AUDIT_DIR, 'audit.jsonl');

let dirEnsured = false;

export async function appendAudit(entry: AuditEntry): Promise<void> {
  if (process.env.VERCEL) return;
  try {
    if (!dirEnsured) {
      await mkdir(AUDIT_DIR, { recursive: true });
      dirEnsured = true;
    }
    await appendFile(AUDIT_FILE, JSON.stringify(entry) + '\n');
  } catch {
    process.stderr.write(`[audit-log] failed to write audit entry\n`);
  }
}
