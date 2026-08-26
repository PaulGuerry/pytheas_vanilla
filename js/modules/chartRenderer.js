
import { getLevenshteinDistance } from './utils.js';
import { currentLang, translations } from '../i18n.js';
import { getCohortData, loadClusterData, getHpoLabel } from '../api.js';
import { ABBREVIATIONS, REMOVAL_WORDS } from '../constants.js';

// Color utility definitions
const D3_CATEGORY10 = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"
];

const D3_CATEGORY20 = [
  "#1f77b4", "#aec7e8", "#ff7f0e", "#ffbb78", "#2ca02c", "#98df8a",
  "#d62728", "#ff9896", "#9467bd", "#c5b0d5", "#8c564b", "#c49c94",
  "#e377c2", "#f7b6d2", "#7f7f7f", "#c7c7c7", "#bcbd22", "#dbdb8d",
  "#17becf", "#9edae5"
];

export function getD3Color(index, totalCount) {
  if (totalCount < 10) {
    return D3_CATEGORY10[index % D3_CATEGORY10.length];
  }
  return D3_CATEGORY20[index % D3_CATEGORY20.length];
}

const BREWER_SET2 = [
  "#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3",
  "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"
];

export function getBrewerSet2Color(index) {
  return BREWER_SET2[index % BREWER_SET2.length];
}

export function hexToRgba(hexStr, opacity) {
  let c = hexStr.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(char => char + char).join('');
  }
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}


// Text processing utilities
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function wrapText(str, maxCharsPerLine = 15) {
  if (!str) return '';
  
  const words = str.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    if (word.length > maxCharsPerLine) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      for (let i = 0; i < word.length; i += maxCharsPerLine - 1) {
        const chunk = word.slice(i, i + maxCharsPerLine - 1);
        const isLastChunk = i + maxCharsPerLine - 1 >= word.length;
        lines.push(isLastChunk ? chunk : `${chunk}-`);
      }
      return;
    }

    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  });

  if (currentLine) lines.push(currentLine);

  return lines.join('<br>');
}

export function formatText(str, maxCharsPerLine = 15, map = ABBREVIATIONS, stripList = REMOVAL_WORDS) {
  if (!str) return '';

  let text = str;

  const alwaysStrip = stripList.filter(word => !['concentration', 'level'].includes(word.toLowerCase()));
  alwaysStrip.forEach(word => {
    const stripRegex = new RegExp(`\\b${escapeRegExp(word)}\\b\\s*`, 'gi');
    text = text.replace(stripRegex, '');
  });

  const conditionalPrefixes = ['elevated', 'increased', 'decreased', 'reduced', 'high', 'low'];
  const prefixPattern = conditionalPrefixes.join('|');
  
  const targetTermsRegex = new RegExp(`\\b(${prefixPattern})\\b((?:(?!\\b(?:${prefixPattern})\\b|[,;.]).)*?)\\s+(?:concentration|level)\\b`, 'gi');
  text = text.replace(targetTermsRegex, '$1$2');

  Object.keys(map).forEach(key => {
    const mapRegex = new RegExp(`\\b${escapeRegExp(key)}\\b`, 'gi');
    text = text.replace(mapRegex, map[key]);
  });    

  text = text.replace(/\s+/g, ' ').trim();

  return wrapText(text, maxCharsPerLine);
}

// Query Parsing Helpers
export function normalizeQueryTypos(norm) {
  return norm
    .replace(/\bp[fi]+c\s*(\d+)\b/gi, 'pfic$1')
    .replace(/\bpfic\s*10\b/gi, 'pfic10');
}







export function renderSummaryTable(parsed) {
  const { variable, targetDiseases=[], subgroupCategory, subgroupKey, detectedLab } = parsed;
  const t = translations[currentLang].table;
  const isOnsetVar = (variable === 'age_first_symptoms' || variable === 'age_onset_inverse_survival');
  const isCaddVar = (variable === 'cadd_scores');
  const isSurvivalVar = (variable === 'survival');
  const totalCount = targetDiseases.length;

  let rowsHtml = targetDiseases.map((item, index) => {
    const color = getD3Color(index, totalCount);
    const name = item.disease_name;
    const cohort = getCohortData(item);
    const pCount = cohort?.total_patients ?? 0;

    let geneLabel = item.geneSubgroupLabel || item.matchedGene || t.allGenes;
    if (item.subgroupKey && !item.geneSubgroupLabel) {
      geneLabel += ` (${item.subgroupKey})`;
    }
    let detailVal = "-";
    let medianRangeVal = "-";
    let medianCaddVal = "-";
    let sexRatioVal = "-";

    if (isOnsetVar) {
      const stats = cohort?.data_availability?.first_symptom_months || {};
      const avail = stats?.available_count ?? pCount;
      detailVal = `${avail}/${pCount}`;
      if (stats.median !== undefined && stats.median !== null) {
        const med = stats.median;
        const min = stats.min ?? 0;
        const max = stats.max ?? 0;
        medianRangeVal = `${med} m [${min} - ${max}]`;
      } else {
        medianRangeVal = "N/A";
      }
    } else if (isCaddVar) {
      const caddStats = cohort?.genetics?.cadd_mean_scores || {};
      const avail = caddStats?.available_count ?? 0;
      detailVal = `${avail}/${pCount}`;
      if (caddStats.median !== undefined && caddStats.median !== null) {
        const med = typeof caddStats.median === 'number' ? caddStats.median.toFixed(1) : caddStats.median;
        const min = typeof caddStats.min === 'number' ? caddStats.min.toFixed(1) : (caddStats.min ?? 0);
        const max = typeof caddStats.max === 'number' ? caddStats.max.toFixed(1) : (caddStats.max ?? 0);
        medianCaddVal = `${med} [${min} - ${max}]`;
      } else {
        medianCaddVal = "N/A";
      }
    } else if (variable === 'sex_ratio') {
      const boys = cohort?.demographics?.boys ?? 0;
      const girls = cohort?.demographics?.girls ?? 0;
      const totalWithSex = boys + girls;
      const ratioVal = girls > 0 ? (boys / girls).toFixed(2) : (boys > 0 ? 'N/A' : '0.00');
      
      detailVal = `${totalWithSex}/${pCount}`;
      sexRatioVal = `${ratioVal} (${boys}M / ${girls}F)`;
    } else if (isSurvivalVar) {
      const surv = cohort?.survival_km || {};
      const avail = surv.available_count ?? pCount;
      detailVal = `${avail}/${pCount}`;

      const milestones = surv.milestone_rates || {};
      const formatRate = (rate) => rate !== null && rate !== undefined ? `${(rate * 100).toFixed(1)}%` : 'N/A';

      const rate1yr = formatRate(milestones['1_year_12m']);
      const rate5yr = formatRate(milestones['5_year_60m']);
      const rate10yr = formatRate(milestones['10_year_120m']);

      return `
        <tr>
          <td>${name}</td>
          <td class="gene-name">${geneLabel}</td>
          <td>${pCount}</td>
          <td>${detailVal}</td>
          <td>${rate1yr}</td>
          <td>${rate5yr}</td>
          <td>${rate10yr}</td>
          <td><span class="color-swatch" style="background-color: ${color};"></span></td>
        </tr>
      `;
    } else if (variable === 'variant_types') {
      const vt = cohort?.genetics?.variant_types || {};
      const totalAlleles = pCount * 2;
      const availAlleles = vt.available_count ?? totalAlleles;
      detailVal = `${availAlleles}/${totalAlleles}`;
    } else if (variable === 'zygosity') {
      const zyg = cohort?.genetics?.zygosity || {};
      const counts = zyg.counts || {};
      const rawAvail = zyg.available_count ?? pCount;
      const unknownCount = counts.unknown || 0;
      const avail = Math.max(0, rawAvail - unknownCount);
      detailVal = `${avail}/${pCount}`;
    } else if (variable === 'birth_weight') {
      const bw = cohort?.data_availability?.birthweight_grams || {};
      const avail = bw?.available_count ?? pCount;
      detailVal = `${avail}/${pCount}`;
    } else if (variable === 'birth_height') {
      const bh = cohort?.data_availability?.birthheight || {};
      const avail = bh?.available_count ?? pCount;
      detailVal = `${avail}/${pCount}`;
    } else if (variable === 'longitudinal') {
      const labKey = (detectedLab || 'SBA').toUpperCase();
      const longObj = cohort?.longitudinal_trends?.[labKey];
      const cov = longObj?.patient_coverage;
      detailVal = cov ? `${cov.patients_with_data}/${cov.total_disease_patients}` : `0/${pCount}`;
    } else if (variable === 'treatments') {
      detailVal = `${pCount}/${pCount}`;
    } else {
      detailVal = `${pCount}/${pCount}`;
    }

    if (isOnsetVar) {
      return `
        <tr>
          <td>${name}</td>
          <td class="gene-name">${geneLabel}</td>
          <td>${pCount}</td>
          <td>${medianRangeVal}</td>
          <td>${detailVal}</td>
          <td><span class="color-swatch" style="background-color: ${color};"></span></td>
        </tr>
      `;
    }

    if (isCaddVar) {
      return `
        <tr>
          <td>${name}</td>
          <td class="gene-name">${geneLabel}</td>
          <td>${pCount}</td>
          <td>${medianCaddVal}</td>
          <td>${detailVal}</td>
          <td><span class="color-swatch" style="background-color: ${color};"></span></td>
        </tr>
      `;
    }

    if (variable === 'sex_ratio') {
      return `
        <tr>
          <td>${name}</td>
          <td class="gene-name">${geneLabel}</td>
          <td>${pCount}</td>
          <td>${detailVal}</td>
          <td>${sexRatioVal}</td>
          <td><span class="color-swatch" style="background-color: ${color};"></span></td>
        </tr>
      `;
    }

    return `
      <tr>
        <td>${name}</td>
        <td class="gene-name">${geneLabel}</td>
        <td>${pCount}</td>
        <td>${detailVal}</td>
        <td><span class="color-swatch" style="background-color: ${color};"></span></td>
      </tr>
    `;
  }).join('');

  let tableHeaders = `
    <thead>
      <tr>
        <th>${t.disease}</th>
        <th>${t.geneSubgroup}</th>
        <th>${t.patients}</th>
        <th>${t.dataCoverage}</th>
        <th>${t.color}</th>
      </tr>
    </thead>
  `;
  
  if (isSurvivalVar) {
    tableHeaders = `
      <thead>
        <tr>
          <th>${t.disease}</th>
          <th>${t.geneSubgroup}</th>
          <th>${t.patients}</th>
          <th>${t.dataCoverage}</th>
          <th>${t.surv1yr}</th>
          <th>${t.surv5yr}</th>
          <th>${t.surv10yr}</th>
          <th>${t.color}</th>
        </tr>
      </thead>
    `;
  } else if (isOnsetVar) {
    tableHeaders = `
      <thead>
        <tr>
          <th>${t.disease}</th>
          <th>${t.geneSubgroup}</th>
          <th>${t.patients}</th>
          <th>${t.medianOnset}</th>
          <th>${t.dataCoverage}</th>
          <th>${t.color}</th>
        </tr>
      </thead>
    `;
  } else if (isCaddVar) {
    tableHeaders = `
      <thead>
        <tr>
          <th>${t.disease}</th>
          <th>${t.geneSubgroup}</th>
          <th>${t.patients}</th>
          <th>${t.medianCadd}</th>
          <th>${t.dataCoverage}</th>
          <th>${t.color}</th>
        </tr>
      </thead>
    `;
  } else if (variable === 'sex_ratio') {
    tableHeaders = `
      <thead>
        <tr>
          <th>${t.disease}</th>
          <th>${t.geneSubgroup}</th>
          <th>${t.patients}</th>
          <th>${t.dataCoverage}</th>
          <th>${t.sexRatio}</th>
          <th>${t.color}</th>
        </tr>
      </thead>
    `;
  }

  return `
    <div class="data-table-container">
      <table class="data-table">
        ${tableHeaders}
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

export async function renderClusterCard(geneKey, rankKey = 'optimal') {
  const isFr = currentLang === 'fr';
  const clusterDataCache = await loadClusterData();

  if (!clusterDataCache || !clusterDataCache[geneKey]) return;

  const geneObj = clusterDataCache[geneKey];
  const rankResult = geneObj.clustering_results?.[rankKey];

  if (!rankResult) return;

  const crosstable = rankResult.gene_cluster_crosstable || {};
  const clusters = rankResult.clusters || [];
  const requestedGenes = geneKey.split('_');

  const container = document.getElementById('messagesContainer');
  const stream = document.getElementById('chatStream');

  if (!container) return;

  const appendCard = (cardHTML) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = "message ai";
    msgDiv.innerHTML = cardHTML;
    container.appendChild(msgDiv);
  };

  const cohortSignatures = geneObj.cohort_archetypal_signatures || [];
  const cohortPlotId = `cohort-signatures-plot-${Date.now()}`;

  if (cohortSignatures.length > 0) {
    const cohortCardHTML = `
      <div class="ai-card">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.75rem;">
          <img src="data/PYTHEAS_Logo.svg" style="height: 20px;" alt="Pytheas Logo" onerror="this.src='https://via.placeholder.com/24x24?text=P'">
          <span style="font-weight: 600; font-size: 0.95rem; color: #334155;">
            ${isFr 
              ? `Clustering phénotypique ${requestedGenes.join(', ')} : symptômes non-spécifiques (fréquents dans tous les clusters)` 
              : `${requestedGenes.join(', ')} phenotypic cluster analysis: non-specific symptoms (high prevalence in all clusters)`}
          </span>                    
        </div>
        <div id="${cohortPlotId}" class="chart-container" style="height: ${Math.max(380, cohortSignatures.length * 28)}px;"></div>
      </div>
    `;
    appendCard(cohortCardHTML);
  }

  let tableHTML = '';
  if (Object.keys(crosstable).length > 0) {
    const genesList = requestedGenes.length > 0 
      ? requestedGenes 
      : Object.keys(crosstable).filter(k => k !== 'Total');

    const clusterSet = new Set();
    genesList.forEach(geneName => {
      const row = crosstable[geneName];
      if (row && typeof row === 'object') {
        Object.keys(row).forEach(k => {
          if (k !== 'Total') clusterSet.add(k);
        });
      }
    });
    
    const clusterList = Array.from(clusterSet).sort((a, b) => {
      const numA = parseInt(a.replace(/[^\d-]/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/[^\d-]/g, ''), 10) || 0;
      return numA - numB;
    });

    let headerRow = `<th>CLUSTER</th>`;
    genesList.forEach(g => { 
      headerRow += `<th style="font-style: italic;">${g}</th>`; 
    });
    headerRow += `<th>TOTAL</th><th>COLOR</th>`;

    const validClusters = clusters.filter(c => c.cluster_id !== -1 && c.cluster_id !== '-1');

    let bodyRows = '';
    clusterList.forEach((clusterName, idx) => {
      const clusterIdNum = parseInt(clusterName.replace(/[^\d-]/g, ''), 10);
      
      let color;
      if (clusterIdNum === -1) {
        color = '#cbd5e1'; 
      } else {
        const clusterObjIdx = validClusters.findIndex(c => String(c.cluster_id) === String(clusterIdNum));
        const colorIdx = clusterObjIdx !== -1 ? clusterObjIdx : idx;
        color = getD3Color(colorIdx, validClusters.length || 1);
      }

      let rowCols = `<td style="font-weight: 600;">${clusterName.replace('_', ' ').toUpperCase()}</td>`;
      let clusterTotal = 0;

      genesList.forEach(geneName => {
        const val = crosstable[geneName]?.[clusterName] ?? 0;
        clusterTotal += val;
        rowCols += `<td>${val}</td>`;
      });

      rowCols += `<td style="font-weight: 600;">${clusterTotal}</td>`;
      rowCols += `<td><span class="color-swatch" style="background-color: ${color};"></span></td>`;
      bodyRows += `<tr>${rowCols}</tr>`;
    });

    let totalRowCols = `<td style="font-weight: 700; border-top: 2px solid #cbd5e1;">Total</td>`;
    let grandTotal = 0;
    genesList.forEach(geneName => {
      let geneTotal = crosstable[geneName]?.['Total'];
      if (geneTotal === undefined) {
        geneTotal = clusterList.reduce((sum, c) => sum + (crosstable[geneName]?.[c] ?? 0), 0);
      }
      grandTotal += geneTotal;
      totalRowCols += `<td style="font-weight: 700; border-top: 2px solid #cbd5e1;">${geneTotal}</td>`;
    });
    totalRowCols += `<td style="font-weight: 700; border-top: 2px solid #cbd5e1;">${grandTotal}</td>`;
    totalRowCols += `<td style="border-top: 2px solid #cbd5e1;">-</td>`;
    bodyRows += `<tr>${totalRowCols}</tr>`;

    tableHTML = `
      <div class="data-table-container" style="overflow-x: auto; margin-bottom: 1.5rem;">
        <table class="data-table" style="width: 100%; border-collapse: collapse;">
          <thead><tr>${headerRow}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;
  }

  const dims = clusters[0]?.dimensions_exported || 2;
  const umapPlotId1 = `umap-plot1-${Date.now()}`;
  const umapPlotId2 = `umap-plot2-${Date.now()}`;

  let umapContainersHTML = '';
  if (dims === 4) {
    umapContainersHTML = `
      <div style="display: flex; gap: 12px; width: 100%; height: 350px;">
        <div id="${umapPlotId1}" style="flex: 1; height: 100%;"></div>
        <div id="${umapPlotId2}" style="flex: 1; height: 100%;"></div>
      </div>
    `;
  } else {
    umapContainersHTML = `<div id="${umapPlotId1}" class="chart-container" style="height: 350px;"></div>`;
  }

  const combinedCardHTML = `
    <div class="ai-card">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.75rem;">
        <img src="data/PYTHEAS_Logo.svg" style="height: 20px;" alt="Pytheas Logo" onerror="this.src='https://via.placeholder.com/24x24?text=P'">
        <span style="font-weight: 600; font-size: 0.95rem; color: #334155;">
          ${isFr 
            ? `Clustering phénotypique ${requestedGenes.join(', ')} : (k = ${rankResult.num_clusters_k})` 
            : `${requestedGenes.join(', ')} phenotypic cluster analysis: (k = ${rankResult.num_clusters_k})`}
        </span>
      </div>
      ${tableHTML}
      ${umapContainersHTML}
    </div>
  `;
  appendCard(combinedCardHTML);

  const symptomPlotConfigs = [];
  const validClusters = clusters.filter(c => c.cluster_id !== -1 && c.cluster_id !== '-1');

  validClusters.forEach((cluster, idx) => {
    const barPlotId = `bar-plot-cluster-${idx}-${Date.now()}`;
    const associatedPlotId = `associated-plot-cluster-${idx}-${Date.now()}`;
    
    symptomPlotConfigs.push({ 
      plotId: barPlotId, 
      associatedPlotId: associatedPlotId,
      cluster: cluster, 
      index: idx 
    });

    const assocSignatures = cluster.associated_signatures || [];
    const assocPlotHeight = Math.max(300, assocSignatures.length * 36);

    let assocSectionHTML = '';
    if (assocSignatures.length > 0) {
      assocSectionHTML = `
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 1.5rem 0;" />
        <div style="font-weight: 600; font-size: 0.9rem; color: #475569; margin-bottom: 0.75rem;">
          ${isFr ? 'Symptômes Associés Significatifs' : `Symptoms significantly associated with cluster ${cluster.cluster_id} vs. rest of cohort`}
        </div>
        <div id="${associatedPlotId}" class="chart-container" style="height: ${assocPlotHeight}px;"></div>
      `;
    }

    const symptomCardHTML = `
      <div class="ai-card">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 1rem;">
          <img src="data/PYTHEAS_Logo.svg" style="height: 20px;" alt="Pytheas Logo" onerror="this.src='https://via.placeholder.com/24x24?text=P'">
          <span style="font-weight: 600; font-size: 0.95rem; color: #334155;">
            ${isFr ? `Symptômes Archétypaux — Cluster ${cluster.cluster_id}` : `Archetypal Symptoms — Cluster ${cluster.cluster_id}`}
          </span>
        </div>
        <div id="${barPlotId}" class="chart-container" style="height: 320px;"></div>
        ${assocSectionHTML}
      </div>
    `;
    appendCard(symptomCardHTML);
  });

  if (stream) stream.scrollTop = stream.scrollHeight;

  setTimeout(() => {
    if (cohortSignatures.length > 0) {
      renderCohortSignaturesChart(cohortPlotId, cohortSignatures, isFr);
    }

    renderClusterUMAP(umapPlotId1, umapPlotId2, clusters, dims);

    symptomPlotConfigs.forEach(cfg => {
      renderGroupedClusterSymptomChart(cfg.plotId, cfg.cluster, cfg.index, validClusters.length);

      if (cfg.cluster.associated_signatures && cfg.cluster.associated_signatures.length > 0) {
        renderAssociatedSignaturesChart(
          cfg.associatedPlotId, 
          cfg.cluster.associated_signatures, 
          cfg.index, 
          validClusters.length, 
          isFr
        );
      }
    });
  }, 50);
}


export   function renderTopRoundedBarChart(containerId, parsed) {
    if (typeof Plotly === 'undefined') return;
    const { targetDiseases, variable, subgroupCategory, subgroupKey } = parsed;
    const xLabels = [];
    const yValues = [];
    const shapes = [];
    const annotations = [];

    const numBars = targetDiseases.length;
    
    targetDiseases.forEach(item => {
      const cohort = getCohortData(item);
      xLabels.push(item.disease_name + (item.matchedGene ? ` (${item.matchedGene})` : ''));
      
      let val = 0;
      if (variable === 'birth_weight') {
        val = cohort?.data_availability?.birthweight_grams?.median || 0;
      } else if (variable === 'birth_height') {
        val = cohort?.data_availability?.birthheight?.median || 0;
      } else if (variable === 'sex_ratio') {
        const boys = cohort?.demographics?.boys ?? 0;
        const girls = cohort?.demographics?.girls ?? 0;
        val = girls > 0 ? parseFloat((boys / girls).toFixed(2)) : 0;  
      } else {
        val = cohort?.total_patients || 0;
      }
      yValues.push(val);
    });

    const maxVal = Math.max(...yValues, 1.0);
    const cornerRadiusY = maxVal * 0.04;

    targetDiseases.forEach((item, index) => {
      const val = yValues[index];
      const strokeColor = getD3Color(index, numBars);
      const fillColor = hexToRgba(strokeColor, 0.45);

      const xLeft = index - 0.28;
      const xRight = index + 0.28;
      const rX = 0.04;

      const barPath = `
        M ${xLeft},0
        L ${xLeft},${Math.max(0, val - cornerRadiusY)}
        Q ${xLeft},${val} ${xLeft + rX},${val}
        L ${xRight - rX},${val}
        Q ${xRight},${val} ${xRight},${Math.max(0, val - cornerRadiusY)}
        L ${xRight},0
        Z
      `;

      shapes.push({
        type: 'path', path: barPath,
        xref: 'x', yref: 'y',
        fillcolor: fillColor,
        line: { color: strokeColor, width: 2 },
        layer: 'below'
      });

      annotations.push({
        x: index, y: val, yshift: -22,
        text: variable === 'sex_ratio' ? `${val.toFixed(2)}` : (Number.isInteger(val) ? `${val}` : `${val.toFixed(2)}`),
        showarrow: false, font: { color: '#4b5563', size: 12, weight: 500 }
      });
    });

    shapes.push({
      type: 'line', xref: 'paper', yref: 'y',
      x0: 0, x1: 1, y0: 0, y1: 0,
      line: { color: '#1f1f1f', width: 2 }, layer: 'above'
    });

    const dummyTrace = { x: xLabels, y: yValues, type: 'scatter', mode: 'markers', marker: { opacity: 0 } };

    const layout = {
      title: false, showlegend: false,
      margin: { t: 10, l: 30, r: 10, b: 40 },
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      shapes: shapes, annotations: annotations,
      xaxis: { showgrid: false, range: [-0.6, numBars - 0.4] },
      yaxis: { 
        showgrid: false, 
        showticklabels: false, 
        title: variable === 'sex_ratio' ? translations[currentLang].table.sexRatio : '',
        range: [0, maxVal * 1.15] 
      }
    };

    Plotly.newPlot(containerId, [dummyTrace], layout, { responsive: true, displayModeBar: false });
  }


export   function renderSurvivalPlot(containerId, targets) {
    if (typeof Plotly === 'undefined') return;
    const traces = [];
    const maxXVals = [];
    const t = translations[currentLang].chart;
  
    targets.forEach((item, index) => {
      // getCohortData will now automatically pick up item.subgroupCategory and item.subgroupKey
      const cohort = getCohortData(item);
      const km = cohort?.survival_km;
      
      if (km && km.timeline && km.survival_probability && km.timeline.length > 0) {
        maxXVals.push(Math.max(...km.timeline));
        const color = getD3Color(index, targets.length);
  
        const label = `${item.disease_name}${item.matchedGene ? ` (${item.matchedGene})` : ''}${item.subgroupKey ? ` - ${item.subgroupKey}` : ''}`;
  
        traces.push({
          x: km.timeline,
          y: km.survival_probability,
          name: label,
          type: 'scatter', 
          mode: 'lines',
          line: { shape: 'hv', color: color, width: 2 }
        });
  
        if (km.ci_lower && km.ci_upper) {
          traces.push({
            x: [...km.timeline, ...km.timeline.slice().reverse()],
            y: [...km.ci_upper, ...km.ci_lower.slice().reverse()],
            fill: 'toself',
            fillcolor: hexToRgba(color, 0.15),
            line: { color: 'transparent' },
            showlegend: false,
            type: 'scatter'
          });
        }
      }
    });
  
    const layout = {
      showlegend: false,
      legend: { orientation: 'h', y: 1.12, x: 0.5, xanchor: 'center' },
      margin: { t: 30, l: 40, r: 20, b: 45 },
      paper_bgcolor: '#ffffff', 
      plot_bgcolor: '#ffffff',
      xaxis: { title: t.ageMonths, showgrid: false, range: [0, maxXVals.length ? Math.max(...maxXVals) : 240] },
      yaxis: { title: t.overallSurvivalRate, showgrid: false, range: [0, 1.05] }
    };
    Plotly.newPlot(containerId, traces, layout, { responsive: true, displayModeBar: false });
  }


export function renderGroupedBarChart(containerId, parsed) {
    if (typeof Plotly === 'undefined') return;
    const { variable, targetDiseases = [], detectedTreatment, subgroupCategory, subgroupKey } = parsed;
    const catT = translations[currentLang].categories;
    const chartT = translations[currentLang].chart;
    let categories = [];
    let keys = [];

    if (variable === 'variant_types') {
      keys = ["missense", "frameshift", "nonsense", "splice_site", "deletion", "insertion"];
      categories = catT.variant;
    } else if (variable === 'zygosity') {
      keys = ["homozygous", "compound", "heterozygous"];
      categories = catT.zygosity;
    } else if (variable === 'cadd_scores') {
      keys = ["high (>=20)", "moderate (10-19.9)", "low (<10)"];
      categories = catT.cadd;
    } else if (variable === 'treatments') {
      keys = ["Response / Benefit", "Transient / Limited", "No Response / Worse", "Unknown"];
      categories = catT.treatments;
    }

    // Step 1: Extract all yValues to compute global chart range max
    const tracesYValues = targetDiseases.map((d) => {
      const cohort = getCohortData(d);
      return keys.map(catKey => {
        if (variable === 'variant_types') {
          const rawCount = cohort?.genetics?.variant_types?.counts?.[catKey] || 0;
          const pCount = cohort?.total_patients || cohort?.patient_count || 0;
          const totalAlleles = cohort?.genetics?.variant_types?.available_count ?? (pCount * 2);
          return totalAlleles > 0 ? (rawCount / totalAlleles) * 100 : 0;
        } else if (variable === 'zygosity') {
          const zyg = cohort?.genetics?.zygosity || {};
          const counts = zyg.counts || {};
          const rawAvail = zyg.available_count ?? (cohort?.total_patients || cohort?.patient_count || 0);
          const unknownCount = counts.unknown || 0;
          const avail = Math.max(0, rawAvail - unknownCount);

          const count = counts[catKey] || 0;
          return avail > 0 ? Math.round((count / avail) * 100) : 0;
        } else if (variable === 'cadd_scores') {
          return cohort?.genetics?.cadd_tiers?.counts?.[catKey] || 0;
        } else if (variable === 'treatments') {
          const txs = cohort?.treatments || {};
          if (detectedTreatment && txs[detectedTreatment]) {
            return txs[detectedTreatment]?.[catKey] || 0;
          }
          let sum = 0;
          Object.values(txs).forEach(tx => {
            sum += tx?.[catKey] || 0;
          });
          return sum;
        }
        return 0;
      });
    });

    const maxVal = Math.max(...tracesYValues.flat(), 1.0);
    const threshold = maxVal * 0.10; // 10% of total range

    // Step 2: Build Plotly traces with dynamic text positioning and colors
    const traces = targetDiseases.map((d, dIdx) => {
      const label = d.disease_name + (d.matchedGene ? ` (${d.matchedGene})` : '');
      const color = getD3Color(dIdx, targetDiseases.length);
      const yValues = tracesYValues[dIdx];

      const textLabels = [];
      const textPositions = [];
      const fontColors = [];

      yValues.forEach(val => {
        const isPercentage = variable === 'variant_types';
        const isZygosity = variable === 'zygosity';
        
        let formattedVal;
        if (isPercentage) {
          formattedVal = `${val.toFixed(0)}%`;
        } else if (isZygosity) {
          formattedVal = `${val}%`;
        } else {
          formattedVal = `${val}`;
        }
        
        textLabels.push(formattedVal);

        // If bar height is less than 10% of total range, place above in black
        if (val < threshold) {
          textPositions.push('outside');
          fontColors.push('#1f2937'); // Black / Dark Slate
        } else {
          textPositions.push('inside');
          fontColors.push('#ffffff'); // White
        }
      });

      return {
        x: categories,
        y: yValues,
        name: label,
        type: 'bar',
        text: textLabels,
        textposition: textPositions,
        textfont: {
          color: fontColors,
          size: 12,
          weight: 300
        },
        insidetextanchor: 'end', // Positions white text just below the top edge inside the bar
        marker: { color: color, cornerradius: 8 },
        hovertemplate: variable === 'variant_types' 
          ? `<b>%{x}</b><br>%{y:.1f}%<extra></extra>` 
          : (variable === 'zygosity' 
              ? `<b>%{x}</b><br>%{y}%<extra></extra>` 
              : `<b>%{x}</b><br>%{y}<extra></extra>`)
      };
    });

    const isVariantTypes = variable === 'variant_types';
    const yAxisTitle = isVariantTypes ? (chartT.allele_percentage || 'Percentage of Alleles (%)') : chartT.counts;

    const layout = {
      barmode: 'group',
      showlegend: false,
      legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center' },
      margin: { t: 40, l: 20, r: 20, b: 40 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      xaxis: { showgrid: false },
      yaxis: { 
        title: false, 
        showticklabels: false, 
        showgrid: false,
        range: [0, maxVal * 1.15] // Extra padding at top for labels outside short bars
      }
    };

    Plotly.newPlot(containerId, traces, layout, { responsive: true, displayModeBar: false });
}


export   function renderBoxOrRangeChart(containerId, parsed) {
    if (typeof Plotly === 'undefined') return;
    const { targetDiseases = [], variable, subgroupCategory, subgroupKey } = parsed;
    const t = translations[currentLang].chart;
  
    const xLabels = [];
    const yMedians = [];
    const errorPlus = [];
    const errorMinus = [];
    const markerColors = [];
  
    targetDiseases.forEach((d, idx) => {
      const cohort = getCohortData(d); 
      const stats = (variable === 'cadd_scores') 
        ? cohort?.genetics?.cadd_mean_scores || {} 
        : cohort?.data_availability?.first_symptom_months || {};
  
      const min = stats.min ?? 0;
      const med = stats.median ?? 0;
      const max = stats.max ?? 0;
  
      const label = d.disease_name + (d.matchedGene ? ` (${d.matchedGene})` : '');
      
      xLabels.push(label);
      yMedians.push(med);
      errorPlus.push(Math.max(0, max - med));
      errorMinus.push(Math.max(0, med - min));
      markerColors.push(getD3Color(idx, targetDiseases.length));
    });
  
    const trace = {
      x: xLabels,
      y: yMedians,
      type: 'scatter',
      mode: 'markers',
      marker: {
        size: 10,
        color: markerColors
      },
      error_y: {
        type: 'data',
        symmetric: false,
        array: errorPlus,
        arrayminus: errorMinus,
        color: '#4b5563',
        thickness: 2,
        width: 8
      },
      hovertemplate: variable === 'cadd_scores' 
        ? '<b>%{x}</b><br>Median CADD: %{y}<br>Range: [%{customdata.min} - %{customdata.max}]<extra></extra>'
        : '<b>%{x}</b><br>Median Age: %{y}m<extra></extra>',
      customdata: targetDiseases.map((d, idx) => {
        const cohort = getCohortData(d);
        const stats = (variable === 'cadd_scores') 
          ? cohort?.genetics?.cadd_mean_scores || {} 
          : cohort?.data_availability?.first_symptom_months || {};
        return { min: stats.min ?? 0, max: stats.max ?? 0 };
      })
    };
  
    const layout = {
      showlegend: false,
      margin: { t: 30, l: 50, r: 30, b: 50 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      xaxis: { 
        showgrid: false,
        range: [-0.6, xLabels.length - 0.4] 
      },
      yaxis: { 
        title: variable === 'cadd_scores' ? 'Median CADD Score [Min - Max]' : t.ageMonths, 
        showgrid: true,
        zeroline: false
      }
    };
  
    Plotly.newPlot(containerId, [trace], layout, { responsive: true, displayModeBar: false });
  }


export  function renderInverseSurvivalPlot(containerId, parsed, subgroupCategory, subgroupKey) {
    if (typeof Plotly === 'undefined') return;
    const { targetDiseases } = parsed;
    const t = translations[currentLang].chart;
    const traces = [];

    targetDiseases.forEach((d, idx) => {
      const cohort = getCohortData(d);
      const km = cohort?.inverse_survival_km;
      if (km && km.timeline && km.survival_probability) {
        const cumulativeIncidence = km.survival_probability.map(p => 1 - p);

        traces.push({
          x: km.timeline,
          y: cumulativeIncidence,
          name: d.disease_name + (d.matchedGene ? ` (${d.matchedGene})` : ''),
          mode: 'lines',
          line: { shape: 'hv', color: getD3Color(idx, targetDiseases.length), width: 2 }
        });
      }
    });

    const layout = {
      showlegend: false,
      margin: { t: 20, l: 40, r: 20, b: 45 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      xaxis: { title: t.ageMonths, showgrid: false },
      yaxis: { title: t.cumSymptomOnset, showgrid: true, range: [0, 1.05] }
    };

    Plotly.newPlot(containerId, traces, layout, { responsive: true, displayModeBar: false });
  }


export  function renderLongitudinalChart(containerId, targets, labVar, subgroupCategory, subgroupKey) {
    if (typeof Plotly === 'undefined') return;
    const traces = [];
    const t = translations[currentLang].chart;

    targets.forEach((d, idx) => {
      const cohort = getCohortData(d);
      const longData = cohort?.longitudinal_trends ? cohort.longitudinal_trends[labVar] : null;
      if (!longData) return;
      
      const model = longData.by_patient_age;
      if (!model) return;

      const color = getD3Color(idx, targets.length);
      const label = d.disease_name + (d.matchedGene ? ` (${d.matchedGene})` : '');

      if (model.scatter && Array.isArray(model.scatter)) {
        const scatterX = model.scatter.map(pt => pt.x);
        const scatterY = model.scatter.map(pt => pt.y);
        traces.push({
          x: scatterX, y: scatterY, name: `${label} (Obs)`,
          mode: 'markers', type: 'scatter', marker: { color: color, opacity: 0.3, size: 6 }
        });
      }

      if (model.trend_x && model.trend_y) {
        traces.push({
          x: model.trend_x, y: model.trend_y, name: `${label} (LOESS)`,
          mode: 'lines', type: 'scatter', line: { color: color, width: 3 }
        });
      }
    });

    const layout = {
      showlegend: false, margin: { t: 20, l: 50, r: 20, b: 40 },
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      xaxis: { title: t.ageMonths, showgrid: false },
      yaxis: { title: `${labVar || t.labMetric}`, showgrid: true }
    };
    Plotly.newPlot(containerId, traces, layout, { responsive: true, displayModeBar: false });
  }

export function renderCohortSignaturesChart(containerId, signaturesData, isFr) {
    const items = [...signaturesData].reverse();

    const yCategories = items.map(item => {
        const rawLabel = getHpoLabel(item['HPO Code']) || item['Description']; 
        return typeof formatText === 'function' 
            ? formatText(item['Description'], 30) 
            : item['Description'];
    });

    const xValues = items.map(item => parseFloat(item['Cohort Prevalence']) || 0);

    const strokeColor = getBrewerSet2Color(0);
    const fillColor = hexToRgba(strokeColor, 0.45);
    const barHeight = 0.45;

    const shapes = [];
    const annotations = [];

    xValues.forEach((val, i) => {
        const yCenter = i; 
        const yMin = yCenter - barHeight / 2;
        const yMax = yCenter + barHeight / 2;
        const xMin = 0;
        const xMax = val;

        if (xMax > 0) {
            const rx = Math.min(1.5, xMax * 0.1); 

            const path = `M ${xMin},${yMin} ` +
                         `L ${xMax - rx},${yMin} ` +
                         `Q ${xMax},${yMin} ${xMax},${yCenter} ` +
                         `Q ${xMax},${yMax} ${xMax - rx},${yMax} ` +
                         `L ${xMin},${yMax} Z`;

            shapes.push({
                type: 'path',
                path: path,
                fillcolor: fillColor,
                line: { color: strokeColor, width: 2 },
                xref: 'x',
                yref: 'y'
            });
        }

        annotations.push({
            x: val,
            y: yCenter,
            text: `${val}%`,
            xanchor: 'right',
            yanchor: 'middle',
            xshift: -8,
            showarrow: false,
            font: {
                family: 'sans-serif',
                size: 11,
                color: '#4b5563',
                weight: 500
            }
        });
    });

    // Vertical baseline on the left (x=0) extended slightly for padding
    shapes.push({
        type: 'line',
        x0: 0,
        x1: 0,
        y0: -0.5,
        y1: items.length - 0.5,
        line: { color: '#1f1f1f', width: 2 },
        xref: 'x',
        yref: 'y'
    });

    const tickVals = items.map((_, i) => i);

    const trace = {
        x: xValues,
        y: tickVals,
        type: 'scatter',
        mode: 'markers',
        marker: { opacity: 0 },
        hoverinfo: 'text',
        hovertext: items.map(item => `<b>${item['Description']}</b><br>HPO: ${item['HPO Code']}<br>Prevalence: ${item['Cohort Prevalence']}<br>Level: ${item['Representation Level']}`)
    };

    const layout = {
        autosize: true,
        margin: { l: 220, r: 30, t: 20, b: 40 },
        shapes: shapes,
        annotations: annotations,
        xaxis: {
            title: { text: isFr ? 'Prévalence dans la Cohorte (%)' : 'Cohort Prevalence (%)', font: { size: 12, color: '#334155' } },
            range: [0, 105],
            zeroline: false,
            showline: false,
            gridcolor: '#e2e8f0'
        },
        yaxis: {
            tickmode: 'array',
            tickvals: tickVals,
            ticktext: yCategories,
            range: [-0.6, items.length - 0.4],
            zeroline: false,
            showline: false,
            automargin: true,
            tickfont: { size: 11, color: '#334155' }
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent'
    };

    const config = { responsive: true, displayModeBar: false };

    Plotly.newPlot(containerId, [trace], layout, config);
}


export function renderClusterUMAP(plotId1, plotId2, clusters, dimensions) {
    // 1. Separate valid clusters from noise to count valid clusters accurately for palette scaling
    const validClusters = clusters.filter(c => String(c.cluster_id) !== '-1');

    const buildTraces = (xKey, yKey) => {
        return clusters.map((c) => {
            const isNoise = String(c.cluster_id) === '-1';
            const coords = c.umap_coordinates || {};

            let markerColor;
            if (isNoise) {
                markerColor = '#cbd5e1'; // Light grey for noise points
            } else {
                // Determine index among valid clusters to ensure smooth color palette mapping
                const validIdx = validClusters.findIndex(vc => String(vc.cluster_id) === String(c.cluster_id));
                const colorIdx = validIdx !== -1 ? validIdx : 0;
                markerColor = getD3Color(colorIdx, validClusters.length);
            }

            return {
                x: coords[xKey] || [],
                y: coords[yKey] || [],
                mode: 'markers',
                type: 'scatter',
                name: isNoise ? 'Noise' : `Cluster ${c.cluster_id}`,
                marker: { size: 8, color: markerColor, opacity: isNoise ? 0.5 : 0.85 }
            };
        });
    };

    const baseLayout = {
        margin: { l: 50, r: 20, t: 10, b: 50 },
        autosize: true,
        showlegend: false, // Legend removed
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent'
    };

    if (dimensions === 4) {
        Plotly.newPlot(
            plotId1, 
            buildTraces('UMAP_1', 'UMAP_2'), 
            { ...baseLayout, xaxis: { title: 'UMAP 1' }, yaxis: { title: 'UMAP 2' } }, 
            { responsive: true, displayModeBar: false }
        );
        Plotly.newPlot(
            plotId2, 
            buildTraces('UMAP_3', 'UMAP_4'), 
            { ...baseLayout, xaxis: { title: 'UMAP 3' }, yaxis: { title: 'UMAP 4' } }, 
            { responsive: true, displayModeBar: false }
        );
    } else {
        Plotly.newPlot(
            plotId1, 
            buildTraces('UMAP_1', 'UMAP_2'), 
            { ...baseLayout, xaxis: { title: 'UMAP 1' }, yaxis: { title: 'UMAP 2' } }, 
            { responsive: true, displayModeBar: false }
        );
    }
}

export function renderSingleClusterSymptomChart(containerId, cluster, clusterIndex, totalClusters) {
    const isFr = currentLang === 'fr';
    const symptoms = (cluster.archetypal_signatures || []).slice(0, 10);
    const labels = symptoms.map(s => getHpoLabel(s.hpo_code || s.hpoCode) || s.description);
    const wrappedLabels = labels.map(label => formatText(label, 15));
    const values = symptoms.map(s => s.prevalence_percent);
    const color = getD3Color(clusterIndex, totalClusters);

    const strokeColor = getD3Color(clusterIndex, totalClusters);
    const fillColor = hexToRgba(strokeColor, 0.45); // Semi-transparent fill

    const trace = {
        x: wrappedLabels,
        y: values,
        name: `Cluster ${cluster.cluster_id}`,
        type: 'bar',
        marker: { 
            color: fillColor,
            line: {
                color: strokeColor,
                width: 2
            },
            cornerradius: 6 // Rounded top corners
        }
    };

    const layout = {
        margin: { l: 50, r: 20, t: 15, b: 100 },
        autosize: true,
        showlegend: false,
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        yaxis: {
            title: isFr ? 'Prévalence (%)' : 'Prevalence (%)',
            range: [0, 105]
        },
        xaxis: { tickangle: -30, automargin: true }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true, displayModeBar: false });
}

export function renderGroupedClusterSymptomChart(containerId, cluster, clusterIndex, totalClusters) {
    const isFr = currentLang === 'fr';
    const allSymptoms = (cluster.archetypal_signatures || []).slice(0, 10);
    if (!allSymptoms.length) return;

    // Determine if we need to split into 2 subplots
    const splitNeeded = allSymptoms.length > 5;
    const midIndex = Math.ceil(allSymptoms.length / 2);
    
    // Divide symptoms: [[topChunk], [bottomChunk]] or [[allChunk]]
    const chunks = splitNeeded 
        ? [allSymptoms.slice(0, midIndex), allSymptoms.slice(midIndex)] 
        : [allSymptoms];

    // Adjust DOM container height first to ensure full 1:1 vertical scaling per subplot
    const containerEl = document.getElementById(containerId);
    if (containerEl) {
        const baseHeightPerPlot = 320; 
        containerEl.style.height = `${baseHeightPerPlot * chunks.length}px`;
    }

    // Extract cluster keys sorted as before
    const samplePrevalences = allSymptoms[0]?.cluster_prevalences || {};
    const rawClusterKeys = Object.keys(samplePrevalences);
    const clusterKeys = rawClusterKeys.sort((a, b) => {
        const numA = parseInt(a.replace(/[^\d-]/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/[^\d-]/g, ''), 10) || 0;
        if (numA === clusterIndex) return -1;
        if (numB === clusterIndex) return 1;
        return numA - numB;
    });

    const traces = [];

    // Loop over chunks to create top / bottom subplot traces
    chunks.forEach((chunkSymptoms, chunkIdx) => {
        const labels = chunkSymptoms.map(s => s.description || s.hpo_code);
        const wrappedLabels = labels.map(label => formatText(label, 15));
        
        // Plotly axis reference suffixes ('', '2', etc.)
        const axisSuffix = chunkIdx === 0 ? '' : `${chunkIdx + 1}`;
        const xAxisRef = `x${axisSuffix}`;
        const yAxisRef = `y${axisSuffix}`;

        clusterKeys.forEach((clusterKey) => {
            const originalClusterNum = parseInt(clusterKey.replace(/\D/g, ''), 10);
            const colorIdx = !isNaN(originalClusterNum) ? originalClusterNum : 0;
            const strokeColor = getD3Color(colorIdx, totalClusters || clusterKeys.length);
            const fillColor = hexToRgba(strokeColor, 0.45);

            const values = chunkSymptoms.map(s => (s.cluster_prevalences ? s.cluster_prevalences[clusterKey] || 0 : 0));
            const formattedName = clusterKey.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

            const textPositions = values.map(v => (v < 10 ? 'outside' : 'inside'));
            const fontColors = values.map(v => (v < 10 ? '#1e293b' : '#ffffff'));

            traces.push({
                x: wrappedLabels,
                y: values,
                name: formattedName,
                type: 'bar',
                xaxis: xAxisRef,
                yaxis: yAxisRef,
                text: values.map(v => `${Math.round(v)}%`),
                textposition: textPositions,
                insidetextanchor: 'end',
                showlegend: false,
                textfont: {
                    color: fontColors,
                    size: 11,
                    weight: 500
                },
                marker: { 
                    color: fillColor,
                    line: { color: strokeColor, width: 2 },
                    cornerradius: 4
                }
            });
        });
    });
    // Pre-calculate wrapped labels for both chunks to feed the layout
    const labelsTop = chunks[0].map(s => formatText(getHpoLabel(s.hpo_code || s.hpoCode) || s.description, 15));
    const labelsBottom = splitNeeded ? chunks[1].map(s => formatText(getHpoLabel(s.hpo_code || s.hpoCode) || s.description, 15)) : [];

    // Layout configuration
    const layout = {
        barmode: 'group',
        margin: { l: 50, r: 20, t: 30, b: 80 },
        autosize: true,
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent'
    };

    if (splitNeeded) {
        layout.grid = { 
            rows: 2, 
            columns: 1, 
            pattern: 'independent', 
            roworder: 'top to bottom',
            ygap: 0.25 
        };
        
        layout.yaxis = { title: isFr ? 'Prévalence (%)' : 'Prevalence (%)', range: [0, 105] };
        layout.yaxis2 = { title: isFr ? 'Prévalence (%)' : 'Prevalence (%)', range: [0, 105] };
        
        layout.xaxis = { 
            type: 'category',
            categoryorder: 'array',
            categoryarray: labelsTop,
            tickangle: 0, 
            automargin: true 
        };
        layout.xaxis2 = { 
            type: 'category',
            categoryorder: 'array',
            categoryarray: labelsBottom,
            tickangle: 0, 
            automargin: true 
        };
    } else {
        layout.yaxis = { title: isFr ? 'Prévalence (%)' : 'Prevalence (%)', range: [0, 105] };
        layout.xaxis = { 
            type: 'category',
            categoryorder: 'array',
            categoryarray: labelsTop,
            tickangle: 0, 
            automargin: true 
        };
    }

    Plotly.newPlot(containerId, traces, layout, { responsive: true, displayModeBar: false });
}

export function renderAssociatedSignaturesChart(containerId, associatedData, clusterIndex, totalClusters, isFr) {
    if (!associatedData || !associatedData.length) return;

    const items = [...associatedData].reverse();

    const yCategories = items.map(item => {
        const rawLabel = getHpoLabel(item.hpo_code || item.hpoCode || item.hpo_id) || item.description;
        return typeof formatText === 'function' 
            ? formatText(item.description, 30) 
            : item.description;
    });

    const clusterValues = items.map(item => parseFloat(String(item.cluster_prevalence).replace('%', '')) || 0);
    const restValues = items.map(item => parseFloat(String(item.rest_cohort_prevalence).replace('%', '')) || 0);

    const clusterStrokeColor = getD3Color(clusterIndex, totalClusters);
    const clusterFillColor = hexToRgba(clusterStrokeColor, 0.45);

    const restStrokeColor = '#94a3b8';
    const restFillColor = hexToRgba(restStrokeColor, 0.35);

    const barHeight = 0.35;
    const offset = 0.20;

    const shapes = [];
    const annotations = [];

    items.forEach((item, i) => {
        const yCenter = i;

        const seriesData = [
            { val: clusterValues[i], yMid: yCenter + offset, stroke: clusterStrokeColor, fill: clusterFillColor },
            { val: restValues[i], yMid: yCenter - offset, stroke: restStrokeColor, fill: restFillColor }
        ];

        seriesData.forEach(series => {
            const val = series.val;
            const yMin = series.yMid - barHeight / 2;
            const yMax = series.yMid + barHeight / 2;
            const xMin = 0;
            const xMax = val;

            if (xMax > 0) {
                const rx = Math.min(1.5, xMax * 0.1);

                const path = `M ${xMin},${yMin} ` +
                             `L ${xMax - rx},${yMin} ` +
                             `Q ${xMax},${yMin} ${xMax},${series.yMid} ` +
                             `Q ${xMax},${yMax} ${xMax - rx},${yMax} ` +
                             `L ${xMin},${yMax} Z`;

                shapes.push({
                    type: 'path',
                    path: path,
                    fillcolor: series.fill,
                    line: { color: series.stroke, width: 2 },
                    xref: 'x',
                    yref: 'y'
                });
            }

            // Position label outside to the right if <= 10% (including 0%), otherwise inside to the left
            const isOutside = val <= 10;

            annotations.push({
                x: val,
                y: series.yMid,
                text: `${val}%`,
                xanchor: isOutside ? 'left' : 'right',
                yanchor: 'middle',
                xshift: isOutside ? 6 : -6,
                showarrow: false,
                font: {
                    family: 'sans-serif',
                    size: 10,
                    color: isOutside ? '#475569' : '#334155',
                    weight: 600
                }
            });
        });

        // P-Value Annotation placed after the highest extending label/bar of the pair
        const maxVal = Math.max(clusterValues[i], restValues[i]);
        // Shift p-value extra to the right if the max value bar has an outside label
        const pValueShift = maxVal <= 10 ? 38 : 12;

        const pValText = String(item.p_value || '').startsWith('<') 
            ? `p ${item.p_value}` 
            : `p = ${item.p_value}`;

        annotations.push({
            x: maxVal,
            y: yCenter,
            text: pValText,
            xanchor: 'left',
            yanchor: 'middle',
            xshift: pValueShift,
            showarrow: false,
            font: {
                family: 'sans-serif',
                size: 10,
                color: '#64748b',
                style: 'italic',
                weight: 500
            }
        });
    });

    shapes.push({
        type: 'line',
        x0: 0,
        x1: 0,
        y0: -0.5,
        y1: items.length - 0.5,
        line: { color: '#1f1f1f', width: 2 },
        xref: 'x',
        yref: 'y'
    });

    const tickVals = items.map((_, i) => i);

    const trace = {
        x: clusterValues,
        y: tickVals,
        type: 'scatter',
        mode: 'markers',
        marker: { opacity: 0 },
        hoverinfo: 'text',
        hovertext: items.map(item => 
            `<b>${item.description}</b><br>` +
            `${isFr ? 'Prévalence Cluster' : 'Cluster Prevalence'}: ${item.cluster_prevalence}<br>` +
            `${isFr ? 'Prévalence Reste Cohorte' : 'Rest Cohort Prevalence'}: ${item.rest_cohort_prevalence}<br>` +
            `p-value: ${item.p_value}`
        )
    };

    const layout = {
        autosize: true,
        margin: { l: 220, r: 80, t: 30, b: 40 },
        shapes: shapes,
        annotations: annotations,
        showlegend: false,
        xaxis: {
            title: { text: isFr ? 'Prévalence (%)' : 'Prevalence (%)', font: { size: 12, color: '#334155' } },
            range: [0, 120],
            zeroline: false,
            showline: false,
            gridcolor: '#e2e8f0'
        },
        yaxis: {
            tickmode: 'array',
            tickvals: tickVals,
            ticktext: yCategories,
            range: [-0.6, items.length - 0.4],
            zeroline: false,
            showline: false,
            automargin: true,
            tickfont: { size: 11, color: '#334155' }
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent'
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true, displayModeBar: false });
}
