let clusterDataCache = null;

export let diseasesIndex = {};
export let hpoDescriptors = {};

export async function initData() {
  try {
    const [diseasesRes, hpoRes] = await Promise.all([
      fetchGzipOrJson('data/diseases_index.json.gz').catch(() => 
        fetchGzipOrJson('data/diseases_index.json')
      ),
      fetch('data/hpo_descriptors.json')
        .then(res => res.json())
        .catch(err => {
          console.warn("Could not load HPO descriptors", err);
          return {};
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


export  async function fetchGzipOrJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    
    const encoding = response.headers.get('Content-Encoding');
    if (encoding === 'gzip' || encoding === 'deflate') {
      return await response.json();
    }

    if (url.endsWith('.gz') && typeof DecompressionStream !== 'undefined') {
      const decompressedStream = response.body.pipeThrough(new DecompressionStream('gzip'));
      const text = await new Response(decompressedStream).text();
      return JSON.parse(text);
    }

    return await response.json();
  }


export async function loadClusterData() {
    // Comment out or remove this line temporarily if you want to force fresh re-fetches without refreshing the page
    if (clusterDataCache) return clusterDataCache;

    try {
        // Add ?t=${Date.now()} to the fetch URL
        // Automatically append timestamp on localhost, but serve clean URL in production
        const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
        const url = isLocal ? `data/cluster_data.json.gz?v=${Date.now()}` : 'data/cluster_data.json.gz';
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        if ('DecompressionStream' in window) {
            const decompressedStream = response.body.pipeThrough(new DecompressionStream('gzip'));
            const decompressedText = await new Response(decompressedStream).text();
            clusterDataCache = JSON.parse(decompressedText);
        } else {
            clusterDataCache = await response.json();
        }

        return clusterDataCache;
    } catch (error) {
        console.error("Failed to load or decompress data/cluster_data.json.gz:", error);
        return null;
    }
}




export function getCohortData(diseaseMatch) {
  if (!diseaseMatch) return {};

  const subCat = diseaseMatch.subgroupCategory || 'cadd';
  const subKey = diseaseMatch.subgroupKey;

  const diseaseKey = diseaseMatch.disease_name;

  // Construct the specific gene key for this specific disease entity first
  const specificGeneKey = (diseaseKey && diseaseMatch.matchedGene) 
    ? `${diseaseKey}:gene:${diseaseMatch.matchedGene}` 
    : null;

  // Fallback to fullKey or disease_name
  const geneKey = specificGeneKey || diseaseMatch.fullKey || diseaseKey;

  // Look up base object in diseasesIndex prioritizing the specific disease-gene key
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


