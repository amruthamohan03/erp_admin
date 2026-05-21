import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateOpenApiDocument } from '../src/lib/openapi';

const doc = generateOpenApiDocument();
const out = resolve(process.cwd(), 'openapi.json');
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`Wrote ${out} (${Object.keys(doc.components?.schemas ?? {}).length} schemas)`);
