/**
 * Complete editorial form component with API search, 6 Pointer-Event sliders,
 * editable pros/cons lists, local cover upload, and schema validation.
 */

import {
  DEFAULT_PALETTE,
  SCORE_KEYS,
  WORK_STATUSES,
  WORK_TYPES,
  createWork,
  generateManualId,
  validateWork
} from '../core/schema.js';
import {
  createCoverPreviewUrl,
  fetchAndStoreCover,
  normalizeAndStoreCoverBlob
} from '../media/cover.js';
import { mountAiImportPanel } from './ai-import.js';
import { getCriterionLabelsForType } from './card-model.js';
import { formatUserError, presentErrorToast } from './errors.js';
import { createScoreSlider } from './sliders.js';

const STATUS_OPTION_LABELS = {
  planned: 'Planejado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  on_hold: 'Pausado',
  dropped: 'Abandonado'
};

function createFieldWrapper(id, labelText, control) {
  const wrap = document.createElement('div');
  wrap.className = 'canon-field';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  const errEl = document.createElement('p');
  errEl.className = 'canon-field-error';
  errEl.hidden = true;
  wrap.append(label, control, errEl);
  return { wrap, errEl };
}

function createEditableListSection(title, inputId, placeholder) {
  let items = [];

  const container = document.createElement('div');
  container.className = 'canon-list-editor';

  const label = document.createElement('label');
  label.htmlFor = inputId;
  label.textContent = title;

  const inputRow = document.createElement('div');
  inputRow.className = 'canon-list-input-row';

  const input = document.createElement('input');
  input.id = inputId;
  input.type = 'text';
  input.placeholder = placeholder;

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = 'Adicionar';

  const ul = document.createElement('ul');
  ul.className = 'canon-chip-list';

  function render() {
    ul.replaceChildren();
    items.forEach((entry, index) => {
      const li = document.createElement('li');
      li.className = 'canon-chip-item';

      const text = document.createElement('span');
      text.textContent = entry;

      const rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.textContent = 'Remover';
      rmBtn.setAttribute('aria-label', `Remover item "${entry}"`);
      rmBtn.addEventListener('click', () => {
        items.splice(index, 1);
        render();
      });

      li.append(text, rmBtn);
      ul.appendChild(li);
    });
  }

  function addCurrent() {
    const val = input.value.trim();
    if (!val) {
      return;
    }
    items.push(val);
    input.value = '';
    render();
  }

  addBtn.addEventListener('click', addCurrent);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCurrent();
    }
  });

  inputRow.append(input, addBtn);
  container.append(label, inputRow, ul);

  return {
    element: container,
    getItems: () => [...items],
    setItems: (nextItems) => {
      items = Array.isArray(nextItems) ? nextItems.filter((x) => typeof x === 'string' && x.trim()) : [];
      render();
    }
  };
}

/**
 * Mounts the full search + editorial form panel.
 * @param {HTMLElement} container
 * @param {{
 *   db: ReturnType<typeof import('../core/db.js').createDatabase>,
 *   store: ReturnType<typeof import('../core/store.js').createStore>,
 *   searchService: ReturnType<typeof import('../api/search.js').createSearchService>,
 *   bus: ReturnType<typeof import('../core/events.js').createEventBus>,
 *   toast: ReturnType<typeof import('./toast.js').createToaster>
 * }} deps
 */
export function createWorkFormPanel(container, deps) {
  let activePreviewUrl = null;
  let editingId = '';
  let pendingCoverUrl = '';
  let currentCoverKey = null;
  let currentPalette = [...DEFAULT_PALETTE];

  container.replaceChildren();

  // --- AI IMPORT PANEL ---
  const aiImportSlot = document.createElement('div');

  // --- SEARCH BLOCK ---
  const searchHeading = document.createElement('h2');
  searchHeading.className = 'canon-panel-title';
  searchHeading.textContent = 'Buscar em APIs';

  const searchRow = document.createElement('div');
  searchRow.className = 'canon-search-row';

  const searchTypeSelect = document.createElement('select');
  searchTypeSelect.id = 'search-type';
  searchTypeSelect.setAttribute('aria-label', 'Tipo de mídia para busca');
  for (const [val, text] of [
    ['anime', 'anime (AniList)'],
    ['movie', 'movie (TMDB)'],
    ['series', 'series (TMDB)'],
    ['game', 'game (RAWG)']
  ]) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = text;
    searchTypeSelect.appendChild(opt);
  }

  const searchInput = document.createElement('input');
  searchInput.id = 'search-query';
  searchInput.type = 'search';
  searchInput.placeholder = 'Buscar título para preencher ficha...';
  searchInput.setAttribute('aria-label', 'Título para buscar na API');

  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.textContent = 'Buscar';

  searchRow.append(searchTypeSelect, searchInput, searchBtn);

  const searchStatusEl = document.createElement('p');
  searchStatusEl.className = 'canon-brand-subtitle';
  searchStatusEl.setAttribute('role', 'status');

  const searchResultsEl = document.createElement('ul');
  searchResultsEl.className = 'canon-results-list';

  // --- FORM BLOCK ---
  const formHeading = document.createElement('h2');
  formHeading.className = 'canon-panel-title';
  formHeading.textContent = 'Nova obra';

  const form = document.createElement('form');
  form.className = 'canon-form';
  form.noValidate = true;

  const titleInput = document.createElement('input');
  titleInput.id = 'work-title';
  titleInput.type = 'text';
  titleInput.required = true;

  const typeSelect = document.createElement('select');
  typeSelect.id = 'work-type';
  for (const t of WORK_TYPES) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    typeSelect.appendChild(opt);
  }

  const yearInput = document.createElement('input');
  yearInput.id = 'work-year';
  yearInput.type = 'number';
  yearInput.min = '1888';
  yearInput.max = '2100';
  yearInput.step = '1';

  const statusSelect = document.createElement('select');
  statusSelect.id = 'work-status';
  for (const st of WORK_STATUSES) {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = STATUS_OPTION_LABELS[st] || st;
    statusSelect.appendChild(opt);
  }

  const genreInput = document.createElement('input');
  genreInput.id = 'work-genre';
  genreInput.type = 'text';

  const studioInput = document.createElement('input');
  studioInput.id = 'work-studio';
  studioInput.type = 'text';

  const directorInput = document.createElement('input');
  directorInput.id = 'work-director';
  directorInput.type = 'text';

  const soundtrackInput = document.createElement('input');
  soundtrackInput.id = 'work-soundtrack';
  soundtrackInput.type = 'text';

  const starringInput = document.createElement('input');
  starringInput.id = 'work-starring';
  starringInput.type = 'text';

  const verdictInput = document.createElement('textarea');
  verdictInput.id = 'work-verdict';
  verdictInput.placeholder = 'Síntese editorial da obra...';

  const fieldTitle = createFieldWrapper('work-title', 'Título *', titleInput);
  const fieldType = createFieldWrapper('work-type', 'Tipo *', typeSelect);
  const fieldYear = createFieldWrapper('work-year', 'Ano *', yearInput);
  const fieldStatus = createFieldWrapper('work-status', 'Status', statusSelect);
  const fieldGenre = createFieldWrapper('work-genre', 'Gênero', genreInput);
  const fieldStudio = createFieldWrapper('work-studio', 'Estúdio / Desenvolvedora', studioInput);
  const fieldDirector = createFieldWrapper('work-director', 'Direção', directorInput);
  const fieldSoundtrack = createFieldWrapper('work-soundtrack', 'Trilha sonora', soundtrackInput);
  const fieldStarring = createFieldWrapper('work-starring', 'Elenco / Criadores', starringInput);
  const fieldVerdict = createFieldWrapper('work-verdict', 'Veredito', verdictInput);

  const errorMap = new Map([
    ['title', fieldTitle.errEl],
    ['type', fieldType.errEl],
    ['year', fieldYear.errEl],
    ['status', fieldStatus.errEl],
    ['genre', fieldGenre.errEl],
    ['studio', fieldStudio.errEl],
    ['director', fieldDirector.errEl],
    ['soundtrack', fieldSoundtrack.errEl],
    ['starring', fieldStarring.errEl],
    ['verdict', fieldVerdict.errEl]
  ]);

  const grid = document.createElement('div');
  grid.className = 'canon-field-grid';
  grid.append(
    fieldTitle.wrap,
    fieldType.wrap,
    fieldYear.wrap,
    fieldStatus.wrap,
    fieldGenre.wrap,
    fieldStudio.wrap,
    fieldDirector.wrap,
    fieldSoundtrack.wrap
  );

  // --- 6 SCORE SLIDERS ---
  const slidersBox = document.createElement('fieldset');
  slidersBox.className = 'canon-sliders-group';
  const slidersTitle = document.createElement('legend');
  slidersTitle.textContent = 'Notas (0 a 10, passo 0,5)';
  slidersBox.appendChild(slidersTitle);

  const sliderMap = new Map();
  for (const key of SCORE_KEYS) {
    const slider = createScoreSlider({
      id: `slider-${key}`,
      name: key,
      label: key === 'geral' ? 'Nota Geral' : key,
      value: key === 'geral' ? 7.5 : 7.0,
      bus: deps.bus
    });
    sliderMap.set(key, slider);
    slidersBox.appendChild(slider.element);
  }

  function syncSliderLabels(mediaType) {
    const labels = getCriterionLabelsForType(mediaType);
    for (const item of labels) {
      sliderMap.get(item.key)?.setLabel(item.label);
    }
  }

  typeSelect.addEventListener('change', () => syncSliderLabels(typeSelect.value));

  // --- PROS & CONS ---
  const prosEditor = createEditableListSection('Prós', 'pros-input', 'Adicionar ponto positivo...');
  const consEditor = createEditableListSection('Contras', 'cons-input', 'Adicionar ponto negativo...');

  // --- COVER UPLOAD & PREVIEW ---
  const coverBox = document.createElement('div');
  coverBox.className = 'canon-field';

  const coverLabel = document.createElement('label');
  coverLabel.htmlFor = 'cover-file-input';
  coverLabel.className = 'canon-file-label';
  coverLabel.textContent = 'Upload de capa local';

  const coverInput = document.createElement('input');
  coverInput.id = 'cover-file-input';
  coverInput.type = 'file';
  coverInput.accept = 'image/*';
  coverInput.className = 'canon-sr-only';

  const previewRow = document.createElement('div');
  previewRow.className = 'canon-cover-preview-box';

  const coverImg = document.createElement('img');
  coverImg.className = 'canon-cover-preview-img';
  coverImg.alt = 'Prévia da capa local';
  coverImg.width = 96;
  coverImg.height = 144;
  coverImg.hidden = true;

  const coverMeta = document.createElement('div');
  const coverStatusText = document.createElement('p');
  coverStatusText.className = 'canon-brand-subtitle';
  const paletteStatusText = document.createElement('p');
  paletteStatusText.className = 'canon-backup-meta';
  coverMeta.append(coverStatusText, paletteStatusText);
  previewRow.append(coverImg, coverMeta);
  coverBox.append(coverLabel, coverInput, previewRow);

  // --- SUBMIT & CANCEL ---
  const actionsRow = document.createElement('div');
  actionsRow.className = 'canon-form-actions';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.dataset.variant = 'primary';
  submitBtn.textContent = 'Salvar obra';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancelar edição';
  cancelBtn.hidden = true;

  actionsRow.append(submitBtn, cancelBtn);

  form.append(
    grid,
    fieldStarring.wrap,
    slidersBox,
    prosEditor.element,
    consEditor.element,
    fieldVerdict.wrap,
    coverBox,
    actionsRow
  );

  container.append(aiImportSlot, searchHeading, searchRow, searchStatusEl, searchResultsEl, formHeading, form);

  function clearFieldErrors() {
    for (const errEl of errorMap.values()) {
      errEl.textContent = '';
      errEl.hidden = true;
    }
  }

  function showValidationErrors(errors) {
    clearFieldErrors();
    for (const err of errors) {
      const target = errorMap.get(err.field);
      if (target) {
        target.textContent = err.message;
        target.hidden = false;
      }
    }
    const summary = errors.slice(0, 3).map((e) => `${e.field}: ${e.message}`).join(' | ');
    deps.toast.error(`Corrija os campos inválidos (${summary}).`);
  }

  function revokePreviewUrl() {
    if (activePreviewUrl) {
      URL.revokeObjectURL(activePreviewUrl);
      activePreviewUrl = null;
    }
  }

  async function refreshCoverPreview(coverKey, palette, statusMsg) {
    revokePreviewUrl();
    const safePalette = Array.isArray(palette) && palette.length === 2 ? palette : DEFAULT_PALETTE;
    coverStatusText.textContent = statusMsg;
    paletteStatusText.textContent = `Paleta: ${safePalette[0]} / ${safePalette[1]}`;

    if (!coverKey) {
      coverImg.hidden = true;
      coverImg.removeAttribute('src');
      return;
    }

    const url = await createCoverPreviewUrl(deps.db, coverKey);
    if (url) {
      activePreviewUrl = url;
      coverImg.src = url;
      coverImg.hidden = false;
    } else {
      coverImg.hidden = true;
      coverImg.removeAttribute('src');
    }
  }

  function getCurrentScores() {
    const scores = {};
    for (const key of SCORE_KEYS) {
      scores[key] = sliderMap.get(key)?.getValue() ?? 0;
    }
    return scores;
  }

  function emitFormContext(active) {
    if (!active) {
      deps.bus?.emit('form:context', { active: false });
      return;
    }
    deps.bus?.emit('form:context', {
      active: true,
      title: titleInput.value.trim() || 'Formulário',
      scores: getCurrentScores(),
      palette: [...currentPalette]
    });
  }

  function reset() {
    editingId = '';
    pendingCoverUrl = '';
    currentCoverKey = null;
    currentPalette = [...DEFAULT_PALETTE];
    form.reset();
    clearFieldErrors();
    yearInput.value = String(new Date().getUTCFullYear());
    typeSelect.value = 'game';
    statusSelect.value = 'planned';
    syncSliderLabels('game');
    for (const key of SCORE_KEYS) {
      sliderMap.get(key)?.setValue(key === 'geral' ? 7.5 : 7.0);
    }
    prosEditor.setItems([]);
    consEditor.setItems([]);
    coverInput.value = '';
    formHeading.textContent = 'Nova obra';
    cancelBtn.hidden = true;
    refreshCoverPreview(null, currentPalette, 'Sem capa local (placeholder editorial).');
    emitFormContext(false);
  }

  async function editWork(work) {
    clearFieldErrors();
    editingId = work.id;
    pendingCoverUrl = '';
    currentCoverKey = work.cover || null;
    currentPalette = Array.isArray(work.palette) ? [...work.palette] : [...DEFAULT_PALETTE];

    titleInput.value = work.title || '';
    typeSelect.value = work.type || 'game';
    yearInput.value = String(work.year || new Date().getUTCFullYear());
    statusSelect.value = work.status || 'planned';
    genreInput.value = work.genre || '';
    studioInput.value = work.studio || '';
    directorInput.value = work.director || '';
    soundtrackInput.value = work.soundtrack || '';
    starringInput.value = work.starring || '';
    verdictInput.value = work.verdict || '';

    syncSliderLabels(typeSelect.value);
    for (const key of SCORE_KEYS) {
      sliderMap.get(key)?.setValue(work.scores?.[key] ?? 0);
    }
    prosEditor.setItems(work.pros || []);
    consEditor.setItems(work.cons || []);

    formHeading.textContent = `Editando: ${work.title}`;
    cancelBtn.hidden = false;
    await refreshCoverPreview(
      currentCoverKey,
      currentPalette,
      currentCoverKey ? `Capa local vinculada (${currentCoverKey}).` : 'Sem capa local (placeholder).'
    );
    emitFormContext(true);
    titleInput.focus();
  }

  async function applyDraftFromAi(work, meta = {}) {
    await editWork(work);
    const originNote = meta.filledFromApi?.length
      ? ` (com ${meta.filledFromApi.length} campo(s) da API)`
      : '';
    formHeading.textContent = `Revisar importação da IA${originNote}: ${work.title}`;
  }

  const aiPanel = mountAiImportPanel(aiImportSlot, {
    db: deps.db,
    searchService: deps.searchService,
    toast: deps.toast,
    onApplyToForm: applyDraftFromAi
  });

  function renderSearchResults(results) {
    searchResultsEl.replaceChildren();
    if (!Array.isArray(results) || results.length === 0) {
      return;
    }

    for (const result of results) {
      const li = document.createElement('li');
      li.className = 'canon-result-item';

      const info = document.createElement('span');
      const parts = [result.title, `(${result.year})`, `[${result.type}]`];
      if (result.studio) {
        parts.push(`— ${result.studio}`);
      }
      info.textContent = parts.join(' ');

      const useBtn = document.createElement('button');
      useBtn.type = 'button';
      useBtn.textContent = 'Usar este resultado';
      useBtn.addEventListener('click', async () => {
        try {
          searchStatusEl.textContent = `Carregando detalhes de "${result.title}"...`;
          const resolved = await deps.searchService.resolveResultDetails(result);
          const data = resolved.item || result;

          clearFieldErrors();
          editingId = data.id || '';
          pendingCoverUrl = data.coverUrl || '';
          currentCoverKey = null;
          currentPalette = Array.isArray(data.palette) ? [...data.palette] : [...DEFAULT_PALETTE];

          titleInput.value = data.title || '';
          typeSelect.value = data.type || 'game';
          yearInput.value = String(data.year || new Date().getUTCFullYear());
          genreInput.value = data.genre || '';
          studioInput.value = data.studio || '';
          directorInput.value = data.director || '';
          soundtrackInput.value = data.soundtrack || '';
          starringInput.value = data.starring || '';
          syncSliderLabels(typeSelect.value);

          formHeading.textContent = `Importado: ${data.title}`;
          cancelBtn.hidden = false;
          await refreshCoverPreview(
            null,
            currentPalette,
            pendingCoverUrl
              ? 'Capa externa pendente: convertida para Blob local ao salvar.'
              : 'Sem capa externa; envie uma imagem local ou salve com placeholder.'
          );

          if (resolved.warning) {
            searchStatusEl.textContent = resolved.warning;
            deps.toast.warning(resolved.warning);
          } else {
            searchStatusEl.textContent = `Campos de "${data.title}" aplicados e editáveis.`;
          }
          emitFormContext(true);
          titleInput.focus();
        } catch (err) {
          presentErrorToast(deps.toast, err, { context: 'Carregar resultado' });
        }
      });

      li.append(info, useBtn);
      searchResultsEl.appendChild(li);
    }
  }

  async function runSearch(immediate = false) {
    const query = searchInput.value || '';
    const type = searchTypeSelect.value || 'anime';
    if (!query.trim()) {
      searchResultsEl.replaceChildren();
      searchStatusEl.textContent = '';
      return;
    }

    searchStatusEl.textContent = 'Buscando...';
    const response = await deps.searchService.search(query, type, { immediate });
    if (response.aborted) {
      return;
    }
    if (!response.ok) {
      searchResultsEl.replaceChildren();
      const formatted = formatUserError(response.error, {
        provider: type === 'game' ? 'rawg' : type === 'anime' ? 'anilist' : 'tmdb'
      });
      const msg = formatted.message || response.error?.message || 'Erro na busca. Use preenchimento manual.';
      searchStatusEl.textContent = msg;
      presentErrorToast(deps.toast, response.error, {
        provider: type === 'game' ? 'rawg' : type === 'anime' ? 'anilist' : 'tmdb'
      });
      return;
    }

    renderSearchResults(response.results);
    const cacheTag = response.fromCache ? (response.stale ? ' (cache expirado)' : ' (cache)') : '';
    searchStatusEl.textContent =
      response.results.length > 0
        ? `${response.results.length} resultado(s)${cacheTag}.`
        : `Nenhum resultado encontrado${cacheTag}.`;
  }

  searchBtn.addEventListener('click', () => runSearch(true));
  searchInput.addEventListener('input', () => runSearch(false));
  titleInput.addEventListener('input', () => emitFormContext(true));

  coverInput.addEventListener('change', async () => {
    const file = coverInput.files?.[0];
    if (!file) {
      return;
    }
    try {
      if (!editingId) {
        editingId = generateManualId();
      }

      const result = await normalizeAndStoreCoverBlob(file, editingId, { db: deps.db });
      if (!result.ok) {
        presentErrorToast(deps.toast, { code: result.code || 'COVER_PROCESS_FAILED', message: result.message });
        return;
      }

      pendingCoverUrl = '';
      currentCoverKey = result.coverKey;
      currentPalette = result.palette;
      await refreshCoverPreview(
        currentCoverKey,
        currentPalette,
        `Capa normalizada (${result.mimeType}) salva no IndexedDB.`
      );
      deps.toast.success('Capa local normalizada e paleta extraída.');
      emitFormContext(true);
    } catch (err) {
      presentErrorToast(deps.toast, err, { context: 'Processar capa local' });
    }
  });

  cancelBtn.addEventListener('click', () => {
    reset();
    deps.toast.info('Edição cancelada.');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors();

    const targetId = editingId || generateManualId();
    const existing = deps.store.get(targetId);

    const scores = {};
    for (const key of SCORE_KEYS) {
      scores[key] = sliderMap.get(key)?.getValue() ?? 0;
    }

    const draft = createWork({
      ...(existing || {}),
      id: targetId,
      title: titleInput.value.trim(),
      type: typeSelect.value,
      year: Number.parseInt(yearInput.value, 10),
      status: statusSelect.value,
      genre: genreInput.value.trim(),
      studio: studioInput.value.trim(),
      director: directorInput.value.trim(),
      soundtrack: soundtrackInput.value.trim(),
      starring: starringInput.value.trim(),
      verdict: verdictInput.value.trim(),
      pros: prosEditor.getItems(),
      cons: consEditor.getItems(),
      scores,
      cover: currentCoverKey,
      palette: [...currentPalette]
    });

    const preValidation = validateWork(draft);
    if (!preValidation.valid) {
      showValidationErrors(preValidation.errors);
      return;
    }

    if (!currentCoverKey && pendingCoverUrl) {
      const coverResult = await fetchAndStoreCover(pendingCoverUrl, targetId, { db: deps.db });
      if (coverResult.ok) {
        draft.cover = coverResult.coverKey;
        draft.palette = coverResult.palette;
      } else {
        presentErrorToast(deps.toast, { code: coverResult.code || 'CORS_OR_NETWORK', message: coverResult.message });
      }
    }

    try {
      const saved = await deps.store.save(draft);
      reset();
      deps.toast.success(`Obra "${saved.title}" salva no acervo.`);
    } catch (err) {
      if (Array.isArray(err?.validationErrors)) {
        showValidationErrors(err.validationErrors);
      } else {
        presentErrorToast(deps.toast, err, { context: 'Salvar obra' });
      }
    }
  });

  reset();

  return {
    editWork,
    reset,
    getEditingId: () => editingId,
    destroy: () => {
      revokePreviewUrl();
      aiPanel?.destroy?.();
      for (const slider of sliderMap.values()) {
        slider?.destroy?.();
      }
    }
  };
}
