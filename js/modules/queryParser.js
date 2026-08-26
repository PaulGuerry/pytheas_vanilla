import { diseasesIndex, getRandomComparisonTargets, loadClusterData } from '../api.js';
import { getLevenshteinDistance, normalizeQueryTypos, escapeRegExp } from './utils.js';
import { PFIC_SUBTYPE_MAP } from '../constants.js';
import { showClusterSystemMessage } from './chatUI.js';

let entityLexicon = null;

async function loadLexicon() {
  if (entityLexicon) return entityLexicon;
  try {
    const res = await fetch('data/entity_lexicon.json');
    entityLexicon = await res.json();
  } catch (err) {
    console.warn("Could not load entity_lexicon.json, falling back to legacy parsing:", err);
    entityLexicon = {};
  }
  return entityLexicon;
}

/**
 * Extracts entities (Disease, Gene, Sex/Subgroups) from a segment string using lexicon & aliases.
 */
function parseSegmentEntities(seg, lexicon) {
  const normSeg = seg.toLowerCase().trim();
  let disease = null;
  let gene = null;
  let sex = null;

  // 1. Detect Disease
  if (Array.isArray(lexicon.diseases)) {
    for (const d of lexicon.diseases) {
      const regex = new RegExp(`\\b${escapeRegExp(d.toLowerCase())}\\b`, 'i');
      if (regex.test(normSeg)) {
        disease = d;
        break;
      }
    }
  }

  // 2. Detect Gene
  if (Array.isArray(lexicon.genes)) {
    for (const g of lexicon.genes) {
      const regex = new RegExp(`\\b${escapeRegExp(g.toLowerCase())}\\b`, 'i');
      if (regex.test(normSeg)) {
        gene = g;
        break;
      }
    }
  }

  // 3. Detect Sex (Aliases e.g. "boys" -> "M", or Direct "M"/"F")
  if (lexicon.aliases?.sex) {
    for (const [alias, canonicalSex] of Object.entries(lexicon.aliases.sex)) {
      const regex = new RegExp(`\\b${escapeRegExp(alias.toLowerCase())}\\b`, 'i');
      if (regex.test(normSeg)) {
        sex = canonicalSex;
        break;
      }
    }
  }

  if (!sex && lexicon.subgroups?.sex) {
    for (const s of lexicon.subgroups.sex) {
      const regex = new RegExp(`\\b${escapeRegExp(s.toLowerCase())}\\b`, 'i');
      if (regex.test(normSeg)) {
        sex = s;
        break;
      }
    }
  }

  return { disease, gene, sex };
}


/**
 * Dynamic resolution: Finds all unique disease roots matching the queried gene target, ignoring subgroups.
 */
const DISEASE_ALIASES = {
  'MIXED': 'MVID+PFIC'
};

/**
 * Normalizes subgroup values (e.g., 'boys' -> 'M') using the lexicon alias map.
 */
function normalizeSubgroupValue(category, val, lexicon) {
  if (!val) return null;
  const cleanVal = val.toString().trim().toLowerCase();
  const alias = lexicon.aliases?.[category]?.[cleanVal];
  if (alias) return alias.toUpperCase();
  return cleanVal.toUpperCase();
}

/**
 * Validates key subgroup values against requested constraints.
 */
function keyMatchesSubgroups(keyParts, requestedSubgroups, lexicon) {
  const subgroupCategories = Object.keys(lexicon.subgroups || {});

  for (const category of subgroupCategories) {
    const catIdx = keyParts.indexOf(category.toUpperCase());
    const keyVal = catIdx !== -1 ? keyParts[catIdx + 1] : null;

    const rawReqVal = requestedSubgroups[category];
    const normReqVal = normalizeSubgroupValue(category, rawReqVal, lexicon);

    if (normReqVal) {
      // Subgroup requested: Key must contain this category and match the canonical value
      const normKeyVal = normalizeSubgroupValue(category, keyVal, lexicon);
      if (!normKeyVal || normKeyVal !== normReqVal) return false;
    } else {
      // Subgroup NOT requested: Key must NOT contain this subgroup slice
      if (keyVal !== null) return false;
    }
  }
  return true;
}

/**
 * Extracts disease name from key structure or index payload.
 */
function extractDiseaseForKey(key, keyParts, isGeneRoot, indexData) {
  // 1. Explicit :disease: segment (e.g., "MYO5B:disease:MVID:sex:M")
  const disIdx = keyParts.indexOf('DISEASE');
  if (disIdx !== -1 && keyParts[disIdx + 1]) {
    return keyParts[disIdx + 1];
  }

  // 2. Disease as root segment (e.g., "MVID:gene:MYO5B:sex:M")
  if (!isGeneRoot) {
    return keyParts[0];
  }

  // 3. Fallback to entry payload metadata in indexData
  const entry = indexData[key];
  if (entry?.disease_name) return entry.disease_name.toUpperCase();
  if (entry?.disease) return entry.disease.toUpperCase();

  return null;
}

export function resolveSegmentToKeys(seg, lexicon, indexData) {
  const entities = parseSegmentEntities(seg, lexicon);
  const { disease, gene, subgroups = {} } = entities;

  const allIndexKeys = Object.keys(indexData || {});
  const matchedKeys = new Set();

  const requestedGene = gene?.toUpperCase();
  const requestedDisease = disease ? (DISEASE_ALIASES[disease.toUpperCase()] || disease.toUpperCase()) : null;

  // 1. Gene Query (with optional Disease and Subgroup modifiers)
  if (requestedGene) {
    const diseaseBaseKeys = new Map();

    allIndexKeys.forEach(key => {
      const parts = key.split(':').map(p => p.toUpperCase());

      // Check Gene match
      const isGeneRoot = parts[0] === requestedGene;
      const geneIdx = parts.indexOf('GENE');
      const isGeneSubkey = geneIdx !== -1 && parts[geneIdx + 1] === requestedGene;
      if (!isGeneRoot && !isGeneSubkey) return;

      // Check dynamic Subgroup constraints with alias resolution
      if (!keyMatchesSubgroups(parts, subgroups, lexicon)) return;

      // Extract associated disease
      const rawDisease = extractDiseaseForKey(key, parts, isGeneRoot, indexData);

      // Filter by explicit disease if requested
      if (requestedDisease && rawDisease && rawDisease !== requestedDisease) return;

      if (rawDisease) {
        const canonicalDisease = DISEASE_ALIASES[rawDisease] || rawDisease;
        const existingKey = diseaseBaseKeys.get(canonicalDisease);

        const isCurrentKeyExplicit = key.toUpperCase().includes('MVID+PFIC');
        const isExistingKeyExplicit = existingKey?.toUpperCase().includes('MVID+PFIC');

        if (!existingKey || (isCurrentKeyExplicit && !isExistingKeyExplicit)) {
          diseaseBaseKeys.set(canonicalDisease, key);
        } else if (key.split(':').length < existingKey.split(':').length && !isExistingKeyExplicit) {
          diseaseBaseKeys.set(canonicalDisease, key);
        }
      }
    });

    diseaseBaseKeys.forEach(key => matchedKeys.add(key));
  } 
  // 2. Pure Disease Query (with optional Subgroup modifiers)
  else if (requestedDisease) {
    const geneBaseKeys = new Map();

    allIndexKeys.forEach(key => {
      const parts = key.split(':').map(p => p.toUpperCase());

      // Check Disease match
      const isDiseaseRoot = parts[0] === requestedDisease;
      const disIdx = parts.indexOf('DISEASE');
      const isDiseaseSubkey = disIdx !== -1 && parts[disIdx + 1] === requestedDisease;
      if (!isDiseaseRoot && !isDiseaseSubkey) return;

      // Check dynamic Subgroup constraints with alias resolution
      if (!keyMatchesSubgroups(parts, subgroups, lexicon)) return;

      let associatedGene = null;
      const geneIdx = parts.indexOf('GENE');
      if (geneIdx !== -1) {
        associatedGene = parts[geneIdx + 1];
      } else if (!isDiseaseRoot) {
        associatedGene = parts[0];
      }

      const groupKey = associatedGene || 'ALL';
      const existingKey = geneBaseKeys.get(groupKey);
      if (!existingKey || key.split(':').length < existingKey.split(':').length) {
        geneBaseKeys.set(groupKey, key);
      }
    });

    geneBaseKeys.forEach(key => matchedKeys.add(key));
  }

  return Array.from(matchedKeys);
}






/**
 * Formats key breakdown into Disease Name, Subgroup Label, and Refinement Queries
 */
function decomposeKeyForTable(fullKey, indexData) {
  const parts = fullKey.split(':');
  let diseaseName = 'Unknown';
  let geneSubgroupLabel = 'All Genes';

  if (fullKey.includes(':disease:')) {
    // Gene-first format: "MYO5B:disease:MVID"
    const disIdx = parts.indexOf('disease');
    diseaseName = parts[disIdx + 1];
    geneSubgroupLabel = parts[0];
  } else if (fullKey.includes(':gene:')) {
    // Disease-first format: "MVID:gene:MYO5B"
    diseaseName = parts[0];
    geneSubgroupLabel = parts[parts.indexOf('gene') + 1];
  } else {
    // Root keys: "MYO5B" or "MVID"
    const entry = indexData[fullKey];
    diseaseName = entry?.disease_name || entry?.disease || parts[0];
    geneSubgroupLabel = entry?.gene || parts[0];
  }

  if (fullKey.includes(':sex:')) {
    const sexSubgroup = parts[parts.indexOf('sex') + 1];
    const sexStr = sexSubgroup === 'M' ? 'Boys' : sexSubgroup === 'F' ? 'Girls' : sexSubgroup;
    geneSubgroupLabel = `${geneSubgroupLabel} (${sexStr})`;
  }

  return { diseaseName, geneSubgroupLabel };
}

export function extractVariableFromQuery(norm) {
  if (/\b(survival|surv|km|kaplan)\b/i.test(norm)) return 'survival';
  if (/\b(sex_ratio|sex|gender|boy|boys|girl|girls|ratio)\b/i.test(norm)) return 'sex_ratio';
  if (/\b(cadd_scores|cadd|cadd_score|phred)\b/i.test(norm)) return 'cadd_scores';
  if (/\b(variant_types|variant|variants|mutation|mutations)\b/i.test(norm)) return 'variant_types';
  if (/\b(zygosity|homozygous|heterozygous|compound)\b/i.test(norm)) return 'zygosity';
  if (/\b(age_first_symptoms|onset|first symptom|symptom age)\b/i.test(norm)) return 'age_first_symptoms';
  if (/\b(birth_weight|birth weight|weight at birth|bw)\b/i.test(norm)) return 'birth_weight';
  if (/\b(birth_height|birth height|height at birth|length|poids|taille)\b/i.test(norm)) return 'birth_height';
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
      const randomVar = VALID_VARIABLES[Math.floor(Math.random() * VALID_VARIABLES.length)];
      const constructedQuery = `${randomVar} ${targetA} vs ${targetB}`;         
  
      const rerouted = await parseAndRoute(constructedQuery);
      rerouted.resolvedQuery = constructedQuery;
      return rerouted;
    }
  
    const detectedVariable = extractVariableFromQuery(norm);
    const labMatch = norm.match(/\b(height|weight|cb|tb|ptinr|ast|alt|ggt|alp|sba|alb|afp)\b/i);
    const detectedLab = labMatch ? labMatch[0].toUpperCase() : 'SBA';

    const lexicon = await loadLexicon();

    // 1. Strip variable from query head
    const cleanQuery = norm.replace(/^(survival|cadd_scores|sex_ratio|variant_types|zygosity|age_first_symptoms|birth_weight|birth_height|longitudinal|treatments)\s+/i, '');

    // 2. Split comparison clauses (vs, versus, compared to, et, and, etc.)
    const rawSegments = cleanQuery.split(/\s+(?:vs|v\.|versus|compared\s+to|contre|and|et)\s+/i);
  
    const targetObjects = [];
    const autoCorrections = [];
    const baseDiseases = Object.keys(diseasesIndex || {}).filter(k => !k.includes(':'));
  
    rawSegments.forEach(seg => {
      let matchedKeysForSegment = [];

      // Primary: Deterministic lexicon-based resolution
      if (Object.keys(lexicon).length > 0) {
        matchedKeysForSegment = resolveSegmentToKeys(seg, lexicon, diseasesIndex || {});
      }

      // Fallback 1: Subtype alias mapping (e.g. "PFIC1")
      if (matchedKeysForSegment.length === 0) {
        for (const [alias, geneTarget] of Object.entries(PFIC_SUBTYPE_MAP || {})) {
          const aliasRegex = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i');
          if (aliasRegex.test(seg)) {
            const { sex } = parseSegmentEntities(seg, lexicon);
            let candidate = sex ? `${geneTarget}:sex:${sex}` : geneTarget;
            
            if (diseasesIndex[candidate]) {
              matchedKeysForSegment.push(candidate);
            } else if (diseasesIndex[geneTarget]) {
              matchedKeysForSegment.push(geneTarget);
            }
            break;
          }
        }
      }

      // Fallback 2: Typo / Levenshtein matching on root diseases
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

      const uniqueKeys = [...new Set(matchedKeysForSegment)];

      uniqueKeys.forEach(segMatchedKey => {
        const { category: subCat, key: subKey } = extractSubgroupFromSegment(seg);
        const decomposed = decomposeKeyForTable(segMatchedKey, diseasesIndex || {});

        targetObjects.push({
          fullKey: segMatchedKey,
          disease_name: decomposed.diseaseName,
          matchedGene: seg.toUpperCase(),
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
        const rawQuery = rawTokens.slice(1).join(' ').trim();
        const genes = rawTokens.slice(1).map(g => g.toUpperCase()).filter(Boolean);

        const data = await loadClusterData();
        if (!data) {
            showClusterSystemMessage(`
                ⚠️ <strong>Data Unavailable:</strong> Unable to load phenotype cluster data.<br>
                Please ensure <code>data/cluster_data.json.gz</code> is accessible or contact <a href="mailto:contact.pytheasdb@gmail.com">contact.pytheasdb@gmail.com</a> for support.
            `);
            return true;
        }

        const getAvailableCombinationsHtml = (dataset) => {
            const combinations = Object.keys(dataset).map(key => {
                const comboStr = key.replace(/_/g, ' ');
                const labelText = dataset[key]?.display_label || comboStr;
                return `<a href="#" class="cluster-combo-link" data-query="cluster ${comboStr}" style="color: #2563eb; text-decoration: underline; font-weight: 600; cursor: pointer; margin-right: 10px;">${labelText}</a>`;
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

        const findMatchingGeneKey = (queryStr, geneList, dataset) => {
            const normalizedQuery = queryStr.toLowerCase().replace(/\s+/g, ' ');

            for (const key of Object.keys(dataset)) {
                const entry = dataset[key];
                if (entry?.display_label) {
                    const normalizedLabel = entry.display_label.toLowerCase().replace(/\s+/g, ' ');
                    if (normalizedLabel === normalizedQuery || normalizedLabel.replace(' genes', '') === normalizedQuery) {
                        return key;
                    }
                }
                const keySorted = key.split('_').sort().join('_');
                const sortedCandidate = [...geneList].sort().join('_');
                if (keySorted === sortedCandidate) return key;
            }
            return null;
        };

        const geneKey = findMatchingGeneKey(rawQuery, genes, data);
        const geneData = geneKey ? data[geneKey] : null;

        if (!geneData || !geneData.clustering_results) {
            showClusterSystemMessage(`
                No clustering results found for gene combination: <strong>${rawQuery}</strong>
                ${getAvailableCombinationsHtml(data)}
            `);
            return true;
        }

        const clusteringResults = geneData.clustering_results;
        const rankKeys = Object.keys(clusteringResults);
        const kValues = rankKeys
            .map(rank => clusteringResults[rank]?.num_clusters_k)
            .filter(k => k !== undefined);

        const displayName = geneData.display_label || geneKey.split('_').join(' + ');

        let kListStr = "";
        if (kValues.length === 1) {
            kListStr = `k = ${kValues[0]}`;
        } else if (kValues.length === 2) {
            kListStr = `k = ${kValues[0]} or ${kValues[1]}`;
        } else if (kValues.length > 2) {
            kListStr = `k = ${kValues.slice(0, -1).join(', ')}, or ${kValues[kValues.length - 1]}`;
        }

        const promptText = `PytheasDB clustering analyses indicate patient phenotypes for <strong>${displayName}</strong> can be split into ${kListStr} clusters. Which results would you like to inspect?`;

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
