// Loads a release from disk for the tests: PYTHEAS_DATA (default ../data next to the site).
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRelease } from '../js/data/store.js';
import { buildLexicon } from '../js/query/lexicon.js';
import { prepare } from '../js/cohort/prepare.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA = process.env.PYTHEAS_DATA || path.join(here, '..', 'data');

export async function load(release = null) {
  const rel = await loadRelease((p) => readFile(path.join(DATA, p.replace(/^data\//, ''))).then((b) => new Uint8Array(b)), { release });
  const reference = JSON.parse(await readFile(path.join(DATA, rel.id, 'reference.json'), 'utf8'));
  return { rel, L: buildLexicon(rel), ctx: prepare(rel), reference };
}

/** The release with the ALPHI fixture of tests/fixtures/alphi in place of its own cluster results. */
export async function loadWithClusters(release = null) {
  const out = await load(release);
  const dir = path.join(here, 'fixtures', 'alphi');
  const read = async (f) => JSON.parse(gunzipSync(await readFile(path.join(dir, f))).toString('utf8'));
  out.rel.clusters = await read('manifest.json.gz');
  out.rel.clusterDetail = (run) => read(path.basename(run.file));
  out.ctx = prepare(out.rel);
  return out;
}
