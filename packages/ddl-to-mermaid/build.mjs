import { copyFile, mkdir, readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const sharedModules = manifest.files.filter((file) => file.startsWith('dist/'));

await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await Promise.all(
  sharedModules.map((file) =>
    copyFile(new URL(`../../${file.slice('dist/'.length)}`, import.meta.url), new URL(file, import.meta.url)),
  ),
);
await copyFile(new URL('../../LICENSE', import.meta.url), new URL('./LICENSE', import.meta.url));
