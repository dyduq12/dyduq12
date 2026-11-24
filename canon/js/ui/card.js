/**
 * Editorial 3D flip card component with Safari-safe layering, inert/aria-hidden management,
 * and scroll-tolerant Pointer Events (R3) + keyboard activation.
 */

import { buildCardModel } from './card-model.js';

const FLIP_MOVE_TOLERANCE_PX = 10;

function buildSpecList(techSpecs) {
  const dl = document.createElement('dl');
  dl.className = 'canon-card-specs';

  for (const spec of techSpecs) {
    const dt = document.createElement('dt');
    dt.textContent = spec.label;
    const dd = document.createElement('dd');
    dd.textContent = spec.value;
    dl.append(dt, dd);
  }

  return dl;
}

function buildCriteriaList(criteriaBars) {
  const ul = document.createElement('ul');
  ul.className = 'canon-card-bars';

  for (const bar of criteriaBars) {
    const li = document.createElement('li');
    li.className = 'canon-card-bar-item';

    const head = document.createElement('div');
    head.className = 'canon-card-bar-head';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = bar.label;
    const scoreSpan = document.createElement('span');
    scoreSpan.textContent = bar.scoreFormatted;
    head.append(nameSpan, scoreSpan);

    const track = document.createElement('div');
    track.className = 'canon-card-bar-track';
    const fill = document.createElement('div');
    fill.className = 'canon-card-bar-fill';
    fill.style.width = `${bar.percent}%`;
    track.appendChild(fill);

    li.append(head, track);
    ul.appendChild(li);
  }

  return ul;
}

function buildTextListSection(title, items) {
  const box = document.createElement('div');
  const heading = document.createElement('h4');
  heading.textContent = title;
  const ul = document.createElement('ul');
  for (const entry of items) {
    const li = document.createElement('li');
    li.textContent = entry;
    ul.appendChild(li);
  }
  box.append(heading, ul);
  return box;
}

/**
 * Creates a CANON editorial card list item (`<li>`) with 3D flip and action buttons.
 * @param {Record<string, any>} work
 * @param {{
 *   coverObjectUrl?: string | null,
 *   readOnly?: boolean,
 *   bus?: { emit: (event: string, payload?: unknown) => void },
 *   onEdit?: (work: Record<string, any>) => void,
 *   onRemove?: (work: Record<string, any>) => void,
 *   onExportPoster?: (work: Record<string, any>, triggerEl: HTMLElement) => void
 * }} [options]
 */
export function createWorkCard(work, options = {}) {
  const model = buildCardModel(work);
  let isFlipped = false;

  const shell = document.createElement('li');
  shell.className = 'canon-card-shell';
  shell.dataset.flipped = 'false';
  shell.style.setProperty('--work-a', model.palette[0]);
  shell.style.setProperty('--work-b', model.palette[1]);

  const stage = document.createElement('div');
  stage.className = 'canon-card-stage';

  const inner = document.createElement('div');
  inner.className = 'canon-card-inner';

  // --- FRONT FACE ---
  const frontFace = document.createElement('div');
  frontFace.className = 'canon-card-face canon-card-face--front';

  const frontSurface = document.createElement('div');
  frontSurface.className = 'canon-card-surface';

  const frontFlipBtn = document.createElement('button');
  frontFlipBtn.type = 'button';
  frontFlipBtn.className = 'canon-card-flip-btn';

  const poster = document.createElement('div');
  poster.className = 'canon-card-poster';

  if (options.coverObjectUrl) {
    const img = document.createElement('img');
    img.className = 'canon-card-cover-img';
    img.src = options.coverObjectUrl;
    img.alt = `Capa de ${model.titleRaw}`;
    poster.appendChild(img);
  } else {
    const monogram = document.createElement('span');
    monogram.className = 'canon-card-placeholder-monogram';
    monogram.textContent = model.monogram;
    poster.appendChild(monogram);
  }

  const typePill = document.createElement('span');
  typePill.className = 'canon-card-type-pill';
  typePill.textContent = model.typeLabel;
  poster.appendChild(typePill);

  const frontBody = document.createElement('div');
  frontBody.className = 'canon-card-front-body';

  const titleRow = document.createElement('div');
  titleRow.className = 'canon-card-title-row';

  const titleEl = document.createElement('h3');
  titleEl.className = 'canon-card-title';
  titleEl.textContent = model.titleUpper;

  const yearEl = document.createElement('span');
  yearEl.className = 'canon-card-year';
  yearEl.textContent = model.yearText;

  titleRow.append(titleEl, yearEl);

  const specsList = buildSpecList(model.techSpecs);

  const frontHint = document.createElement('span');
  frontHint.className = 'canon-card-flip-hint';
  frontHint.textContent = `Nota ${model.geralFormatted} · Toque ou Enter para ver verso`;

  frontBody.append(titleRow, specsList, frontHint);
  frontFlipBtn.append(poster, frontBody);
  frontSurface.appendChild(frontFlipBtn);
  frontFace.appendChild(frontSurface);

  // --- BACK FACE ---
  const backFace = document.createElement('div');
  backFace.className = 'canon-card-face canon-card-face--back';

  const backSurface = document.createElement('div');
  backSurface.className = 'canon-card-surface';

  const backFlipBtn = document.createElement('button');
  backFlipBtn.type = 'button';
  backFlipBtn.className = 'canon-card-flip-btn';

  const backBody = document.createElement('div');
  backBody.className = 'canon-card-back-body';

  const scoreBanner = document.createElement('div');
  scoreBanner.className = 'canon-card-score-banner';

  const geralEl = document.createElement('span');
  geralEl.className = 'canon-card-geral-score';
  geralEl.textContent = `${model.geralFormatted}/10`;
  scoreBanner.appendChild(geralEl);

  if (model.hallOfFame.isHallOfFame && model.hallOfFame.badgeLabel) {
    const badge = document.createElement('span');
    badge.className = 'canon-card-hall-badge';
    badge.textContent = model.hallOfFame.badgeLabel;
    scoreBanner.appendChild(badge);
  } else {
    const statusEl = document.createElement('span');
    statusEl.className = 'canon-card-year';
    statusEl.textContent = model.statusLabel;
    scoreBanner.appendChild(statusEl);
  }

  const barsEl = buildCriteriaList(model.criteriaBars);

  const listsGrid = document.createElement('div');
  listsGrid.className = 'canon-card-lists';
  listsGrid.append(
    buildTextListSection('Prós', model.pros),
    buildTextListSection('Contras', model.cons)
  );

  const verdictEl = document.createElement('p');
  verdictEl.className = 'canon-card-verdict';
  verdictEl.textContent = `${model.statusLabel} · ${model.verdictText}`;

  backBody.append(scoreBanner, barsEl, listsGrid, verdictEl);
  backFlipBtn.appendChild(backBody);
  backSurface.appendChild(backFlipBtn);
  backFace.appendChild(backSurface);

  inner.append(frontFace, backFace);
  stage.appendChild(inner);

  // --- ACTIONS BAR (outside flip button & preserve-3d layer) ---
  const actionsBar = document.createElement('div');
  actionsBar.className = 'canon-card-actions';
  actionsBar.dataset.noFlip = 'true';

  const sourceTag = document.createElement('span');
  sourceTag.className = 'canon-card-source';
  sourceTag.textContent = options.readOnly ? '[prévia]' : `[${model.sourceLabel}]`;
  actionsBar.appendChild(sourceTag);

  if (!options.readOnly) {
    const btnGroup = document.createElement('div');
    btnGroup.className = 'canon-card-btn-group';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Editar';
    editBtn.setAttribute('aria-label', `Editar ${model.titleRaw}`);
    editBtn.addEventListener('click', () => options.onEdit?.(work));

    const posterBtn = document.createElement('button');
    posterBtn.type = 'button';
    posterBtn.textContent = 'Exportar pôster';
    posterBtn.setAttribute('aria-label', `Exportar pôster de ${model.titleRaw}`);
    posterBtn.addEventListener('click', () => options.onExportPoster?.(work, posterBtn));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remover';
    removeBtn.setAttribute('aria-label', `Remover ${model.titleRaw}`);
    removeBtn.addEventListener('click', () => options.onRemove?.(work));

    btnGroup.append(editBtn, posterBtn, removeBtn);
    actionsBar.appendChild(btnGroup);
  }
  shell.append(stage, actionsBar);

  function syncFlipState(moveFocus = false) {
    shell.dataset.flipped = String(isFlipped);

    frontFace.inert = isFlipped;
    frontFace.setAttribute('aria-hidden', String(isFlipped));
    backFace.inert = !isFlipped;
    backFace.setAttribute('aria-hidden', String(!isFlipped));

    frontFlipBtn.setAttribute('aria-pressed', String(isFlipped));
    frontFlipBtn.setAttribute('aria-label', `Virar card de ${model.titleRaw} para ver avaliações`);
    backFlipBtn.setAttribute('aria-pressed', String(isFlipped));
    backFlipBtn.setAttribute('aria-label', `Voltar card de ${model.titleRaw} para a frente`);

    if (moveFocus) {
      const targetBtn = isFlipped ? backFlipBtn : frontFlipBtn;
      targetBtn.focus({ preventScroll: true });
    }
  }

  function emitFlipState() {
    if (!options.readOnly) {
      options.bus?.emit('card:flip', { work, flipped: isFlipped });
    }
  }

  const cleanups = [];

  function attachFlipInteractions(flipBtn) {
    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let suppressNextClick = false;

    const onPointerDown = (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') {
        return;
      }
      if (event.target instanceof Element && event.target.closest('[data-no-flip]')) {
        return;
      }
      activePointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      suppressNextClick = false;
      try {
        flipBtn.setPointerCapture(event.pointerId);
      } catch (err) {
        console.warn('[card] Captura de ponteiro indisponível:', { message: err?.message });
      }
    };

    const onPointerUp = (event) => {
      if (activePointerId !== event.pointerId) {
        return;
      }
      const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
      activePointerId = null;
      suppressNextClick = true;

      try {
        if (flipBtn.hasPointerCapture?.(event.pointerId)) {
          flipBtn.releasePointerCapture(event.pointerId);
        }
      } catch (err) {
        console.warn('[card] Falha ao liberar captura no pointerup:', { message: err?.message });
      }

      if (distance <= FLIP_MOVE_TOLERANCE_PX) {
        isFlipped = !isFlipped;
        syncFlipState(false);
        emitFlipState();
      }
    };

    function cancelPointer(event) {
      if (activePointerId !== event.pointerId) {
        return;
      }
      activePointerId = null;
      suppressNextClick = true;
      try {
        if (flipBtn.hasPointerCapture?.(event.pointerId)) {
          flipBtn.releasePointerCapture(event.pointerId);
        }
      } catch (err) {
        console.warn('[card] Falha ao liberar captura ao cancelar gesto:', { message: err?.message });
      }
    }

    // Keyboard (Enter/Space) and assistive tech activation fire click without pointerdown
    const onClick = (event) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (event.target instanceof Element && event.target.closest('[data-no-flip]')) {
        return;
      }
      isFlipped = !isFlipped;
      syncFlipState(event.detail === 0);
      emitFlipState();
    };

    flipBtn.addEventListener('pointerdown', onPointerDown);
    flipBtn.addEventListener('pointerup', onPointerUp);
    flipBtn.addEventListener('pointercancel', cancelPointer);
    flipBtn.addEventListener('lostpointercapture', cancelPointer);
    flipBtn.addEventListener('click', onClick);

    cleanups.push(() => {
      activePointerId = null;
      flipBtn.removeEventListener('pointerdown', onPointerDown);
      flipBtn.removeEventListener('pointerup', onPointerUp);
      flipBtn.removeEventListener('pointercancel', cancelPointer);
      flipBtn.removeEventListener('lostpointercapture', cancelPointer);
      flipBtn.removeEventListener('click', onClick);
    });
  }

  attachFlipInteractions(frontFlipBtn);
  attachFlipInteractions(backFlipBtn);
  syncFlipState(false);

  shell.destroy = () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };

  return shell;
}
