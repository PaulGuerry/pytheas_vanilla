### 1. WEBSITE LAYOUT & ARCHITECTURE GUARDRAIL
* **Layout Structure:**
  - Single-file implementation (`index.html`) using raw HTML, CSS, JavaScript, and Plotly.js.
  - Fixed centered header displaying the PYTHEAS logo (`top-header`).
  - Header language switcher (`lang-switcher`) floating on the right side containing interactive language buttons (`EN` | `FR`) to dynamically toggle UI translations.
  - Centered dialogue stream window (`chat-stream`, max-width 900px) with user speech bubbles (`user-bubble`) on the right and AI card elements (`ai-card`) on the left.
  - Floating/inline bottom input box with a rounded chat field and send button.
  - Fixed compact footer (`site-footer`) displaying Contact email, Citation details, and Sponsor links.
* **Component Presentation:**
  - AI response cards must contain the dataset summary table (with styled D3 color swatches) stacked directly above the Plotly chart container.
  - Exact Key Match Precedence: Standard input matching MUST evaluate exact string matches (case-insensitive) across all disease index keys before invoking fuzzy string matching algorithms (e.g., Levenshtein distance).
  - Subtype Preservation: Explicit numbered subtypes (e.g., `THES1`, `THES2`) MUST NOT be auto-corrected or mapped to base terms (`THES`) if the subtype exists as a primary key in `diseasesIndex`.
* **Multilingual & i18n Guardrails:**
  - All static interface text, chart labels, axis titles, and table headers must dynamically adjust based on the selected language state (`currentLang = 'en' | 'fr'`) using an internal dictionary object.
  - Query routing (`parseAndRoute`) must handle input keywords, disease synonyms, lab markers, and subgroup identifiers in both English and French.


### 2. BAR CHART STYLING GUARDRAIL (`renderTopRoundedBarChart`)
* **Custom Path Geometry:** Bars must be rendered using Plotly `layout.shapes` (SVG paths) to construct custom top-rounded corners (`Q` quadratic bezier curves) with flat bottom edges resting on a solid dark baseline (`#1f1f1f` line).
  - Single-Series Charts: Render using `renderTopRoundedBarChart` with custom SVG shapes (`Q` quadratic path curves) and inside-bar annotations.
  - Grouped/Multi-Series Charts: All grouped bar traces (`type: 'bar'`) rendered via `renderGroupedBarChart` MUST specify a top corner radius (`marker.cornerradius >= 6`) to enforce consistent UI rounded aesthetics across all variable types (including zygosity, variant types, and treatments).

* **Color Scheme:**
  - Distinct D3 Category palette stroke lines (`width: 2`).
  - Semi-transparent matching fill colors generated via RGBA with `~0.45` alpha opacity (e.g., `#1f77b4` outline with `rgba(31, 119, 180, 0.45)` fill).
* **Text Value Labels:**
  - Display numerical values directly **inside** the top of each bar.
  - Positioned using Plotly annotations anchored at `yshift: -22` relative to the bar's top edge.
  - Formatted in medium dark-gray text (`#4b5563`, `font-size: 12`, `font-weight: 500`).


### 3. FALLBACK
* **Email contact.pytheasdb@gmail.com:** Any unmatched query must display a localized error box and generate a pre-filled mailto link to contact.pytheasdb@gmail.com in the user's active language. 


### 4. DATA EXTRACTION
* Sex counts MUST be extracted from subgroups.sex, not phenotype_frequencies.
* Sex ratios should be shown as the ratio of boys/girls, rounded to 2 decimal places.


### 5. RANDOM FEATURE & EXAMPLE ROUTER GUARDRAIL

* **Trigger Matching:**
  * Inputs matching exact keywords (case-insensitive): `["random", "example", "exemple", "aléatoire", "aleatoire", "?"]` must trigger the **Random Comparison Generator**.
* **Random Sampling Behavior:**
  * Must randomly sample **two distinct dataset keys** (either two different diseases or two subgroups/genes) from `diseasesIndex`.
  * Must randomly sample one valid variable type (e.g., `survival`, `cadd_scores`, `sex_ratio`, `variant_types`, `age_first_symptoms`).
* **Deterministic Query Resolution & History Push:**
  * The router must return a `resolvedQuery` property containing the explicit string format: `"<variable> <DatasetA> vs <DatasetB>"`.
  * The standard submission workflow (`submitQuery`) **must** update the `queryHistory` array using `resolvedQuery` rather than the raw trigger word (`"random"`/`"example"`), allowing the user to navigate back to the generated comparison via arrow keys.


