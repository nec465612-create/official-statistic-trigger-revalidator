import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('ABI Alignment & Prohibited Claims Scanner', () => {
  const EXACT_17_ABI_METHODS = [
    { name: 'create_trigger', arity: 6, type: 'write' },
    { name: 'freeze_trigger', arity: 1, type: 'write' },
    { name: 'observe_initial', arity: 1, type: 'write' },
    { name: 'revalidate_trigger', arity: 1, type: 'write' },
    { name: 'close_trigger', arity: 1, type: 'write' },
    { name: 'bind_consumer', arity: 2, type: 'write' },
    { name: 'get_trigger_count', arity: 0, type: 'view' },
    { name: 'get_trigger', arity: 1, type: 'view' },
    { name: 'get_triggers_page', arity: 2, type: 'view' },
    { name: 'get_vintage_count', arity: 1, type: 'view' },
    { name: 'get_vintage', arity: 2, type: 'view' },
    { name: 'get_vintages_page', arity: 3, type: 'view' },
    { name: 'get_effective_trigger_state', arity: 1, type: 'view' },
    { name: 'get_consumer_binding', arity: 2, type: 'view' },
    { name: 'get_owner_nonce_trigger', arity: 2, type: 'view' },
    { name: 'get_upgrader', arity: 0, type: 'view' },
    { name: 'upgrade', arity: 1, type: 'write' },
  ];

  it('verifies exact 17 ABI methods definition', () => {
    expect(EXACT_17_ABI_METHODS.length).toBe(17);
    const writeMethods = EXACT_17_ABI_METHODS.filter((m) => m.type === 'write');
    const viewMethods = EXACT_17_ABI_METHODS.filter((m) => m.type === 'view');
    expect(writeMethods.length).toBe(7);
    expect(viewMethods.length).toBe(10);
  });

  const getSourceFiles = (dir: string): string[] => {
    const results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== '__tests__' && file !== 'node_modules') {
          results.push(...getSourceFiles(fullPath));
        }
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(fullPath);
      }
    }
    return results;
  };

  it('scans all frontend source files asserting ZERO occurrences of forbidden methods', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const sourceFiles = getSourceFiles(srcDir);
    expect(sourceFiles.length).toBeGreaterThan(0);

    const FORBIDDEN_METHODS = [
      'get_trigger_by_index',
      'get_vintages', // Replaced by get_vintages_page
      'register_consumer_binding', // Replaced by bind_consumer
      'is_trigger_active', // Replaced by get_effective_trigger_state
    ];

    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const forbidden of FORBIDDEN_METHODS) {
        // Match exact word identifier to avoid partial false matches
        const regex = new RegExp(`\\b${forbidden}\\b`, 'g');
        if (regex.test(content)) {
          violations.push(`File ${path.basename(filePath)} contains forbidden method call: ${forbidden}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('scans all frontend source files asserting ZERO occurrences of prohibited non-economic claims', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const sourceFiles = getSourceFiles(srcDir);
    expect(sourceFiles.length).toBeGreaterThan(0);

    const PROHIBITED_CLAIMS = [
      /\bDeFi\b/i,
      /\binsurance\b/i,
      /\bpayroll\b/i,
      /\btreasury\b/i,
      /\binflation hedging\b/i,
      /\breal-time\b/i,
    ];

    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of PROHIBITED_CLAIMS) {
        if (pattern.test(content)) {
          violations.push(`File ${path.basename(filePath)} matched prohibited claim pattern: ${pattern.toString()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('exposes the complete recovery UI without an automatic resubmit action', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/TxStatusBar.tsx'), 'utf-8');
    for (const phase of [
      'WAITING_FOR_WALLET', 'SUBMITTED', 'WAITING_FOR_FINALITY', 'VERIFYING_EXECUTION',
      'VERIFYING_READBACK', 'SUCCESS', 'REJECTED', 'FAILED', 'RECONCILIATION_REQUIRED',
    ]) {
      expect(source).toContain(phase);
    }
    expect(source).toContain('Continue verification');
    expect(source).toContain('Clear failed attempt');
    expect(source).toContain('Copy hash');
    expect(source).toContain('View transaction');
    expect(source).toContain('data-transaction-phase');
    expect(source).not.toContain('executeWrite(');
  });
});
