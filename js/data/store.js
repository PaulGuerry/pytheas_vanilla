// Loads a release (data/releases.json, then data/<release>/...). fetchBytes(path) -> Uint8Array is
// injected, so the same code runs in the browser (fetch) and in Node (fs) for the tests.
// Gzip files are recognised by their first two bytes, whatever headers the server sends.

async function readJson(fetchBytes, path) {
  const bytes = await fetchBytes(path);
  let text;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(bytes);
  }
  return JSON.parse(text);
}

export async function loadRelease(fetchBytes, { base = 'data', release = null } = {}) {
  const releases = await readJson(fetchBytes, `${base}/releases.json`);
  const info = releases.find((r) => r.id === release) || releases[0];
  const dir = `${base}/${info.id}`;
  const [lexicon, hpo, patients, layout] = await Promise.all([
    readJson(fetchBytes, `${dir}/lexicon.json`),
    readJson(fetchBytes, `${dir}/hpo.json.gz`),
    readJson(fetchBytes, `${dir}/patients.json.gz`),
    readJson(fetchBytes, `${dir}/phenomeprint_layout.json`).catch(() => null),
  ]);
  // ALPHI results: the manifest (cluster of every patient) at load time, the rest of a run on demand
  const clusters = info.alphi ? await readJson(fetchBytes, `${dir}/clusters/manifest.json.gz`).catch(() => null) : null;
  const details = new Map();
  const clusterDetail = (run) => {
    if (!details.has(run.key)) details.set(run.key, readJson(fetchBytes, `${dir}/${run.file}`));
    return details.get(run.key);
  };
  return { id: info.id, info, releases, requested: release, lexicon, hpo, patients, layout, clusters, clusterDetail };
}

export async function browserFetchBytes(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
