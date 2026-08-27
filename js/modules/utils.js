import { ABBREVIATIONS, REMOVAL_WORDS } from '../constants.js';
import { hpoDescriptors } from '../api.js';

export function getLevenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

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

export function escapeRegExp(string) {
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

export function normalizeQueryTypos(norm) {
  if (!norm) return '';
  return norm
    .replace(/\bp[fi]+c\s*(\d+)\b/gi, 'pfic$1')
    .replace(/\bpfic\s*10\b/gi, 'pfic10');
}


export function parseHpo(codeInput) {
  const digits = String(codeInput).replace(/\D/g, "").padStart(7, "0");
  return { fullCode: `HP:${digits}`, digits };
}

export function loadHpoDescriptor(descriptors, targetDigits) {
  if (!descriptors) return "Unknown Descriptor";
  
  if (Array.isArray(descriptors)) {
    for (const item of descriptors) {
      const itemCode = item.id || item.hpo_code || "";
      const { digits } = parseHpo(itemCode);
      if (digits === targetDigits) {
        return item.name || item.descriptor || "Unknown Descriptor";
      }
    }
  } else if (typeof descriptors === "object") {
    for (const [key, val] of Object.entries(descriptors)) {
      const { digits } = parseHpo(key);
      if (digits === targetDigits) {
        return typeof val === "string" ? val : (val?.name || "Unknown Descriptor");
      }
    }
  }
  return "Unknown Descriptor";
}
