let clusterDataCache = null;

export let diseasesIndex = {};
export let hpoDescriptors = {};
let entityLexicon = null;
let hpoDagCache = null;




export async function loadHpoDag() {
  if (hpoDagCache) return hpoDagCache;
  try {
    hpoDagCache = await fetchGzipOrJson('data/hpo_dag.json.gz');
  } catch (err) {
    console.warn("Could not load hpo_dag.json.gz:", err);
    hpoDagCache = {};
  }
  return hpoDagCache;
}

/**
 * Universal helper for GitHub Pages to intercept and 
 * manually unzip raw .gz files via JavaScript.
 */
export async function fetchGzipOrJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error ${response.status}`);
  
  // GitHub Pages won't send this header for .gz files, but we check just in case
  const encoding = response.headers.get('Content-Encoding');
  if (encoding === 'gzip' || encoding === 'deflate') {
    return await response.json();
  }

  // Decompress manually if it's a .gz file and the browser supports it
  if (url.includes('.gz') && typeof DecompressionStream !== 'undefined') {
    const decompressedStream = response.body.pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(decompressedStream).text();
    return JSON.parse(text);
  }

  // Fallback for native uncompressed .json files
  return await response.json();
}

export async function loadLexicon() {
  if (entityLexicon) return entityLexicon;
  try {
    // Pointed directly to your new .gz file
    entityLexicon = await fetchGzipOrJson('data/entity_lexicon.json.gz');
  } catch (err) {
    console.warn("Could not load entity_lexicon.json.gz, falling back to legacy parsing:", err);
    try {
      entityLexicon = await fetchGzipOrJson('data/entity_lexicon.json');
    } catch (e) {
      entityLexicon = {};
    }
  }
  return entityLexicon;
}

export async function initData() {
  try {
    // Point both base assets to their .gz counterparts
    const [diseasesRes, hpoRes] = await Promise.all([
      fetchGzipOrJson('data/diseases_index.json.gz').catch(() => 
        fetchGzipOrJson('data/diseases_index.json')
      ),
      fetchGzipOrJson('data/hpo_descriptors.json.gz').catch(err => {
        console.warn("Could not load HPO descriptors .gz, trying raw fallback", err);
        return fetchGzipOrJson('data/hpo_descriptors.json').catch(() => ({}));
      })
    ]);

    diseasesIndex = diseasesRes || {};
    hpoDescriptors = hpoRes || {};
  } catch (e) {
    console.warn("Could not load application initial data", e);
  }
  return diseasesIndex;
}

export function getHpoLabel(hpoCode) {
  if (!hpoCode) return '';
  return hpoDescriptors[hpoCode] || hpoCode;
}

export function getRandomComparisonTargets() {
  const allKeys = Object.keys(diseasesIndex || {});
  if (allKeys.length < 2) return allKeys;

  const topLevelDiseases = allKeys.filter(k => !k.includes(':'));

  const geneSubgroups = allKeys.filter(k => {
    const parts = k.split(':');
    return parts.length === 3 && parts[1] === 'gene';
  });

  const diseaseGeneMap = {};
  geneSubgroups.forEach(k => {
    const parent = k.split(':')[0];
    if (!diseaseGeneMap[parent]) diseaseGeneMap[parent] = [];
    diseaseGeneMap[parent].push(k);
  });

  const parentsWithMultipleGenes = Object.keys(diseaseGeneMap).filter(
    parent => diseaseGeneMap[parent].length >= 2
  );

  const chooseSameDiseaseSubgroups = Math.random() < 0.5;

  if (chooseSameDiseaseSubgroups && parentsWithMultipleGenes.length > 0) {
    const randomParent = parentsWithMultipleGenes[Math.floor(Math.random() * parentsWithMultipleGenes.length)];
    const availableGenes = diseaseGeneMap[randomParent].sort(() => 0.5 - Math.random());
    return [availableGenes[0], availableGenes[1]];
  } else if (topLevelDiseases.length >= 2) {
    const shuffledDiseases = topLevelDiseases.sort(() => 0.5 - Math.random());
    return [shuffledDiseases[0], shuffledDiseases[1]];
  }

  const fallbackKeys = topLevelDiseases.length >= 2 ? topLevelDiseases : allKeys;
  const shuffled = fallbackKeys.sort(() => 0.5 - Math.random());
  return [shuffled[0], shuffled[1]];
}

export async function loadClusterData() {
    if (clusterDataCache) return clusterDataCache;

    try {
        const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
        const url = isLocal ? `data/cluster_data.json.gz?v=${Date.now()}` : 'data/cluster_data.json.gz';
        
        // Routed through the central helper to fix GitHub Pages downloads
        clusterDataCache = await fetchGzipOrJson(url);
        return clusterDataCache;
    } catch (error) {
        console.error("Failed to load or decompress data/cluster_data.json.gz:", error);
        return null;
    }
}

export function getCohortData(diseaseMatch) {
  console.log('[DEBUG] getCohortData called with item:', diseaseMatch);
  if (!diseaseMatch) return {};
  if (diseaseMatch.fullKey && diseasesIndex[diseaseMatch.fullKey]) {
    return diseasesIndex[diseaseMatch.fullKey];
  }

  if (diseaseMatch.data && Object.keys(diseaseMatch.data).length > 0) {
    return diseaseMatch.data;
  }

  const subCat = diseaseMatch.subgroupCategory || 'cadd';
  const subKey = diseaseMatch.subgroupKey;
  const diseaseKey = diseaseMatch.disease_name;

  const specificGeneKey = (diseaseKey && diseaseMatch.matchedGene) 
    ? `${diseaseKey}:gene:${diseaseMatch.matchedGene}` 
    : null;

  const geneKey = specificGeneKey || diseaseMatch.fullKey || diseaseKey;

  const baseObj = (specificGeneKey && diseasesIndex[specificGeneKey]) 
    || diseasesIndex[geneKey] 
    || diseasesIndex[diseaseKey] 
    || diseaseMatch.data 
    || {};

  if (subKey) {
    const cleanKey = String(subKey).split(' ')[0].toLowerCase();
    const candidateKeys = [
      `${geneKey}:cadd:${subKey}`,
      `${diseaseKey}:cadd:${subKey}`,
      `${geneKey}:${subCat}:${subKey}`,
      `${diseaseKey}:${subCat}:${subKey}`
    ];

    for (const k of candidateKeys) {
      if (diseasesIndex[k]) return diseasesIndex[k];
    }

    const matchedIndexKey = Object.keys(diseasesIndex).find(k => {
      const lower = k.toLowerCase();
      const hasGeneOrDisease = lower.includes(geneKey.toLowerCase()) || lower.includes(diseaseKey.toLowerCase());
      return hasGeneOrDisease && lower.includes(`:cadd:`) && lower.includes(cleanKey);
    });

    if (matchedIndexKey && diseasesIndex[matchedIndexKey]) {
      return diseasesIndex[matchedIndexKey];
    }
  }

  return baseObj;
}

