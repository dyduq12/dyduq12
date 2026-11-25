/**
 * "Colar da IA" UI panel: prompt copy (with iOS-friendly manual fallback),
 * block parsing, read-only card preview, optional cover/metadata search, and form pre-fill.
 * The AI scores 4 criteria; the overall score (Nota Geral) is computed automatically as their mean.
 */

import { mergeAiWithApi } from '../ai/import-merge.js';
import { parseAiImport } from '../ai/parser.js';
import { buildAiPromptTemplate } from '../ai/prompt-template.js';
import { createCoverPreviewUrl, fetchAndStoreCover } from '../media/cover.js';
import { createWorkCard } from './card.js';
import { formatUserError, presentErrorToast } from './errors.js';

const TYPE_LABELS = {
  game: 'Jogo',
  movie: 'Filme',
  series: 'Série',
  anime: 'Anime'
};

function formatGeral(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1).replace('.', ',') : '';
}

function renderMessagesList(ulEl, messages) {
  ulEl.replaceChildren();
  ulEl.hidden = messages.length === 0;
  for (const msg of messages) {
    const li = document.createElement('li');
    li.textContent = msg;
    ulEl.appendChild(li);
  }
}

/**
 * Mounts the "Colar da IA" panel inside `container`.
 * @param {HTMLElement} container
 * @param {{
 *   db: ReturnType<import('../core/db.js').createDatabase>,
 *   searchService: ReturnType<import('../api/search.js').createSearchService>,
 *   toast: ReturnType<import('./toast.js').createToaster>,
 *   onApplyToForm: (work: Record<string, any>, meta: { filledFromApi: string[] }) => Promise<void> | void
 * }} deps
 */
export function mountAiImportPanel(container, deps) {
  let currentParsed = null;
  let previewCoverUrl = null;
  let activePreviewCard = null;

  container.replaceChildren();
  container.className = 'canon-ai-panel';

  const heading = document.createElement('h2');
  heading.className = 'canon-panel-title';
  heading.textContent = 'Colar da IA';

  const intro = document.createElement('p');
  intro.className = 'canon-brand-subtitle';
  intro.textContent =
    'Copie o prompt, cole a resposta da IA e revise a prévia. A IA avalia 4 critérios (História, Gameplay/Ritmo, Gráficos/Fotografia e Trilha Sonora) e a Nota Geral é calculada automaticamente pela média.';

  // --- COPY PROMPT + FALLBACK TEXTAREA ---
  const copyRow = document.createElement('div');
  copyRow.className = 'canon-form-actions';

  const copyPromptBtn = document.createElement('button');
  copyPromptBtn.type = 'button';
  copyPromptBtn.textContent = 'Copiar prompt';
  copyPromptBtn.setAttribute('aria-expanded', 'false');
  copyPromptBtn.setAttribute('aria-controls', 'ai-prompt-fallback-box');

  const hideFallbackBtn = document.createElement('button');
  hideFallbackBtn.type = 'button';
  hideFallbackBtn.textContent = 'Fechar texto do prompt';
  hideFallbackBtn.hidden = true;

  copyRow.append(copyPromptBtn, hideFallbackBtn);

  const fallbackWrap = document.createElement('div');
  fallbackWrap.id = 'ai-prompt-fallback-box';
  fallbackWrap.className = 'canon-field';
  fallbackWrap.hidden = true;

  const fallbackLabel = document.createElement('label');
  fallbackLabel.htmlFor = 'ai-prompt-fallback';
  fallbackLabel.textContent = 'Copie manualmente o prompt selecionado abaixo:';

  const fallbackTextarea = document.createElement('textarea');
  fallbackTextarea.id = 'ai-prompt-fallback';
  fallbackTextarea.readOnly = true;
  fallbackTextarea.rows = 6;
  fallbackWrap.append(fallbackLabel, fallbackTextarea);

  // --- PASTE INPUT + PARSE ---
  const pasteField = document.createElement('div');
  pasteField.className = 'canon-field';

  const pasteLabel = document.createElement('label');
  pasteLabel.htmlFor = 'ai-paste-input';
  pasteLabel.textContent = 'Resposta da IA';

  const pasteTextarea = document.createElement('textarea');
  pasteTextarea.id = 'ai-paste-input';
  pasteTextarea.rows = 6;
  pasteTextarea.placeholder = 'Cole aqui a resposta da IA…';

  pasteField.append(pasteLabel, pasteTextarea);

  const parseRow = document.createElement('div');
  parseRow.className = 'canon-form-actions';

  const parseBtn = document.createElement('button');
  parseBtn.type = 'button';
  parseBtn.dataset.variant = 'primary';
  parseBtn.textContent = 'Ler resposta';

  const clearPasteBtn = document.createElement('button');
  clearPasteBtn.type = 'button';
  clearPasteBtn.textContent = 'Limpar';

  parseRow.append(parseBtn, clearPasteBtn);

  // --- ERRORS & WARNINGS ---
  const errorsList = document.createElement('ul');
  errorsList.className = 'canon-ai-error-list';
  errorsList.setAttribute('role', 'alert');
  errorsList.hidden = true;

  const warningsList = document.createElement('ul');
  warningsList.className = 'canon-ai-warning-list';
  warningsList.setAttribute('role', 'status');
  warningsList.hidden = true;

  // --- PREVIEW & METADATA ENRICHMENT ---
  const previewBox = document.createElement('div');
  previewBox.className = 'canon-ai-preview-box';
  previewBox.hidden = true;

  const previewTitle = document.createElement('h3');
  previewTitle.className = 'canon-panel-title';
  previewTitle.textContent = 'Prévia';

  const previewGrid = document.createElement('div');
  previewGrid.className = 'canon-ai-preview-grid';

  const previewCardList = document.createElement('ul');
  previewCardList.className = 'canon-ai-preview-list';

  previewGrid.append(previewCardList);

  const previewNote = document.createElement('p');
  previewNote.className = 'canon-brand-subtitle';

  const metaActions = document.createElement('div');
  metaActions.className = 'canon-form-actions';

  const fetchMetaBtn = document.createElement('button');
  fetchMetaBtn.type = 'button';
  fetchMetaBtn.textContent = 'Buscar capa e dados';

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.dataset.variant = 'primary';
  applyBtn.textContent = 'Aplicar ao formulário';

  metaActions.append(fetchMetaBtn, applyBtn);

  const metaStatus = document.createElement('p');
  metaStatus.className = 'canon-brand-subtitle';
  metaStatus.setAttribute('role', 'status');

  const metaResultsList = document.createElement('ul');
  metaResultsList.className = 'canon-results-list';

  previewBox.append(previewTitle, previewGrid, previewNote, metaActions, metaStatus, metaResultsList);

  container.append(
    heading,
    intro,
    copyRow,
    fallbackWrap,
    pasteField,
    parseRow,
    errorsList,
    warningsList,
    previewBox
  );

  function revokePreviewCover() {
    if (previewCoverUrl) {
      URL.revokeObjectURL(previewCoverUrl);
      previewCoverUrl = null;
    }
  }

  function describePreviewNote(work, missingCount) {
    const parts = [];
    const geral = formatGeral(work?.scores?.geral);
    if (geral) {
      parts.push(`Nota Geral ${geral} (média dos 4 critérios)`);
    }
    if (missingCount > 0) {
      parts.push(`${missingCount} campo(s) sem dados; busque capa e dados para completar`);
    }
    return parts.join(' · ');
  }

  async function renderPreview(work, missingCount = 0) {
    activePreviewCard?.destroy?.();
    activePreviewCard = null;
    revokePreviewCover();
    previewCardList.replaceChildren();

    if (work.cover) {
      previewCoverUrl = await createCoverPreviewUrl(deps.db, work.cover);
    }

    const card = createWorkCard(work, {
      readOnly: true,
      coverObjectUrl: previewCoverUrl
    });
    activePreviewCard = card;
    previewCardList.appendChild(card);
    previewNote.textContent = describePreviewNote(work, missingCount);
    previewBox.hidden = false;
  }

  function openManualPromptFallback(promptText) {
    fallbackTextarea.value = promptText;
    fallbackWrap.hidden = false;
    hideFallbackBtn.hidden = false;
    copyPromptBtn.setAttribute('aria-expanded', 'true');
    fallbackTextarea.focus();
    fallbackTextarea.select();
    if (typeof fallbackTextarea.setSelectionRange === 'function') {
      fallbackTextarea.setSelectionRange(0, promptText.length);
    }
    deps.toast.info('Copie manualmente o prompt selecionado.');
  }

  copyPromptBtn.addEventListener('click', async () => {
    const promptText = buildAiPromptTemplate();
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(promptText);
        deps.toast.success('Prompt copiado.');
        return;
      } catch (err) {
        console.warn('[ai-import] Clipboard falhou; abrindo fallback manual:', { message: err?.message });
        openManualPromptFallback(promptText);
        return;
      }
    }
    openManualPromptFallback(promptText);
  });

  hideFallbackBtn.addEventListener('click', () => {
    fallbackWrap.hidden = true;
    hideFallbackBtn.hidden = true;
    copyPromptBtn.setAttribute('aria-expanded', 'false');
  });

  clearPasteBtn.addEventListener('click', () => {
    currentParsed = null;
    activePreviewCard?.destroy?.();
    activePreviewCard = null;
    revokePreviewCover();
    pasteTextarea.value = '';
    renderMessagesList(errorsList, []);
    renderMessagesList(warningsList, []);
    previewNote.textContent = '';
    metaStatus.textContent = '';
    metaResultsList.replaceChildren();
    previewBox.hidden = true;
  });

  parseBtn.addEventListener('click', async () => {
    metaStatus.textContent = '';
    metaResultsList.replaceChildren();

    try {
      const parsed = parseAiImport(pasteTextarea.value);
      renderMessagesList(
        errorsList,
        parsed.errors.map((e) => `${e.field}: ${e.message}`)
      );
      renderMessagesList(warningsList, parsed.warnings);

      if (!parsed.ok || !parsed.work) {
        currentParsed = null;
        previewBox.hidden = true;
        deps.toast.error('Não foi possível importar a resposta. Veja os erros listados.');
        return;
      }

      currentParsed = parsed;
      await renderPreview(parsed.work, parsed.emptyFields.length);
      deps.toast.success('Resposta validada! Revise a prévia, busque a capa ou aplique ao formulário.');
    } catch (err) {
      presentErrorToast(deps.toast, err, { context: 'Ler resposta da IA' });
    }
  });

  fetchMetaBtn.addEventListener('click', async () => {
    if (!currentParsed?.work) {
      return;
    }
    metaResultsList.replaceChildren();
    metaStatus.textContent = `Buscando "${currentParsed.work.title}"...`;

    const response = await deps.searchService.search(
      currentParsed.work.title,
      currentParsed.work.type,
      { immediate: true }
    );

    if (!response.ok) {
      const formatted = formatUserError(response.error, {
        provider:
          currentParsed.work.type === 'game'
            ? 'rawg'
            : currentParsed.work.type === 'anime'
              ? 'anilist'
              : 'tmdb'
      });
      const msg = formatted.message || response.error?.message || 'Busca indisponível no momento.';
      metaStatus.textContent = `${msg} Suas notas foram preservadas; use "Aplicar ao formulário".`;
      deps.toast.warning(`${msg} Notas preservadas.`);
      return;
    }

    if (!response.results || response.results.length === 0) {
      metaStatus.textContent = 'Nada encontrado nas APIs. Suas notas foram preservadas.';
      return;
    }

    metaStatus.textContent = `${response.results.length} resultado(s). Escolha um para mesclar:`;
    for (const item of response.results) {
      const li = document.createElement('li');
      li.className = 'canon-result-item';

      const text = document.createElement('span');
      const parts = [item.title, `(${item.year})`, '·', TYPE_LABELS[item.type] || item.type];
      if (item.studio) {
        parts.push(`— ${item.studio}`);
      }
      text.textContent = parts.join(' ');

      const chooseBtn = document.createElement('button');
      chooseBtn.type = 'button';
      chooseBtn.textContent = 'Usar';
      chooseBtn.setAttribute('aria-label', `Usar ${item.title}`);
      chooseBtn.addEventListener('click', async () => {
        if (!currentParsed?.work) {
          return;
        }
        try {
          metaStatus.textContent = `Mesclando "${item.title}"...`;
          const resolved = await deps.searchService.resolveResultDetails(item);
          const detailedItem = resolved.item || item;
          if (resolved.warning) {
            deps.toast.warning(resolved.warning);
          }

          const mergeOut = mergeAiWithApi(currentParsed.work, detailedItem, {
            emptyFields: currentParsed.emptyFields
          });
          const finalWork = mergeOut.work;
          const filled = [...mergeOut.filledFromApi];

          if (!finalWork.cover && finalWork.coverUrl) {
            const coverOut = await fetchAndStoreCover(finalWork.coverUrl, finalWork.id, { db: deps.db });
            if (coverOut.ok) {
              finalWork.cover = coverOut.coverKey;
              finalWork.palette = coverOut.palette;
              filled.push('cover', 'palette');
            } else {
              presentErrorToast(deps.toast, { code: coverOut.code || 'CORS_OR_NETWORK', message: coverOut.message });
            }
            delete finalWork.coverUrl;
          }

          const remainingEmpty = currentParsed.emptyFields.filter((f) => !filled.includes(f));
          await renderPreview(finalWork, remainingEmpty.length);
          await deps.onApplyToForm(finalWork, { filledFromApi: filled });
          metaStatus.textContent = 'Dados mesclados no formulário. Revise e clique em "Salvar obra".';
          deps.toast.info('Formulário preenchido para revisão (não salvo automaticamente).');
        } catch (err) {
          presentErrorToast(deps.toast, err, { context: 'Aplicar dados da API' });
        }
      });

      li.append(text, chooseBtn);
      metaResultsList.appendChild(li);
    }
  });

  applyBtn.addEventListener('click', async () => {
    if (!currentParsed?.work) {
      return;
    }
    try {
      await deps.onApplyToForm(currentParsed.work, { filledFromApi: [] });
      deps.toast.info('Dados da IA aplicados ao formulário para revisão (não salvo automaticamente).');
    } catch (err) {
      presentErrorToast(deps.toast, err, { context: 'Aplicar resposta ao formulário' });
    }
  });

  return {
    reset: () => clearPasteBtn.click(),
    destroy: () => {
      activePreviewCard?.destroy?.();
      activePreviewCard = null;
      revokePreviewCover();
    }
  };
}
