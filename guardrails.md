
### 1. WEBSITE LAYOUT & ARCHITECTURE GUARDRAIL
* **Layout Structure:**
  - Single-file implementation (`index.html`) using raw HTML, CSS, JavaScript, and Plotly.js.
  - Fixed centered header displaying the PYTHEAS logo (`top-header`).
  - Centered dialogue stream window (`chat-stream`, max-width 900px) with user speech bubbles (`user-bubble`) on the right and AI card elements (`ai-card`) on the left.
  - Floating/inline bottom input box with a rounded chat field and send button.
  - Fixed compact footer (`site-footer`) displaying Contact email, Citation details, and Sponsor links.
* **Component Presentation:**
  - AI response cards must contain the dataset summary table (with styled D3 color swatches) stacked directly above the Plotly chart container.


### 2. BAR CHART STYLING GUARDRAIL (`renderTopRoundedBarChart`)
* **Custom Path Geometry:** Bars must be rendered using Plotly `layout.shapes` (SVG paths) to construct custom top-rounded corners (`Q` quadratic bezier curves) with flat bottom edges resting on a solid dark baseline (`#1f1f1f` line).
* **Color Scheme:**
  - Distinct D3 Category palette stroke lines (`width: 2`).
  - Semi-transparent matching fill colors generated via RGBA with `~0.45` alpha opacity (e.g., `#1f77b4` outline with `rgba(31, 119, 180, 0.45)` fill).
* **Text Value Labels:**
  - Display numerical values directly **inside** the top of each bar.
  - Positioned using Plotly annotations anchored at `yshift: -22` relative to the bar's top edge.
  - Formatted in medium dark-gray text (`#4b5563`, `font-size: 12`, `font-weight: 500`).


### 3. FALBACK
* **Email contact.pytheasdb.gmail.com:** Any unmatched query must display an error box and generate a pre-filled mailto link to contact.pytheasdb@gmail.com. 


### 4. Data Extraction

* Sex counts MUST be extracted from subgroups.sex, not phenotype_frequencies
* Sex ratios should be shown as the ratio of boys/girls, rounded to 2 decimal places
