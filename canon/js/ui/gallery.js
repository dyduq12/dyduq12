/**
 * Filterable and sortable editorial card gallery with cover ObjectURL lifecycle management.
 */

import { createCoverPreviewUrl } from '../media/cover.js';
import { createWorkCard } from './card.js';

const FILTER_OPTIONS = [
  { id: 'all', label: 'Todos' },
  { id: 'game', label: 'Jogos' },
  { id: 'movie', label: 'Filmes' },
  { id: 'series', label: 'Séries' },
  { id: 'anime', label: 'Animes' }
];

const SORT_OPTIONS = [
  { id: 'score_desc', label: 'Maior nota geral' },
  { id: 'year_desc', label: 'Mais recentes (ano)' },
  { id: 'recent', label: 'Atualizados recentemente' }
];

function applyFilterAndSort(works, filterType, sortBy) {
  const filtered = filterType === 'all'
    ? [...works]
    : works.filter((item) => item.type === filterType);

  filtered.sort((a, b) => {
    if (sortBy === 'year_desc') {
      return (b.year || 0) - (a.year || 0);
    }
    if (sortBy === 'recent') {
      return Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0);
    }
    const diff = (b.scores?.geral ?? 0) - (a.scores?.geral ?? 0);
    if (diff !== 0) {
      return diff;
    }
    return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
  });

  return filtered;
}

/**
 * Mounts the gallery UI inside `container`.
 * @param {HTMLElement} container
 * @param {{
 *   db: ReturnType<typeof import('../core/db.js').createDatabase>,
 *   onEdit: (work: Record<string, any>) => void,
 *   onRemove: (work: Record<string, any>) => void,
 *   onExportPoster?: (work: Record<string, any>, triggerEl: HTMLElement) => void
 * }} deps
 */
export function createGallery(container, deps) {
  let activeFilter = 'all';
  let activeSort = 'score_desc';
  let currentWorks = [];
  let renderSeq = 0;
  /** @type {string[]} */
  let activeObjectUrls = [];
  /** @type {Array<{ destroy?: () => void }>} */
  let activeCards = [];

  container.replaceChildren();

  const headerRow = document.createElement('div');
  headerRow.className = 'canon-toolbar';

  const heading = document.createElement('h2');
  heading.className = 'canon-panel-title';
  const countSpan = document.createElement('span');
  countSpan.textContent = '0';
  heading.append(document.createTextNode('Acervo ('), countSpan, document.createTextNode(')'));

  const sortWrap = document.createElement('div');
  sortWrap.className = 'canon-sort-wrap';
  const sortLabel = document.createElement('label');
  sortLabel.htmlFor = 'gallery-sort';
  sortLabel.textContent = 'Ordenar:';
  const sortSelect = document.createElement('select');
  sortSelect.id = 'gallery-sort';
  for (const opt of SORT_OPTIONS) {
    const optionEl = document.createElement('option');
    optionEl.value = opt.id;
    optionEl.textContent = opt.label;
    sortSelect.appendChild(optionEl);
  }
  sortWrap.append(sortLabel, sortSelect);
  headerRow.append(heading, sortWrap);

  const filterGroup = document.createElement('div');
  filterGroup.className = 'canon-filter-group';
  filterGroup.setAttribute('role', 'group');
  filterGroup.setAttribute('aria-label', 'Filtrar por tipo de mídia');

  const filterButtons = new Map();
  for (const filter of FILTER_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'canon-filter-btn';
    btn.textContent = filter.label;
    btn.setAttribute('aria-pressed', String(filter.id === activeFilter));
    btn.addEventListener('click', () => {
      activeFilter = filter.id;
      for (const [id, b] of filterButtons) {
        b.setAttribute('aria-pressed', String(id === activeFilter));
      }
      render(currentWorks);
    });
    filterButtons.set(filter.id, btn);
    filterGroup.appendChild(btn);
  }

  sortSelect.addEventListener('change', () => {
    activeSort = sortSelect.value;
    render(currentWorks);
  });

  const grid = document.createElement('ul');
  grid.className = 'canon-gallery-grid';

  const emptyBox = document.createElement('div');
  emptyBox.className = 'canon-empty-state';
  emptyBox.hidden = true;

  container.append(headerRow, filterGroup, grid, emptyBox);

  function revokeAllObjectUrls() {
    for (const url of activeObjectUrls) {
      URL.revokeObjectURL(url);
    }
    activeObjectUrls = [];
  }

  function destroyActiveCards() {
    for (const card of activeCards) {
      card?.destroy?.();
    }
    activeCards = [];
  }

  async function render(works) {
    currentWorks = Array.isArray(works) ? works : [];
    const seq = ++renderSeq;

    const visible = applyFilterAndSort(currentWorks, activeFilter, activeSort);
    countSpan.textContent = String(visible.length);

    if (visible.length === 0) {
      destroyActiveCards();
      revokeAllObjectUrls();
      grid.replaceChildren();
      grid.hidden = true;
      emptyBox.hidden = false;
      emptyBox.textContent =
        currentWorks.length === 0
          ? 'Sua câmara está vazia. Adicione uma obra ou busque nas APIs ao lado.'
          : 'Nenhuma obra corresponde ao filtro selecionado.';
      return;
    }

    const coverEntries = await Promise.all(
      visible.map(async (work) => {
        const url = work.cover ? await createCoverPreviewUrl(deps.db, work.cover) : null;
        return url;
      })
    );

    if (seq !== renderSeq) {
      for (const url of coverEntries) {
        if (url) {
          URL.revokeObjectURL(url);
        }
      }
      return;
    }

    destroyActiveCards();
    revokeAllObjectUrls();
    const fragment = document.createDocumentFragment();
    visible.forEach((work, index) => {
      const coverUrl = coverEntries[index];
      if (coverUrl) {
        activeObjectUrls.push(coverUrl);
      }
      const card = createWorkCard(work, {
        coverObjectUrl: coverUrl,
        bus: deps.bus,
        onEdit: deps.onEdit,
        onRemove: deps.onRemove,
        onExportPoster: deps.onExportPoster
      });
      activeCards.push(card);
      fragment.appendChild(card);
    });

    emptyBox.hidden = true;
    grid.hidden = false;
    grid.replaceChildren(fragment);
  }

  return {
    render,
    destroy: () => {
      destroyActiveCards();
      revokeAllObjectUrls();
    }
  };
}
