import { setLanguage } from './i18n.js';
import { initData } from './api.js';
import { renderClusterCard } from './modules/chartRenderer.js';
import { submitQuery, getQueryState, setQueryState } from './modules/chatUI.js';

window.setLanguage = setLanguage;
window.submitQuery = submitQuery;
window.renderClusterCard = renderClusterCard;

window.addEventListener('DOMContentLoaded', async () => {
  await initData();

  const queryInput = document.getElementById('queryInput');
  if (queryInput) {
    queryInput.addEventListener('keydown', (e) => {
      let { queryHistory, historyIndex, currentDraft } = getQueryState();

      if (e.key === 'Enter') {
        submitQuery();
      } else if (e.key === 'ArrowUp') {
        if (queryHistory.length === 0) return;

        if (historyIndex === queryHistory.length) {
          currentDraft = queryInput.value;
        }

        if (historyIndex > 0) {
          historyIndex--;
          queryInput.value = queryHistory[historyIndex];

          setTimeout(() => {
            queryInput.selectionStart = queryInput.selectionEnd = queryInput.value.length;
          }, 0);
        }
        setQueryState({ historyIndex, currentDraft });
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        if (queryHistory.length === 0) return;

        if (historyIndex < queryHistory.length - 1) {
          historyIndex++;
          queryInput.value = queryHistory[historyIndex];
        } else if (historyIndex === queryHistory.length - 1) {
          historyIndex = queryHistory.length;
          queryInput.value = currentDraft;
        }
        setQueryState({ historyIndex });
        e.preventDefault();
      }
    });
  }
});
