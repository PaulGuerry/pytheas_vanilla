import { loadLexicon } from './api.js';


/**
 * Debounce helper to prevent excessive tokenization on fast keypresses
 */
export function debounce(func, delay = 200) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func(...args), delay);
    };
}

// Entity categorization lists
const VARIABLE_PATTERNS = [
    'survival', 'cadd_scores', 'sex_ratio', 'variant_types', 
    'zygosity', 'age_first_symptoms', 'birth_weight', 'birth_height', 
    'longitudinal', 'treatments'
];

const SUBGROUP_PATTERNS = [
    'boys', 'boy', 'girls', 'girl', 'males', 'male', 'females', 'female',
    'garçons', 'garcons', 'filles', 'fille', 'homozygous', 'compound', 
    'heterozygous', 'high', 'moderate', 'low'
];

const KNOWN_GENES = [
    'atp8b1', 'abcb11', 'abc4', 'abcb4', 'tjp2', 'nr1h4', 'myo5b', 'vsp33b', 'vipas39'
];

/**
 * Initializes live pill tokenization on a target input element
 * @param {HTMLInputElement} inputEl - Search input element
 * @param {HTMLElement} containerEl - Container element to render pills into
 * @param {Function} [onQueryUpdate] - Optional callback triggered after a pill is removed
 */
export function initPillTokenizer(inputEl, containerEl, onQueryUpdate) {
    if (!inputEl || !containerEl) return;

    const updatePills = async () => {
        const query = inputEl.value;
        if (!query.trim()) {
            containerEl.innerHTML = '';
            return;
        }

        const tokens = await extractPillTokens(query);
        renderPills(tokens, containerEl, inputEl, updatePills, onQueryUpdate);
    };

    const debouncedUpdate = debounce(updatePills, 200);

    inputEl.addEventListener('input', debouncedUpdate);
    
    // Initial evaluation
    updatePills();
}

/**
 * Extracts recognized entities from query and maps them to pill types
 */
async function extractPillTokens(query) {
    const tokens = [];
    const seenTerms = new Set();
    const lexicon = await loadLexicon(); // Assuming loadLexicon() is available in your scope

    // 1. Variable Pills
    VARIABLE_PATTERNS.forEach(varTerm => {
        const reg = new RegExp(`\\b${escapeRegExp(varTerm)}\\b`, 'gi');
        const match = query.match(reg);
        if (match && !seenTerms.has(varTerm.toLowerCase())) {
            seenTerms.add(varTerm.toLowerCase());
            tokens.push({ text: match[0], raw: match[0], type: 'variable' });
        }
    });

    // 2. Dynamic Subgroup Pills from Lexicon & Aliases
    if (lexicon && lexicon.subgroups) {
        const subgroupEntries = [];

        // Build a comprehensive map of search terms -> normalized primary key
        // e.g. "boys" -> "M", "girls" -> "F", "homozygous" -> "homozygous"
        for (const [category, values] of Object.entries(lexicon.subgroups)) {
            values.forEach(val => {
                subgroupEntries.push({ term: val.toLowerCase(), canonical: val.toUpperCase() });
            });
        }

        if (lexicon.aliases) {
            for (const [category, aliasMap] of Object.entries(lexicon.aliases)) {
                for (const [alias, canonicalVal] of Object.entries(aliasMap)) {
                    subgroupEntries.push({ term: alias.toLowerCase(), canonical: canonicalVal.toUpperCase() });
                }
            }
        }

        // Sort terms by length descending to match multi-word phrases first (e.g. "compound heterozygous")
        subgroupEntries.sort((a, b) => b.term.length - a.term.length);

        subgroupEntries.forEach(({ term, canonical }) => {
            const reg = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi');
            const match = query.match(reg);
            if (match && !seenTerms.has(term)) {
                seenTerms.add(term);
                tokens.push({ text: canonical, raw: match[0], type: 'subgroup' });
            }
        });
    }

    // 3. Green Pills: Genes (fallback to KNOWN_GENES or lexicon.genes)
    const geneList = (lexicon && lexicon.genes) ? lexicon.genes : KNOWN_GENES;
    geneList.forEach(gene => {
        const reg = new RegExp(`\\b${escapeRegExp(gene)}\\b`, 'gi');
        const match = query.match(reg);
        if (match && !seenTerms.has(gene.toLowerCase())) {
            seenTerms.add(gene.toLowerCase());
            tokens.push({ text: match[0].toUpperCase(), raw: match[0], type: 'gene' });
        }
    });

    // 4. Blue Pills: Diseases (fallback to lexicon.diseases or regex)
    const diseaseList = (lexicon && lexicon.diseases) ? lexicon.diseases : [];
    if (diseaseList.length > 0) {
        // Sort diseases by length descending to match multi-word names first
        const sortedDiseases = [...diseaseList].sort((a, b) => b.length - a.length);
        sortedDiseases.forEach(dis => {
            const reg = new RegExp(`\\b${escapeRegExp(dis)}\\b`, 'gi');
            const match = query.match(reg);
            if (match && !seenTerms.has(dis.toLowerCase())) {
                seenTerms.add(dis.toLowerCase());
                tokens.push({ text: match[0].toUpperCase(), raw: match[0], type: 'disease' });
            }
        });
    } else {
        const diseaseRegex = /\b(pfic\s*\d*|byler\s*disease|progressive\s*familial\s*intrahepatic\s*cholestasis)\b/gi;
        const diseaseMatches = query.match(diseaseRegex);
        if (diseaseMatches) {
            diseaseMatches.forEach(dm => {
                const key = dm.toLowerCase().trim();
                if (!seenTerms.has(key)) {
                    seenTerms.add(key);
                    tokens.push({ text: dm.toUpperCase(), raw: dm, type: 'disease' });
                }
            });
        }
    }

    return tokens;
}

/**
 * Renders HTML pill elements with interactive remove buttons
 */
function renderPills(tokens, containerEl, inputEl, refreshFn, onQueryUpdate) {
    containerEl.innerHTML = '';

    tokens.forEach(token => {
        const pill = document.createElement('span');
        pill.className = `pill pill-${token.type}`;
        pill.innerHTML = `
            <span class="pill-label">${escapeHtml(token.text)}</span>
            <button type="button" class="pill-remove" aria-label="Remove ${token.text}">&times;</button>
        `;

        pill.querySelector('.pill-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeTokenFromInput(inputEl, token.raw);
            refreshFn();
            if (typeof onQueryUpdate === 'function') {
                onQueryUpdate(inputEl.value);
            }
        });

        containerEl.appendChild(pill);
    });
}

/**
 * Removes a raw entity token from the active search query string
 */
function removeTokenFromInput(inputEl, rawToken) {
    const regex = new RegExp(`\\b${escapeRegExp(rawToken)}\\b\\s*`, 'gi');
    inputEl.value = inputEl.value.replace(regex, '').replace(/\s+/g, ' ').trim();
    
    // Dispatch input event so other listeners stay in sync
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}





