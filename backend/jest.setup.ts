import * as fs from 'fs';
import * as path from 'path';

const isWindows = process.platform === 'win32';
const binaryName = isWindows ? 'mongod.exe' : 'mongod';

function isExecutable(candidate: string): boolean {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** آخرین نسخه‌ی نصب‌شده را از پوشه‌های `Server/<version>/bin` پیدا می‌کند (ویندوز) */
function findInWindowsProgramFiles(): string | undefined {
  const roots = [
    process.env['ProgramFiles'] ?? 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
  ]
    .map((pf) => path.join(pf, 'MongoDB', 'Server'))
    .filter((p) => fs.existsSync(p));

  const candidates: string[] = [];
  for (const root of roots) {
    try {
      const versions = fs
        .readdirSync(root)
        .filter((entry) => /^\d+\.\d+/.test(entry))
        // جدیدترین نسخه در انتها (مرتب‌سازی نسخه‌ای ساده)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      for (const version of versions) {
        candidates.push(path.join(root, version, 'bin', binaryName));
      }
    } catch {
      // پوشه قابل خواندن نیست — رد می‌شویم
    }
  }
  return [...candidates].reverse().find(isExecutable);
}

function findInPath(): string | undefined {
  const dirs = (process.env['PATH'] ?? '').split(path.delimiter).filter(Boolean);
  return dirs.map((dir) => path.join(dir, binaryName)).find((candidate) => isExecutable(candidate));
}

function findInCommonLocations(): string | undefined {
  const candidates = [
    '/usr/bin/mongod',
    '/usr/local/bin/mongod',
    '/opt/homebrew/bin/mongod',
    '/opt/local/bin/mongod',
  ];
  return candidates.find(isExecutable);
}

function resolveSystemBinary(): string | undefined {
  if (process.env['MONGOMS_SYSTEM_BINARY']) return undefined; // خود کاربر ست کرده
  const fromEnv = process.env['MONGOD_PATH'];
  if (fromEnv && isExecutable(fromEnv)) return fromEnv;

  const found =
    (isWindows ? findInWindowsProgramFiles() : undefined) ??
    findInPath() ??
    findInCommonLocations();

  return found;
}

/** نسخه‌ی باینری را از `mongod --version` می‌خواند تا هشدار conflict چاپ نشود */
function readBinaryVersion(binary: string): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const output = execFileSync(binary, ['--version'], {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    });
    const match = /db version v(\d+\.\d+\.\d+)/.exec(output);
    return match?.[1];
  } catch {
    return undefined;
  }
}

const systemBinary = resolveSystemBinary();
if (systemBinary) {
  process.env['MONGOMS_SYSTEM_BINARY'] = systemBinary;
  if (!process.env['MONGOMS_VERSION']) {
    const version = readBinaryVersion(systemBinary);
    if (version) process.env['MONGOMS_VERSION'] = version;
  }
  // eslint-disable-next-line no-console
  console.log(
    `ℹ️ [jest.setup] استفاده از mongod محلی: ${systemBinary}${process.env['MONGOMS_VERSION'] ? ` (v${process.env['MONGOMS_VERSION']})` : ''}`,
  );
} else {
  // eslint-disable-next-line no-console
  console.log(
    'ℹ️ [jest.setup] mongod محلی یافت نشد — mongodb-memory-server باینری را دانلود می‌کند.',
  );
}

export {};
