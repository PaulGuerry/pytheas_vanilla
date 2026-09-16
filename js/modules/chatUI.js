import { translations, currentLang } from '../i18n.js';
import { parseAndRoute } from './queryParser.js';
import { escapeHtml, parseHpo, loadHpoDescriptor, findRelatedClusterTerms, findRelatedSymptomTerms } from './utils.js';
import { loadClusterData, idToTerm, loadHpoDag, loadSymptomIndex } from '../api.js';
import { 
  renderSummaryTable, 
  renderSurvivalPlot, 
  renderGroupedBarChart, 
  renderTopRoundedBarChart, 
  renderBoxOrRangeChart, 
  renderInverseSurvivalPlot, 
  renderLongitudinalChart,
  renderSymptomResultCard,
  renderSymptomGeneAssociationCard 
} from './chartRenderer.js';

let queryHistory = [];
let historyIndex = -1;
let currentDraft = "";
let chartCounter = 0;

export function getQueryState() {
  return { queryHistory, historyIndex, currentDraft };
}

export function setQueryState(state) {
  if (state.queryHistory !== undefined) queryHistory = state.queryHistory;
  if (state.historyIndex !== undefined) historyIndex = state.historyIndex;
  if (state.currentDraft !== undefined) currentDraft = state.currentDraft;
}

export function showClusterSystemMessage(messageHtml) {
  const container = document.getElementById('messagesContainer');
  const stream = document.getElementById('chatStream');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'message ai';
  msgDiv.innerHTML = `
    <div class="ai-card">
      <div class="ai-card-header">
        <img src="data/PYTHEAS_Logo.svg" alt="Pytheas" class="small-logo" onerror="this.src='https://via.placeholder.com/24x24?text=P'" />
        <span class="ai-card-title">${translations[currentLang]?.assistantTitle || "Pytheas Assistant"}</span>
      </div>
      <div class="fallback-box" style="background:#f0fdf4; border-color:#bbf7d0; color:#166534;">
        ${messageHtml}
      </div>
    </div>
  `;
  container.appendChild(msgDiv);
  if (stream) stream.scrollTop = stream.scrollHeight;
}
export async function submitQuery() {
  const input = document.getElementById('queryInput');
  if (!input) return;
  const query = input.value.trim();
  if (!query) return;

  input.value = '';

  const parsed = await parseAndRoute(query);
  const finalQueryText = parsed?.resolvedQuery || query;

  // Update query history before exiting
  if (queryHistory.length === 0 || queryHistory[queryHistory.length - 1] !== finalQueryText) {
    queryHistory.push(finalQueryText);
  }
  historyIndex = queryHistory.length;
  currentDraft = "";

  appendUserMessage(finalQueryText);

  // Exit early to prevent standard graph/table rendering for symptom queries
  if (parsed && parsed.isSymptomQuery) {
    return;
  }

  appendAiResponse(finalQueryText, parsed);
}



function appendUserMessage(text) {
  const container = document.getElementById('messagesContainer');
  const stream = document.getElementById('chatStream');
  if (!container) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message user';
  msgDiv.innerHTML = `<div class="user-bubble">${escapeHtml(text)}</div>`;
  container.appendChild(msgDiv);
  if (stream) stream.scrollTop = stream.scrollHeight;
}

function appendAiResponse(query, parsed) {
  if (parsed && parsed.isCluster) return;

  const container = document.getElementById('messagesContainer');
  const stream = document.getElementById('chatStream');
  if (!container) return;

  const t = translations[currentLang];
  chartCounter++;
  const chartId = `plotly-chart-${chartCounter}`;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'message ai';

  if (!parsed.isMatched) {
    const emailSubject = encodeURIComponent(`Unmatched Query Request: ${query}`);
    const emailBody = encodeURIComponent(`Hello Pytheas DB Team,\n\nI submitted the following query which could not be matched with accessible data:\n\n"${query}"\n\nPlease let me know if this data is available or can be added.\n\nThank you!`);
    const mailtoUrl = `mailto:contact.pytheasdb@gmail.com?subject=${emailSubject}&body=${emailBody}`;

    msgDiv.innerHTML = `
      <div class="ai-card">
        <div class="ai-card-header">
          <img src="data/PYTHEAS_Logo.svg" alt="Pytheas" class="small-logo" onerror="this.src='https://via.placeholder.com/24x24?text=P'" />
          <span class="ai-card-title">${t.assistantTitle}</span>
        </div>
        <div class="fallback-box">
          ${t.fallbackError}<br/><br/>
          ${currentLang === 'fr' ? 'Vous pouvez' : 'You can'} <a href="${mailtoUrl}">${t.fallbackEmailLink}</a> ${currentLang === 'fr' ? 'pour obtenir de l\'aide.' : 'for assistance.'}
        </div>
      </div>
    `;
    container.appendChild(msgDiv);
    if (stream) stream.scrollTop = stream.scrollHeight;
    return;
  }

  const tableHtml = renderSummaryTable(parsed);

  let correctionNoticeHtml = "";
  if (parsed.autoCorrections && parsed.autoCorrections.length > 0) {
    const correctionsStr = parsed.autoCorrections
      .map(c => `<strong>${escapeHtml(c.corrected)}</strong> (${t.correctedFrom} <em>"${escapeHtml(c.original)}"</em>)`)
      .join(', ');
    correctionNoticeHtml = `<div style="font-size: 12px; color: #6b7280; background-color: #f3f4f6; padding: 6px 12px; border-radius: 6px;">${t.showingResultsFor} ${correctionsStr}.</div>`;
  }

  const varLabel = t.variables[parsed.variable] || "Analysis";

  msgDiv.innerHTML = `
    <div class="ai-card">
      <div class="ai-card-header">
        <img src="data/PYTHEAS_Logo.svg" alt="Pytheas" class="small-logo" onerror="this.src='https://via.placeholder.com/24x24?text=P'" />
        <span class="ai-card-title">${t.resultTitle}${varLabel}</span>
      </div>
      ${correctionNoticeHtml}
      ${tableHtml}
      <div id="${chartId}" class="chart-container"></div>
    </div>
  `;
  container.appendChild(msgDiv);

  switch (parsed.variable) {
    case 'survival':
      renderSurvivalPlot(chartId, parsed.targetDiseases);
      break;
    case 'variant_types':
    case 'zygosity':
    case 'treatments':
      renderGroupedBarChart(chartId, parsed);
      break;
    case 'birth_weight':
    case 'birth_height':
    case 'sex_ratio':
      renderTopRoundedBarChart(chartId, parsed);
      break;
    case 'cadd_scores':
    case 'age_first_symptoms':
      renderBoxOrRangeChart(chartId, parsed);
      break;
    case 'age_onset_inverse_survival':
    case 'symptom_age_onset':
      renderInverseSurvivalPlot(chartId, parsed, parsed.subgroupCategory, parsed.subgroupKey);
      break;
    case 'longitudinal':
      renderLongitudinalChart(chartId, parsed.targetDiseases, parsed.detectedLab);
      break;
    default:
      renderTopRoundedBarChart(chartId, parsed);
      break;
  }

  if (stream) stream.scrollTop = stream.scrollHeight;
}


export async function handleSingleSymptomQuery(queryInput, descriptorsData = {}) {
  console.log(`[DEBUG] handleSingleSymptomQuery received input: "${queryInput}"`);
  
  const { fullCode, digits: targetDigits } = parseHpo(queryInput);
  console.log(`[DEBUG] Parsed HPO -> fullCode: ${fullCode}, digits: ${targetDigits}`);
  
  // Check if query looks like an HPO code or single symptom query
  if (!fullCode && !queryInput.startsWith("HP:")) {
    console.log(`[DEBUG] Failed validation: fullCode or HP: prefix missing`);
    return false;
  }

  const clusterDataCache = await loadClusterData();
  if (!clusterDataCache) {
    console.log(`[DEBUG] clusterDataCache failed to load or is empty`);
    return false;
  }

  // Find the dataset with "display_label": "PytheasDB (all)"
  let targetGeneKey = null;
  for (const [key, entry] of Object.entries(clusterDataCache)) {
    if (entry.display_label === "PytheasDB (all)") {
      targetGeneKey = key;
      break;
    }
  }

  console.log(`[DEBUG] Target gene key for PytheasDB (all):`, targetGeneKey);
  if (!targetGeneKey) return false;

  const geneObj = clusterDataCache[targetGeneKey];
  const clusteringResults = geneObj.clustering_results?.optimal || {};
  const clusters = clusteringResults.clusters || [];
  console.log(`[DEBUG] Total clusters found in optimal results:`, clusters.length);
  
  const descriptor = loadHpoDescriptor(idToTerm, targetDigits);
  const matchedClusters = [];

  clusters.forEach(cluster => {
    const clusterId = cluster.cluster_id;
    const assocSigs = cluster.associated_signatures || [];

    // Standardized signature matching using parseHpo fullCode across all HPO key variants
    const matchedSig = assocSigs.find(sig => {
      const sigRaw = sig.hpo_code || sig.hpoCode || sig.id || sig.hpo_id || "";
      return parseHpo(sigRaw).fullCode === fullCode;
    });

    if (matchedSig) {
      const pValue = matchedSig.p_value || "N/A";
      const patientRows = [];

      (cluster.patients || []).forEach(patient => {
        const patientSymptomsFull = (patient.symptoms || []).map(s => parseHpo(s).fullCode);
        const patientSymptomsDigits = (patient.symptoms || []).map(s => parseHpo(s).digits);

        console.log(`[DEBUG] Patient ID:`, patient.patients, `Symptoms array:`, patient.symptoms);
        console.log(`[DEBUG] Mapped patient digits:`, patientSymptomsDigits, `Target digits:`, targetDigits);
        
        if (patientSymptomsFull.includes(fullCode)) {
          let doi = patient.doi || "";
          if (doi && !doi.startsWith("http")) {
            doi = `https://doi.org/${doi}`;
          }
          patientRows.push({
            doi,
            patientId: patient.patients || "",
            gene: patient.gene || "N/A"
          });
        }
      });

      matchedClusters.push({
        clusterId,
        pValue,
        patientRows,
        totalClusterPatients: cluster.patients ? cluster.patients.length : 0
      });
    }
  });

  console.log(`[DEBUG] Total matched clusters for symptom:`, matchedClusters.length);

  // --- 1. DIRECT EXACT MATCH FOUND ---
  if (matchedClusters.length > 0) {
    renderSymptomResultCard(fullCode, descriptor, targetGeneKey, matchedClusters);
    return true;
  }

  // --- 2. NO MATCH: DISPLAY LOADING SPINNER ---
  showClusterSystemMessage(`
    <div style="display: flex; align-items: center; gap: 10px; color: #4b5563;">
      <div class="spinner" style="border: 3px solid #f3f3f3; border-top: 3px solid #2563eb; border-radius: 50%; width: 18px; height: 18px; animation: spin 1s linear infinite;"></div>
      <span>No direct cluster matches found for <strong>${fullCode}</strong> (${descriptor}). Searching parent, child, and organ system terms...</span>
    </div>
  `);

  // Allow browser thread to render spinner before running heavy DAG traversal
  await new Promise(resolve => setTimeout(resolve, 50));

  // --- 3. TRAVERSE HPO DAG ---
  const dagData = await loadHpoDag();
  const { ancestorMatches, descendantMatches, sameOrganMatches } = findRelatedClusterTerms(targetDigits, clusters, dagData);

  // Helper to construct clickable HPO links
  const formatTermLinks = (matches) => {
    return matches.map(m => {
      const termDesc = loadHpoDescriptor(idToTerm, m.digits);
      return `<a href="#" class="hpo-search-link" data-hpo="${m.fullCode}" style="color: #2563eb; text-decoration: underline; font-weight: 600;">${m.fullCode}</a> (${termDesc})`;
    }).join(', ');
  };

  // --- 4. RENDER FALLBACK RESULTS CARD ---
  let fallbackHtml = `Symptom "<strong>${fullCode}</strong>" (${descriptor}) was not found in associated signatures for any cluster in PytheasDB (all).<br><br>`;

  const hasAnyMatches = ancestorMatches.length > 0 || descendantMatches.length > 0 || sameOrganMatches.length > 0;

  if (!hasAnyMatches) {
    fallbackHtml += `<em>No related parent, child, or organ system terms with cluster matches were found.</em>`;
  } else {
    if (ancestorMatches.length > 0) {
      fallbackHtml += `<strong>Matching Broader/Parent Terms:</strong><br>${formatTermLinks(ancestorMatches)}<br><br>`;
    }
    if (descendantMatches.length > 0) {
      fallbackHtml += `<strong>Matching Specific/Child Terms:</strong><br>${formatTermLinks(descendantMatches)}<br><br>`;
    }
    if (sameOrganMatches.length > 0) {
      fallbackHtml += `<strong>Matching Terms in Same Organ System:</strong><br>${formatTermLinks(sameOrganMatches)}`;
    }
  }

  showClusterSystemMessage(fallbackHtml);
  return true;
}



export function showHpoSuggestionsMessage(query, suggestions) {
  const linksHtml = suggestions.map(s => `
    <li style="margin-bottom: 6px;">
      <a href="#" class="hpo-suggestion-link" data-hpo="${s.code}" style="color: #2563eb; font-weight: 600; text-decoration: underline; cursor: pointer;">
        ${escapeHtml(s.term)}
      </a>
      <span style="color: #6b7280; font-size: 0.85em;">(${s.code})</span>
    </li>
  `).join('');

  showClusterSystemMessage(`
    <div>
      <p style="margin-bottom: 8px;">No exact match found for symptom <strong>"${escapeHtml(query)}"</strong>. Did you mean one of these?</p>
      <ul style="margin: 0; padding-left: 20px;">
        ${linksHtml}
      </ul>
    </div>
  `);
}



// Global Event Delegation listener for all interactive chat links
document.addEventListener('click', async (event) => {
  // 1. Cluster combo links
  const clusterLink = event.target.closest('.cluster-combo-link');
  if (clusterLink) {
    event.preventDefault();
    const query = clusterLink.dataset.query;
    if (query) parseAndRoute(query);
    return;
  }

  // 2. HPO suggestion links
  const suggestionLink = event.target.closest('.hpo-suggestion-link');
  if (suggestionLink) {
    event.preventDefault();
    const hpoCode = suggestionLink.dataset.hpo;
    if (hpoCode) {
      const input = document.getElementById('queryInput');
      if (input) input.value = hpoCode;
      submitQuery();
    }
    return;
  }

  // 3. Related HPO search links (parent/child/organ fallbacks)
  const hpoSearchLink = event.target.closest('.hpo-search-link');
  if (hpoSearchLink) {
    event.preventDefault();
    const hpoCode = hpoSearchLink.getAttribute('data-hpo');
    if (hpoCode) {
      console.log(`[DEBUG] Related HPO link clicked: ${hpoCode}`);
      const chatInput = document.getElementById('queryInput') || document.getElementById('chat-input');
      if (chatInput) chatInput.value = hpoCode;
      await handleSingleSymptomQuery(hpoCode);
    }
    return;
  }

  // 4. Symptom exploration branch choice buttons
  const branchBtn = event.target.closest('.symptom-branch-btn');
  if (branchBtn) {
    event.preventDefault();
    const mode = branchBtn.dataset.mode;
    const hpoCode = branchBtn.dataset.hpo;
    const descriptor = branchBtn.dataset.desc;

    // Disable buttons after selection
    const parentContainer = branchBtn.parentElement;
    if (parentContainer) {
      parentContainer.querySelectorAll('.symptom-branch-btn').forEach(btn => btn.disabled = true);
    }

    if (mode === 'phenotype') {
      // Option (b): Existing workflow
      await handleSingleSymptomQuery(hpoCode);
    } else if (mode === 'gene') {
      // Option (a): New symptom-gene association workflow
      await handleSymptomGeneAssociations(hpoCode, descriptor);
    }
    return;
  }

  // 5. Symptom gene fallback links
  const symptomGeneLink = event.target.closest('.symptom-gene-link');
  if (symptomGeneLink) {
    event.preventDefault();
    const hpoCode = symptomGeneLink.getAttribute('data-hpo');
    const descriptor = symptomGeneLink.getAttribute('data-desc');
    if (hpoCode) {
      console.log(`[DEBUG] Related symptom-gene link clicked: ${hpoCode}`);
      await handleSymptomGeneAssociations(hpoCode, descriptor);
    }
    return;
  }

});


export function promptSymptomBranchChoice(hpoCode, descriptor) {
  const container = document.getElementById('messagesContainer');
  const stream = document.getElementById('chatStream');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'message ai';
  msgDiv.innerHTML = `
    <div class="ai-card">
      <div class="ai-card-header">
        <img src="data/PYTHEAS_Logo.svg" alt="Pytheas" class="small-logo" onerror="this.src='https://via.placeholder.com/24x24?text=P'" />
        <span class="ai-card-title">Symptom query</span>
      </div>
      <p style="margin-bottom: 12px; color: #334155; font-size: 0.95rem;">
        Identified symptom <strong>${hpoCode}</strong> (${descriptor}). Select an exploration mode:
      </p>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="symptom-branch-btn" data-mode="gene" data-hpo="${hpoCode}" data-desc="${descriptor}"
          style="padding: 8px 14px; background-color: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
          Explore symptom-gene associations
        </button>
        <button class="symptom-branch-btn" data-mode="phenotype" data-hpo="${hpoCode}" data-desc="${descriptor}"
          style="padding: 8px 14px; background-color: #0d9488; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
          Explore symptom-gene-phenotype associations (cluster analysis). 
        </button>
      </div>
    </div>
  `;

  container.appendChild(msgDiv);
  if (stream) stream.scrollTop = stream.scrollHeight;
}


export async function handleSymptomGeneAssociations(hpoCode, descriptor) {
  const indexData = await loadSymptomIndex();
  if (!indexData) return;

  const geneTotals = indexData.meta?.gene_totals || {};
  const patientMap = indexData.meta?.patients || {};

  const cleanInput = hpoCode.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  const dataContainer = indexData.symptoms || indexData.data || indexData;

  const containerKeys = Object.keys(dataContainer);
  const matchedKey = containerKeys.find(
    k => k.trim().toLowerCase() === cleanInput.toLowerCase() ||
         k.trim().toLowerCase() === cleanInput.replace(':', '_').toLowerCase()
  );

  const symptomData = matchedKey ? dataContainer[matchedKey] : null;

  // --- DAG FALLBACK TRAVERSAL IF NO DATA FOUND ---
  if (!symptomData) {
    const { fullCode, digits: targetDigits } = parseHpo(cleanInput);
    const effectiveCode = fullCode || cleanInput;

    // Display loading spinner while DAG processing runs
    showClusterSystemMessage(`
      <div style="display: flex; align-items: center; gap: 10px; color: #4b5563;">
        <div class="spinner" style="border: 3px solid #f3f3f3; border-top: 3px solid #2563eb; border-radius: 50%; width: 18px; height: 18px; animation: spin 1s linear infinite;"></div>
        <span>No symptom-gene association data found for <strong>${effectiveCode}</strong> (${descriptor || 'Unknown'}). Searching parent, child, and organ system terms...</span>
      </div>
    `);

    await new Promise(resolve => setTimeout(resolve, 50));

    const dagData = await loadHpoDag();
    const { ancestorMatches, descendantMatches, sameOrganMatches } = findRelatedSymptomTerms(targetDigits, indexData, dagData);

    const formatTermLinks = (matches) => {
      return matches.map(m => {
        const termDesc = loadHpoDescriptor(idToTerm, m.digits);
        return `<a href="#" class="symptom-gene-link" data-hpo="${m.fullCode}" data-desc="${escapeHtml(termDesc)}" style="color: #2563eb; text-decoration: underline; font-weight: 600;">${m.fullCode}</a> (${termDesc})`;
      }).join(', ');
    };

    let fallbackHtml = `Symptom "<strong>${effectiveCode}</strong>" (${descriptor || 'Unknown'}) has no direct gene association data in the symptom index.<br><br>`;

    const hasAnyMatches = ancestorMatches.length > 0 || descendantMatches.length > 0 || sameOrganMatches.length > 0;

    if (!hasAnyMatches) {
      fallbackHtml += `<em>No related parent, child, or organ system terms with symptom data were found.</em>`;
    } else {
      if (ancestorMatches.length > 0) {
        fallbackHtml += `<strong>Matching Broader/Parent Terms:</strong><br>${formatTermLinks(ancestorMatches)}<br><br>`;
      }
      if (descendantMatches.length > 0) {
        fallbackHtml += `<strong>Matching Specific/Child Terms:</strong><br>${formatTermLinks(descendantMatches)}<br><br>`;
      }
      if (sameOrganMatches.length > 0) {
        fallbackHtml += `<strong>Matching Terms in Same Organ System:</strong><br>${formatTermLinks(sameOrganMatches)}`;
      }
    }

    showClusterSystemMessage(fallbackHtml);
    return;
  }

  // --- DATA PROCESSING & RENDERING FOR MATCHED SYMPTOM ---
  const summaryRows = [];

  for (const [gene, patientKeys] of Object.entries(symptomData)) {
    const totalPatientsForGene = geneTotals[gene] || 0;
    const patientList = Array.isArray(patientKeys) ? patientKeys : [];
    const freq = patientList.length;
    const percentage = totalPatientsForGene > 0 ? (freq / totalPatientsForGene) * 100 : 0;

    const doiGroupMap = new Map();

    patientList.forEach(pKey => {
      const patientMeta = patientMap[pKey];
      
      if (Array.isArray(patientMeta)) {
        const [rawDoi, rawPid] = patientMeta;
        const doi = (rawDoi != null && rawDoi !== '') ? String(rawDoi) : 'Unknown DOI';

        if (!doiGroupMap.has(doi)) {
          doiGroupMap.set(doi, []);
        }

        if (rawPid != null && rawPid !== '') {
          doiGroupMap.get(doi).push(String(rawPid));
        }
      }
    });

    const doiDetails = Array.from(doiGroupMap.entries()).map(([doi, pids]) => ({
      doi,
      pids: pids.length > 0 ? pids.join(', ') : 'N/A'
    }));

    summaryRows.push({
      gene,
      frequency: freq,
      totalPatients: totalPatientsForGene,
      percentage,
      doiDetails
    });
  }

  summaryRows.sort((a, b) => b.percentage - a.percentage);

  renderSymptomGeneAssociationCard(hpoCode, descriptor, summaryRows);
}


