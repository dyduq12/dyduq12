/**
 * "Colar da IA" UI panel: prompt copy (with iOS-friendly manual fallback),
 * block parsing, read-only card preview, resilient API metadata search, and form pre-fill.
 */

import { mergeAiWithApi } from '../ai/import-merge.js';
import { parseAiImport } from '../ai/parser.js';
import { buildAiPromptTemplate } from '../ai/prompt-template.js';
import { createCoverPreviewUrl, fetchAndStoreCover } from '../media/cover.js';
import { createWorkCard } from './card.js';
import { formatUserError, presentErrorToast } from './errors.js';

const PREVIEW_FIELD_LABELS = [
  ['title', 'Título'],
  ['type', 'Tipo'],
  ['year', 'Ano'],
  ['genre', 'Gênero'],
  ['studio', 'Estúdio / Dev'],
  ['director', 'Direção'],
  ['soundtrack', 'Trilha'],
  ['starring', 'Elenco / Criadores'],
  ['status', 'Status'],
  ['verdict', 'Veredito']
];

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
    'Copie o prompt padrão, cole a resposta JSON da IA abaixo, revise a prévia e enriqueça os metadados antes de salvar.';

  // --- COPY PROMPT + FALLBACK TEXTAREA ---
  const copyRow = document.createElement('div');
  copyRow.className = 'canon-form-actions';

  const copyPromptBtn = document.createElement('button');
  copyPromptBtn.type = 'button';
  copyPromptBtn.textContent = 'Copiar prompt padrão';
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
  pasteLabel.textContent = 'Resposta da IA (bloco JSON ou texto contendo JSON)';

  const pasteTextarea = document.createElement('textarea');
  pasteTextarea.id = 'ai-paste-input';
  pasteTextarea.rows = 6;
  pasteTextarea.placeholder = 'Cole aqui a resposta da IA...';

  pasteField.append(pasteLabel, pasteTextarea);

  const parseRow = document.createElement('div');
  parseRow.className = 'canon-form-actions';

  const parseBtn = document.createElement('button');
  parseBtn.type = 'button';
  parseBtn.dataset.variant = 'primary';
  parseBtn.textContent = 'Ler bloco';

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
  previewTitle.textContent = 'Prévia da importação';

  const previewGrid = document.createElement('div');
  previewGrid.className = 'canon-ai-preview-grid';

  const previewCardList = document.createElement('ul');
  previewCardList.className = 'canon-ai-preview-list';

  const originWrap = document.createElement('div');
  originWrap.className = 'canon-field';
  const originHeading = document.createElement('strong');
  originHeading.textContent = 'Origem dos campos';
  const originList = document.createElement('ul');
  originList.className = 'canon-ai-origin-list';
  originWrap.append(originHeading, originList);

  previewGrid.append(previewCardList, originWrap);

  const metaActions = document.createElement('div');
  metaActions.className = 'canon-form-actions';

  const fetchMetaBtn = document.createElement('button');
  fetchMetaBtn.type = 'button';
  fetchMetaBtn.textContent = 'Buscar metadados';

  const skipMetaBtn = document.createElement('button');
  skipMetaBtn.type = 'button';
  skipMetaBtn.textContent = 'Continuar sem metadados';

  metaActions.append(fetchMetaBtn, skipMetaBtn);

  const metaStatus = document.createElement('p');
  metaStatus.className = 'canon-brand-subtitle';
  metaStatus.setAttribute('role', 'status');

  const metaResultsList = document.createElement('ul');
  metaResultsList.className = 'canon-results-list';

  previewBox.append(previewTitle, previewGrid, metaActions, metaStatus, metaResultsList);

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

  function renderOriginSummary(work, emptyFields = [], filledFromApi = []) {
    const emptySet = new Set(emptyFields);
    const apiSet = new Set(filledFromApi);
    originList.replaceChildren();

    for (const [key, label] of PREVIEW_FIELD_LABELS) {
      const li = document.createElement('li');
      const val = work?.[key];
      const isEmpty = emptySet.has(key) || val === undefined || val === null || String(val).trim() === '';
      let origin = 'IA';
      if (apiSet.has(key)) {
        origin = 'API';
      } else if (isEmpty) {
        origin = 'Faltando';
      }
      const displayVal = isEmpty ? '—' : String(val);
      li.textContent = `${label}: ${displayVal} [${origin}]`;
      originList.appendChild(li);
    }

    const scoresLi = document.createElement('li');
    scoresLi.textContent = `Notas (6 critérios): preenchidas [IA]`;
    originList.appendChild(scoresLi);
  }

  async function renderPreview(work, emptyFields = [], filledFromApi = []) {
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
    renderOriginSummary(work, emptyFields, filledFromApi);
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
        deps.toast.success('Prompt padrão copiado para a área de transferência.');
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
        deps.toast.error('Não foi possível importar o bloco. Veja os erros listados.');
        return;
      }

      currentParsed = parsed;
      await renderPreview(parsed.work, parsed.emptyFields, []);
      deps.toast.success('Bloco validado! Revise a prévia e busque metadados ou continue.');
    } catch (err) {
      presentErrorToast(deps.toast, err, { context: 'Ler bloco da IA' });
    }
  });

  fetchMetaBtn.addEventListener('click', async () => {
    if (!currentParsed?.work) {
      return;
    }
    metaResultsList.replaceChildren();
    metaStatus.textContent = `Buscando "${currentParsed.work.title}" (${currentParsed.work.type})...`;

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
      metaStatus.textContent = `${msg} Suas notas foram preservadas; clique em "Continuar sem metadados".`;
      deps.toast.warning(`${msg} Notas preservadas.`);
      return;
    }

    if (!response.results || response.results.length === 0) {
      metaStatus.textContent = 'Nenhum resultado encontrado na API. Suas notas foram preservadas.';
      return;
    }

    metaStatus.textContent = `${response.results.length} resultado(s) encontrado(s). Escolha um para mesclar:`;
    for (const item of response.results) {
      const li = document.createElement('li');
      li.className = 'canon-result-item';

      const text = document.createElement('span');
      const parts = [item.title, `(${item.year})`, `[${item.type}]`];
      if (item.studio) {
        parts.push(`— ${item.studio}`);
      }
      text.textContent = parts.join(' ');

      const chooseBtn = document.createElement('button');
      chooseBtn.type = 'button';
      chooseBtn.textContent = 'Aplicar resultado';
      chooseBtn.addEventListener('click', async () => {
        if (!currentParsed?.work) {
          return;
        }
        try {
          metaStatus.textContent = `Mesclando metadados de "${item.title}"...`;
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
          await renderPreview(finalWork, remainingEmpty, filled);
          await deps.onApplyToForm(finalWork, { filledFromApi: filled });
          metaStatus.textContent = 'Metadados mesclados no formulário abaixo. Revise e clique em "Salvar obra".';
          deps.toast.info('Formulário pré-preenchido para revisão (não salvo automaticamente).');
        } catch (err) {
          presentErrorToast(deps.toast, err, { context: 'Aplicar metadados da API' });
        }
      });

      li.append(text, chooseBtn);
      metaResultsList.appendChild(li);
    }
  });

  skipMetaBtn.addEventListener('click', async () => {
    if (!currentParsed?.work) {
      return;
    }
    try {
      await deps.onApplyToForm(currentParsed.work, { filledFromApi: [] });
      deps.toast.info('Dados da IA aplicados no formulário para revisão (não salvo automaticamente).');
    } catch (err) {
      presentErrorToast(deps.toast, err, { context: 'Aplicar bloco no formulário' });
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
