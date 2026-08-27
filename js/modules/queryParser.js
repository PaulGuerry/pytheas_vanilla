import { diseasesIndex, getRandomComparisonTargets, loadClusterData, loadLexicon } from '../api.js';
import { getLevenshteinDistance, normalizeQueryTypos, escapeRegExp } from './utils.js';
import { PFIC_SUBTYPE_MAP } from '../constants.js';
import { showClusterSystemMessage } from './chatUI.js';



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



const DISEASE_ALIASES = {
  'MIXED': 'MVID+PFIC'
};

/**
 * Normalizes a subgroup value (e.g., 'boys' -> 'M') using lexicon aliases or direct values.
 */
function normalizeSubgroupValue(category, val, lexicon) {
  if (!val) return null;
  const cleanVal = val.toString().trim().toLowerCase();
  
  const alias = lexicon.aliases?.[category]?.[cleanVal];
  if (alias) return alias.toUpperCase();

  const validVals = lexicon.subgroups?.[category] || [];
  const match = validVals.find(v => v.toLowerCase() === cleanVal);
  if (match) return match.toUpperCase();

  return cleanVal.toUpperCase();
}

/**
 * Extracts subgroup constraints whether flat (entities.sex) or nested (entities.subgroups.sex).
 */
function extractSubgroups(entities, lexicon) {
  const result = {};
  const categories = Object.keys(lexicon.subgroups || {});

  if (entities.subgroups) {
    for (const [k, v] of Object.entries(entities.subgroups)) {
      if (v) result[k] = v;
    }
  }

  for (const cat of categories) {
    if (entities[cat] && !result[cat]) {
      result[cat] = entities[cat];
    }
  }
  return result;
}

/**
 * Resolves the value a key holds for a given subgroup category (e.g. 'sex').
 * Handles both explicit tags ([:SEX, :M]) and implicit value tokens ([:M]).
 */
function getKeySubgroupValue(parts, category, lexicon) {
  const catUpper = category.toUpperCase();
  
  // 1. Explicit category tag e.g., ["SEX", "M"]
  const catIdx = parts.indexOf(catUpper);
  if (catIdx !== -1 && parts[catIdx + 1]) {
    return normalizeSubgroupValue(category, parts[catIdx + 1], lexicon);
  }

  // 2. Direct value match in key parts e.g., ["M"]
  const validVals = (lexicon.subgroups?.[category] || []).map(v => v.toUpperCase());
  for (const p of parts) {
    if (validVals.includes(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Determines whether key parts satisfy requested subgroup constraints.
 * Strict: Exact subgroup match required.
 * Non-strict: Allows unsegmented base keys (keyVal === null) but rejects opposing subgroups.
 */
function keyMatchesSubgroups(keyParts, requestedSubgroups, lexicon, strict = true) {
  const categories = Object.keys(lexicon.subgroups || {});

  for (const category of categories) {
    const keyVal = getKeySubgroupValue(keyParts, category, lexicon);
    const rawReqVal = requestedSubgroups[category];
    const reqVal = normalizeSubgroupValue(category, rawReqVal, lexicon);

    if (reqVal) {
      if (strict) {
        if (!keyVal || keyVal !== reqVal) return false;
      } else {
        if (keyVal !== null && keyVal !== reqVal) return false;
      }
    } else if (strict) {
      if (keyVal !== null) return false;
    }
  }
  return true;
}

/**
 * Finds the associated disease name for a key.
 * Ignores gene symbols mistakenly passed as disease names in key parts or payload metadata.
 */
function extractDiseaseForKey(key, keyParts, lexicon, indexData) {
  const knownGenes = (lexicon.genes || []).map(g => g.toUpperCase());
  const knownDiseases = (lexicon.diseases || []).map(d => d.toUpperCase());

  // 1. Explicit DISEASE tag in key parts e.g. ["DISEASE", "PFIC"]
  const disIdx = keyParts.indexOf('DISEASE');
  if (disIdx !== -1 && keyParts[disIdx + 1]) {
    const disVal = keyParts[disIdx + 1];
    if (!knownGenes.includes(disVal)) return disVal;
  }

  // 2. Match known disease token in key parts
  for (const part of keyParts) {
    if (knownDiseases.includes(part)) {
      return part;
    }
  }

  // 3. Payload metadata fallback (only if value is a real disease, not a gene)
  const entry = indexData[key];
  const entryDisease = (entry?.disease_name || entry?.disease || '').toUpperCase();
  if (entryDisease && !knownGenes.includes(entryDisease)) {
    return entryDisease;
  }

  return null;
}

export function resolveSegmentToKeys(seg, lexicon, indexData) {
  console.log(`[DEBUG] Resolving segment: "${seg}"`);
  const entities = parseSegmentEntities(seg, lexicon);
  const { disease, gene } = entities;
  const subgroups = extractSubgroups(entities, lexicon);
  console.log(`[DEBUG] Parsed entities for "${seg}":`, { disease, gene, subgroups });
  const allIndexKeys = Object.keys(indexData || {});
  const matchedKeys = new Set();

  const requestedGene = gene?.toUpperCase();
  const rawReqDisease = disease ? disease.toUpperCase() : null;
  const requestedDisease = rawReqDisease ? (DISEASE_ALIASES[rawReqDisease] || rawReqDisease) : null;

  // 1. Gene Query (e.g., "ABCB4", "ABCB4 boys")
  if (requestedGene) {
    const collectGeneKeys = (targetSubgroups) => {
      const explicitDiseaseKeys = new Map();
      const untaggedFallbackKeys = new Map();

      allIndexKeys.forEach(key => {
        const parts = key.split(':').map(p => p.toUpperCase());

        // Key MUST contain the gene symbol token
        if (!parts.includes(requestedGene)) return;

        // If user didn't request a subgroup (like variant/sex), DO NOT greedily match variant-sliced keys!
        const hasUnrequestedSubgroups = parts.includes('VARIANT') || parts.includes('SEX');
        const userRequestedSubgroups = Object.keys(targetSubgroups).length > 0;
        if (hasUnrequestedSubgroups && !userRequestedSubgroups) return;

        // Key MUST match target subgroup constraints strictly if provided
        if (!keyMatchesSubgroups(parts, targetSubgroups, lexicon, true)) return;

        const rawDisease = extractDiseaseForKey(key, parts, lexicon, indexData);
        if (requestedDisease && rawDisease && (DISEASE_ALIASES[rawDisease] || rawDisease) !== requestedDisease) return;

        const hasDiseaseSegment = parts.includes('DISEASE');

        if (rawDisease && hasDiseaseSegment) {
          let canonicalDisease = DISEASE_ALIASES[rawDisease] || rawDisease;
          
          // Prefer explicit/combined keys like "PFIC+MVID" over "MIXED" if both map
          const uniqueMapKey = `${requestedGene}:${canonicalDisease}`;
          
          // If we already have a key for this disease, prefer the one that is cleaner or explicitly "PFIC+MVID"
          if (explicitDiseaseKeys.has(uniqueMapKey)) {
            const existingKey = explicitDiseaseKeys.get(uniqueMapKey);
            if (key.includes('PFIC+MVID') && !existingKey.includes('PFIC+MVID')) {
              explicitDiseaseKeys.set(uniqueMapKey, key);
            }
          } else {
            explicitDiseaseKeys.set(uniqueMapKey, key);
          }
        }
      });

      if (explicitDiseaseKeys.size > 0) {
        explicitDiseaseKeys.forEach(key => matchedKeys.add(key));
        return true;
      }
      return false;
    };

    collectGeneKeys(subgroups);
  }

  // 2. Pure Disease Query (e.g., "PFIC boys")
  else if (requestedDisease) {
    const geneBaseKeys = new Map();

    allIndexKeys.forEach(key => {
      const parts = key.split(':').map(p => p.toUpperCase());

      const rawDisease = extractDiseaseForKey(key, parts, lexicon, indexData);
      const canonicalDisease = rawDisease ? (DISEASE_ALIASES[rawDisease] || rawDisease) : null;
      if (canonicalDisease !== requestedDisease) return;

      if (!keyMatchesSubgroups(parts, subgroups, lexicon, true)) return;

      const knownGenes = (lexicon.genes || []).map(g => g.toUpperCase());
      let associatedGene = parts.find(p => knownGenes.includes(p)) || 'ALL';

      const existingKey = geneBaseKeys.get(associatedGene);
      if (!existingKey || key.split(':').length < existingKey.split(':').length) {
        geneBaseKeys.set(associatedGene, key);
      }
    });

    geneBaseKeys.forEach(key => matchedKeys.add(key));
  }
  console.log(`[DEBUG] Matched keys for segment "${seg}":`, matchedKeys);
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
    const disIdx = parts.indexOf('disease');
    diseaseName = parts[disIdx + 1];
    geneSubgroupLabel = parts[0]; // e.g., ABCB4
  } else if (fullKey.includes(':gene:')) {
    diseaseName = parts[0];
    geneSubgroupLabel = parts[parts.indexOf('gene') + 1];
  } else {
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
        console.log(`[DEBUG] Segment "${seg}" resolved to keys:`, matchedKeysForSegment);
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
          console.log(`[DEBUG] Index data payload for key "${segMatchedKey}":`, diseasesIndex[segMatchedKey]);
          
          // Parse entities specifically for this segment to cleanly separate gene, disease, and subgroups
          const segmentEntities = parseSegmentEntities(seg, lexicon);
          const { category: subCat, key: subKey } = extractSubgroupFromSegment(seg);
          const decomposed = decomposeKeyForTable(segMatchedKey, diseasesIndex || {});

          targetObjects.push({
            fullKey: segMatchedKey,
            disease_name: decomposed.diseaseName,
            // Extract strictly the gene symbol if present, otherwise fallback
            matchedGene: segmentEntities.gene || decomposed.gene || seg.toUpperCase(),
            subgroupCategory: subCat,
            // Ensure subgroupKey captures explicit tags like sex/variant if present in segmentEntities or segMatchedKey
            subgroupKey: subKey || segmentEntities.sex || segmentEntities.variant || null,
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
