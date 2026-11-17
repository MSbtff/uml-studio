import { readFile } from 'node:fs/promises';
import { ddlToMermaid } from 'uml-studio-ddl-to-mermaid';

const sqlFile = process.argv[2] ?? new URL('./schema.sql', import.meta.url);

try {
  const sql = await readFile(sqlFile, 'utf8');
  const { erd, mermaid } = ddlToMermaid(sql, { diagramName: 'Database Schema' });
  for (const warning of erd.importMeta.warnings) {
    console.error(warning);
  }
  process.stdout.write(mermaid);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
