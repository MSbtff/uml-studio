import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const compiler = fileURLToPath(new URL('node_modules/typescript/bin/tsc', root));
const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const sharedPrefix = 'dist/shared/';
const sharedFiles = manifest.files.filter((file) => file.startsWith(sharedPrefix));
const compiledEditor = await mkdtemp(join(tmpdir(), 'uml-studio-npm-'));

try {
  execFileSync(
    process.execPath,
    [compiler, '-p', fileURLToPath(new URL('tsconfig.json', root)), '--outDir', compiledEditor, '--sourceMap', 'false'],
    {
      stdio: 'inherit',
    },
  );
  execFileSync(process.execPath, [compiler, '-p', fileURLToPath(new URL('./tsconfig.json', import.meta.url))], {
    stdio: 'inherit',
  });

  await Promise.all(
    sharedFiles.map(async (file) => {
      const output = fileURLToPath(new URL(file, import.meta.url));
      await mkdir(dirname(output), { recursive: true });
      await copyFile(join(compiledEditor, file.slice(sharedPrefix.length)), output);
    }),
  );
  await copyFile(new URL('LICENSE', root), new URL('./LICENSE', import.meta.url));
} finally {
  await rm(compiledEditor, { recursive: true, force: true });
}
