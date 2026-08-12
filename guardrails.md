### 1. WEBSITE LAYOUT & ARCHITECTURE GUARDRAIL
* **Layout Structure:**
  - Single-file implementation (`index.html`) using raw HTML, CSS, JavaScript, and Plotly.js[cite: 12].
  - Fixed centered header displaying the PYTHEAS logo (`top-header`)[cite: 12].
  - Header language switcher (`lang-switcher`) floating on the right side containing interactive language buttons (`EN` | `FR`) to dynamically toggle UI translations[cite: 12].
  - Centered dialogue stream window (`chat-stream`, max-width 900px) with user speech bubbles (`user-bubble`) on the right and AI card elements (`ai-card`) on the left[cite: 12].
  - Floating/inline bottom input box with a rounded chat field and send button[cite: 12].
  - Fixed compact footer (`site-footer`) displaying Contact email, Citation details, and Sponsor links[cite: 12].
* **Component Presentation:**
  - AI response cards must contain the dataset summary table (with styled D3 color swatches) stacked directly above the Plotly chart container[cite: 12].
* **Multilingual & i18n Guardrails:**
  - All static interface text, chart labels, axis titles, and table headers must dynamically adjust based on the selected language state (`currentLang = 'en' | 'fr'`) using an internal dictionary object[cite: 12].
  - Query routing (`parseAndRoute`) must handle input keywords, disease synonyms, lab markers, and subgroup identifiers in both English and French[cite: 12].


### 2. BAR CHART STYLING GUARDRAIL (`renderTopRoundedBarChart`)
* **Custom Path Geometry:** Bars must be rendered using Plotly `layout.shapes` (SVG paths) to construct custom top-rounded corners (`Q` quadratic bezier curves) with flat bottom edges resting on a solid dark baseline (`#1f1f1f` line)[cite: 12].
* **Color Scheme:**
  - Distinct D3 Category palette stroke lines (`width: 2`)[cite: 12].
  - Semi-transparent matching fill colors generated via RGBA with `~0.45` alpha opacity (e.g., `#1f77b4` outline with `rgba(31, 119, 180, 0.45)` fill)[cite: 12].
* **Text Value Labels:**
  - Display numerical values directly **inside** the top of each bar[cite: 12].
  - Positioned using Plotly annotations anchored at `yshift: -22` relative to the bar's top edge[cite: 12].
  - Formatted in medium dark-gray text (`#4b5563`, `font-size: 12`, `font-weight: 500`)[cite: 12].


### 3. FALLBACK
* **Email contact.pytheasdb@gmail.com:** Any unmatched query must display a localized error box and generate a pre-filled mailto link to contact.pytheasdb@gmail.com in the user's active language[cite: 12]. 


### 4. DATA EXTRACTION
* Sex counts MUST be extracted from subgroups.sex, not phenotype_frequencies[cite: 12].
* Sex ratios should be shown as the ratio of boys/girls, rounded to 2 decimal places[cite: 12].

