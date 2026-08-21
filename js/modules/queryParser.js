import { diseasesIndex, getRandomComparisonTargets, loadClusterData } from '../api.js';
import { getLevenshteinDistance, normalizeQueryTypos, escapeRegExp } from './utils.js';
import { PFIC_SUBTYPE_MAP } from '../constants.js';
import { showClusterSystemMessage } from './chatUI.js';


export function extractVariableFromQuery(norm) {
  if (/\b(survival|surv|km|kaplan)\b/i.test(norm)) return 'survival';
  if (/\b(sex_ratio|sex|gender|boy|boys|girl|girls|ratio)\b/i.test(norm)) return 'sex_ratio';
  if (/\b(cadd_scores|cadd|cadd_score|phred)\b/i.test(norm)) return 'cadd_scores';
  if (/\b(variant_types|variant|variants|mutation|mutations)\b/i.test(norm)) return 'variant_types';
  if (/\b(zygosity|homozygous|heterozygous|compound)\b/i.test(norm)) return 'zygosity';
  if (/\b(age_first_symptoms|onset|first symptom|symptom age)\b/i.test(norm)) return 'age_first_symptoms';
  if (/\b(birth_weight|birth weight|weight at birth|bw)\b/i.test(norm)) return 'birth_weight';
  if (/\b(birth_height|birth height|height at birth|length)\b/i.test(norm)) return 'birth_height';
  if (/\b(longitudinal|trend|loess|sba|alt|ast)\b/i.test(norm)) return 'longitudinal';
  if (/\b(treatments|treatment|therapy|drug|response)\b/i.test(norm)) return 'treatments';
  
  return 'survival';
}

export function extractSubgroupFromSegment(seg) {
  if (!seg) return { category: null, key: null };
  const normSeg = seg.toLowerCase();

  const caddMatch = normSeg.match(/\b(?:cadd|cadd_tier)[:=]\s*([a-z0-9_>=<.-]+)/i);
  if (caddMatch) {
    const val = caddMatch[1].toLowerCase();
    if (val.includes('high')) return { category: 'cadd', key: 'high (>=20)' };
    if (val.includes('low')) return { category: 'cadd', key: 'low (<15)' };
    if (val.includes('mod')) return { category: 'cadd', key: 'moderate (15-19)' };
    return { category: 'cadd', key: val };
  }

  if (/\bhigh\s*cadd\b/i.test(normSeg)) return { category: 'cadd', key: 'high (>=20)' };
  if (/\blow\s*cadd\b/i.test(normSeg)) return { category: 'cadd', key: 'low (<15)' };
  if (/\bmoderate\s*cadd\b/i.test(normSeg)) return { category: 'cadd', key: 'moderate (15-19)' };

  return { category: null, key: null };
}


const VALID_VARIABLES = [
  'survival',
  'cadd_scores',
  'sex_ratio',
  'variant_types',
  'zygosity',
  'age_first_symptoms',
  'birth_weight',
  'birth_height'
];

const VARIABLE_PREFIX_REGEX = new RegExp(`^(${VALID_VARIABLES.join('|')})\\s+`, 'i');

export async function parseAndRoute(query) {
    const origNorm = query.toLowerCase().trim();
    let norm = normalizeQueryTypos(origNorm.replace(/\bpfic\s+(\d+)\b/gi, 'pfic$1'));
  
    const isClusterQuery = await handleClusterQuery(norm);
    if (isClusterQuery) {
        return { isCluster: true, isMatched: true };
    }
    
    const randomTriggers = ["random", "example", "exemple", "aléatoire", "aleatoire", "?"];
    if (randomTriggers.includes(origNorm)) {
      const [targetA, targetB] = getRandomComparisonTargets();
      
      // Use the shared array here instead of a duplicate array
      const randomVar = VALID_VARIABLES[Math.floor(Math.random() * VALID_VARIABLES.length)];
      const constructedQuery = `${randomVar} ${targetA} vs ${targetB}`;         
  
      const rerouted = await parseAndRoute(constructedQuery);
      rerouted.resolvedQuery = constructedQuery;
      return rerouted;
    }
  
    const detectedVariable = extractVariableFromQuery(norm);
    const labMatch = norm.match(/\b(height|weight|cb|tb|ptinr|ast|alt|ggt|alp|sba|alb|afp)\b/i);
    const detectedLab = labMatch ? labMatch[0].toUpperCase() : 'SBA';
  
    const cleanQuery = norm.replace(/^(survival|cadd_scores|sex_ratio|variant_types|zygosity|age_first_symptoms)\s+/i, '');
    const rawSegments = cleanQuery.split(/\s+(?:vs|v\.|and)\s+/i);
  
    const targetObjects = [];
    const autoCorrections = [];
    const allKeys = Object.keys(diseasesIndex || {});
    const baseDiseases = allKeys.filter(k => !k.includes(':'));
  
    rawSegments.forEach(seg => {
      let matchedKeysForSegment = [];

      // 1. Alias / Subtype mapping: collect ALL keys matching the target gene
      for (const [alias, geneTarget] of Object.entries(PFIC_SUBTYPE_MAP || {})) {
        const aliasRegex = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i');
        if (aliasRegex.test(seg)) {
          const targetLower = geneTarget.toLowerCase();
          const matches = allKeys.filter(k => k.toLowerCase().includes(targetLower));
          if (matches.length > 0) {
            matchedKeysForSegment.push(...matches);
            break;
          }
        }
      }

      // 2. Direct key lookup: collect ALL matching candidate keys in diseasesIndex
      if (matchedKeysForSegment.length === 0) {
        for (const key of allKeys) {
          const lowerKey = key.toLowerCase();
          const searchTerm = key.includes(':') ? key.split(':').pop() : key;
          const exactRegex = new RegExp(`\\b${escapeRegExp(searchTerm.toLowerCase())}\\b`, 'i');

          if (seg.includes(lowerKey) || exactRegex.test(seg)) {
            matchedKeysForSegment.push(key);
          }
        }
      }  

      // 3. Typo/Levenshtein fallback
      if (matchedKeysForSegment.length === 0) {
        const tokens = seg.split(/\s+/);
        for (const token of tokens) {
          if (token.length < 3) continue;
          for (const key of baseDiseases) {
            if (getLevenshteinDistance(token, key.toLowerCase()) <= 1) {
              matchedKeysForSegment.push(key);
              autoCorrections.push({ original: token, corrected: key });
              break;
            }
          }
          if (matchedKeysForSegment.length > 0) break;
        }
      }

      // Deduplicate keys for this segment and build target objects
      const uniqueKeys = [...new Set(matchedKeysForSegment)];

      uniqueKeys.forEach(segMatchedKey => {
        const { category: subCat, key: subKey } = extractSubgroupFromSegment(seg);
        let baseName = segMatchedKey;
        let matchedGene = null;

        if (segMatchedKey.includes(':gene:')) {
          [baseName, matchedGene] = segMatchedKey.split(':gene:');
        }

        targetObjects.push({
          fullKey: segMatchedKey,
          disease_name: baseName,
          matchedGene: matchedGene,
          subgroupCategory: subCat,
          subgroupKey: subKey,
          data: diseasesIndex[segMatchedKey] || {}
        });
      });
    });

    return {
      rawQuery: query,
      targets: targetObjects.map(t => t.fullKey),
      targetDiseases: targetObjects,
      variable: detectedVariable,
      detectedLab: detectedLab,
      autoCorrections: autoCorrections,
      resolvedQuery: query,
      isMatched: targetObjects.length > 0
    };
}

export async function handleClusterQuery(inputString) {
    const rawTokens = inputString.trim().split(/\s+/);
    
    if (rawTokens[0].toLowerCase() === 'cluster') {
        const genes = rawTokens.slice(1).map(g => g.toUpperCase()).filter(Boolean);

        const data = await loadClusterData();
        if (!data) {
            showClusterSystemMessage(`
                ⚠️ <strong>Data Unavailable:</strong> Unable to load phenotype cluster data.<br>
                Please ensure <code>data/cluster_data.json.gz</code> is accessible or contact <a href="mailto:contact.pytheasdb@gmail.com">contact.pytheasdb@gmail.com</a> for support.
            `);
            return true;
        }

        // Helper to format available keys into clickable hyperlinks
        const getAvailableCombinationsHtml = (dataset) => {
            const combinations = Object.keys(dataset).map(key => {
                const comboStr = key.replace(/_/g, ' ');
                return `<a href="#" class="cluster-combo-link" data-query="cluster ${comboStr}" style="color: #2563eb; text-decoration: underline; font-weight: 600; cursor: pointer; margin-right: 10px;">${comboStr}</a>`;
            }).join(' | ');

            return `<div style="margin-top: 10px; font-size: 0.9em; color: #4b5563;"><strong>Available combinations:</strong> ${combinations}</div>`;
        };        


        if (genes.length === 0) {
            showClusterSystemMessage(`
                ⚠️ Please specify at least one gene name. Example: <code>cluster ABCB4</code> or <code>cluster ABCB4 ABCB11</code>
                ${getAvailableCombinationsHtml(data)}
            `);
            return true;
        }

        const findMatchingGeneKey = (geneList, dataset) => {
            const sortedCandidate = [...geneList].sort().join('_');
            for (const key of Object.keys(dataset)) {
                const keySorted = key.split('_').sort().join('_');
                if (keySorted === sortedCandidate) return key;
            }
            return null;
        };

        const geneKey = findMatchingGeneKey(genes, data);
        const geneData = geneKey ? data[geneKey] : null;

        if (!geneData || !geneData.clustering_results) {
            showClusterSystemMessage(`
                No clustering results found for gene combination: <strong>${genes.join(' + ')}</strong>
                ${getAvailableCombinationsHtml(data)}
            `);
            return true;
        }

        const clusteringResults = geneData.clustering_results;
        const rankKeys = Object.keys(clusteringResults);

        const kValues = rankKeys
            .map(rank => clusteringResults[rank]?.num_clusters_k)
            .filter(k => k !== undefined);

        const matchedGenes = geneKey.split('_');
        const geneQueryStr = matchedGenes.join(' + ');

        let kListStr = "";
        if (kValues.length === 1) {
            kListStr = `k = ${kValues[0]}`;
        } else if (kValues.length === 2) {
            kListStr = `k = ${kValues[0]} or ${kValues[1]}`;
        } else if (kValues.length > 2) {
            kListStr = `k = ${kValues.slice(0, -1).join(', ')}, or ${kValues[kValues.length - 1]}`;
        }

        const promptText = `PytheasDB clustering analyses indicate patient phenotypes for <strong>${geneQueryStr}</strong> can be split into ${kListStr} clusters. Which results would you like to inspect?`;

        const totalRanks = rankKeys.length;
        const linksHtml = rankKeys.map((rank, index) => {
            const kVal = clusteringResults[rank]?.num_clusters_k;
            
            let labelSuffix = "";
            if (index === 0) {
                labelSuffix = " (optimal)";
            } else if (index === totalRanks - 1 && totalRanks > 1) {
                labelSuffix = " (~80% of optimal)";
            }

            return `<a href="#" style="color: #2563eb; text-decoration: underline; font-weight: 600; cursor: pointer; margin-right: 12px;" onclick="event.preventDefault(); renderClusterCard('${geneKey}', '${rank}');">k = ${kVal}${labelSuffix}</a>`;
        }).join('');

        showClusterSystemMessage(`
            <p style="margin-bottom: 8px;">${promptText}</p>
            <div>${linksHtml}</div>
        `);

        return true;
    }
    
    return false;
}
