import { translations, currentLang } from '../i18n.js';
import { parseAndRoute } from './queryParser.js';
import { escapeHtml, parseHpo, loadHpoDescriptor } from './utils.js';
import { loadClusterData, hpoDescriptors } from '../api.js';
import { 
  renderSummaryTable, 
  renderSurvivalPlot, 
  renderGroupedBarChart, 
  renderTopRoundedBarChart, 
  renderBoxOrRangeChart, 
  renderInverseSurvivalPlot, 
  renderLongitudinalChart,
  renderSymptomResultCard 
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
  
  // If the router handled it as a direct symptom query, exit early here!
  if (parsed && parsed.isSymptomQuery) {
    return;
  }

  const finalQueryText = parsed.resolvedQuery || query;

  if (queryHistory.length === 0 || queryHistory[queryHistory.length - 1] !== finalQueryText) {
    queryHistory.push(finalQueryText);
  }
  historyIndex = queryHistory.length;
  currentDraft = "";

  appendUserMessage(finalQueryText);
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

// Global Event Delegation listener for cluster links
document.addEventListener('click', (event) => {
    const link = event.target.closest('.cluster-combo-link');
    if (link) {
        event.preventDefault();
        const query = link.dataset.query;
        if (query) {
            parseAndRoute(query);
        }
    }
});


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
  
  const descriptor = loadHpoDescriptor(hpoDescriptors, targetDigits);
  const matchedClusters = [];

  clusters.forEach(cluster => {
    const clusterId = cluster.cluster_id;
    const assocSigs = cluster.associated_signatures || [];

    let matchedSig = null;
    for (const sig of assocSigs) {
      const sigRaw = sig.hpo_code || sig.id || "";
      const { digits: sigDigits } = parseHpo(sigRaw);
      if (sigDigits === targetDigits) {
        matchedSig = sig;
        break;
      }
    }

    if (matchedSig) {
      const pValue = matchedSig.p_value || "N/A";
      const patientRows = [];

      (cluster.patients || []).forEach(patient => {
        const patientSymptomsDigits = (patient.symptoms || []).map(s => parseHpo(s).digits);

        console.log(`[DEBUG] Patient ID:`, patient.patients, `Symptoms array:`, patient.symptoms);
        console.log(`[DEBUG] Mapped patient digits:`, patientSymptomsDigits, `Target digits:`, targetDigits);
        
        if (patientSymptomsDigits.includes(targetDigits)) {
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
        patientRows
      });
    }
  });

  console.log(`[DEBUG] Total matched clusters for symptom:`, matchedClusters.length);

  renderSymptomResultCard(fullCode, descriptor, targetGeneKey, matchedClusters);
  return true;
}
