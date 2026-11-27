/* ==========================================================================
   js/preview.js — Hover preview dos projetos (Dyduq12)
   Depende das classes do css/style.css: .preview, .is-visible, .preview__head,
   .preview__title, .preview__chip, .preview__mock, .preview__metrics,
   .preview__metric, .preview__foot
   ========================================================================== */
(function () {
  'use strict';

  var preview = document.getElementById('project-preview');
  var cards = document.querySelectorAll('[data-project]');
  if (!preview || !cards.length) return;

  var GAP = 12;
  var MARGEM = 12;
  var ativo = null;

  var CHIP_PUBLICO = 'Repositório Público';
  var CHIP_PRIVADO = 'Arquitetura Privada / Case Técnico';
  var FOOT_PUBLICO = 'Mockup ilustrativo · github.com/Dyduq12';
  var FOOT_PRIVADO = 'Mockup ilustrativo · não é captura de tela real';

  /* ===== Helpers de mockup (SVG inline, sem imagens externas) ===== */
  function janela(titulo, corpo) {
    return (
      '<svg viewBox="0 0 240 130" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mockup: ' + titulo + '">' +
        '<rect width="240" height="130" fill="#0B0E14"/>' +
        '<rect width="240" height="16" fill="#181B20"/>' +
        '<circle cx="9" cy="8" r="2.5" fill="#EF4444"/>' +
        '<circle cx="17" cy="8" r="2.5" fill="#F59E0B"/>' +
        '<circle cx="25" cy="8" r="2.5" fill="#22C55E"/>' +
        '<text x="36" y="11" font-family="DQ Mono, monospace" font-size="7" fill="#94A3B8">&gt;_ ' + titulo + '</text>' +
        corpo +
      '</svg>'
    );
  }

  var MOCKUPS = {
    mindnote: janela('mindnote-engine',
      '<g fill="none" stroke="#60A5FA" stroke-width="1.6">' +
        '<path d="M120 80 C92 68 72 52 56 44"/>' +
        '<path d="M120 80 C92 92 72 108 56 114"/>' +
        '<path d="M120 80 C148 68 170 52 186 44"/>' +
        '<path d="M120 80 C148 92 170 108 186 114"/>' +
      '</g>' +
      '<rect x="92" y="68" width="56" height="24" rx="6" fill="#1D4ED8"/>' +
      '<rect x="100" y="76" width="40" height="3" rx="1.5" fill="#FFFFFF"/>' +
      '<rect x="108" y="82" width="24" height="3" rx="1.5" fill="#BFDBFE"/>' +
      '<g fill="#181B20" stroke="#2B3140">' +
        '<rect x="18" y="36" width="42" height="16" rx="5"/>' +
        '<rect x="18" y="106" width="42" height="16" rx="5"/>' +
        '<rect x="182" y="36" width="42" height="16" rx="5"/>' +
        '<rect x="182" y="106" width="42" height="16" rx="5"/>' +
      '</g>' +
      '<path d="M194 72 C204 62 212 80 222 70" fill="none" stroke="#F8FAFC" stroke-width="1.4"/>' +
      '<path d="M210 126 L218 118 L221 121 L213 129 Z" fill="#93C5FD"/>'
    ),

    canon: janela('canon',
      '<rect x="12" y="24" width="50" height="64" rx="6" fill="#1D4ED8"/>' +
      '<rect x="18" y="70" width="28" height="4" rx="2" fill="#FFFFFF"/>' +
      '<rect x="18" y="77" width="18" height="3" rx="1.5" fill="#BFDBFE"/>' +
      '<rect x="70" y="24" width="50" height="64" rx="6" fill="#181B20" stroke="#2B3140"/>' +
      '<rect x="76" y="70" width="28" height="4" rx="2" fill="#F8FAFC"/>' +
      '<rect x="76" y="77" width="18" height="3" rx="1.5" fill="#94A3B8"/>' +
      '<rect x="128" y="24" width="50" height="64" rx="6" fill="#2563EB"/>' +
      '<rect x="134" y="70" width="28" height="4" rx="2" fill="#FFFFFF"/>' +
      '<rect x="134" y="77" width="18" height="3" rx="1.5" fill="#DBEAFE"/>' +
      '<rect x="186" y="24" width="42" height="64" rx="6" fill="#181B20" stroke="#2B3140"/>' +
      '<rect x="12" y="100" width="216" height="18" rx="9" fill="#181B20" stroke="#2B3140"/>' +
      '<path d="M24 104 L24 114 L32 109 Z" fill="#93C5FD"/>' +
      '<rect x="40" y="108" width="120" height="2" rx="1" fill="#2B3140"/>' +
      '<rect x="40" y="108" width="52" height="2" rx="1" fill="#60A5FA"/>' +
      '<rect x="176" y="105" width="40" height="8" rx="4" fill="#1D4ED8"/>'
    ),

    storage: janela('storage-auditor',
      '<g font-family="DQ Mono, monospace" font-size="7" fill="#94A3B8">' +
        '<text x="14" y="38">Estágio 1</text>' +
        '<text x="14" y="58">Estágio 2</text>' +
        '<text x="14" y="78">Estágio 3</text>' +
        '<text x="14" y="98">Estágio 4</text>' +
      '</g>' +
      '<g fill="#232833">' +
        '<rect x="70" y="32" width="150" height="7" rx="3.5"/>' +
        '<rect x="70" y="52" width="150" height="7" rx="3.5"/>' +
        '<rect x="70" y="72" width="150" height="7" rx="3.5"/>' +
        '<rect x="70" y="92" width="150" height="7" rx="3.5"/>' +
      '</g>' +
      '<rect x="70" y="32" width="150" height="7" rx="3.5" fill="#1D4ED8"/>' +
      '<rect x="70" y="52" width="115" height="7" rx="3.5" fill="#2563EB"/>' +
      '<rect x="70" y="72" width="72" height="7" rx="3.5" fill="#60A5FA"/>' +
      '<rect x="70" y="92" width="28" height="7" rx="3.5" fill="#93C5FD"/>' +
      '<rect x="14" y="110" width="58" height="14" rx="5" fill="#1D4ED8"/>' +
      '<text x="24" y="120" font-family="DQ Mono, monospace" font-size="7" fill="#FFFFFF">SHA-256</text>' +
      '<rect x="80" y="110" width="74" height="14" rx="5" fill="#181B20" stroke="#2B3140"/>' +
      '<text x="88" y="120" font-family="DQ Mono, monospace" font-size="7" fill="#94A3B8">NTFS · SQLite</text>'
    ),

    brave: janela('brave-neural-reader',
      '<rect x="46" y="24" width="148" height="100" rx="10" fill="#181B20" stroke="#2B3140"/>' +
      '<rect x="58" y="34" width="60" height="6" rx="3" fill="#F8FAFC"/>' +
      '<rect x="58" y="44" width="92" height="4" rx="2" fill="#475569"/>' +
      '<g fill="#60A5FA">' +
        '<rect x="60"  y="72" width="4" height="12" rx="2"/><rect x="68"  y="64" width="4" height="28" rx="2"/>' +
        '<rect x="76"  y="56" width="4" height="44" rx="2"/><rect x="84"  y="68" width="4" height="20" rx="2"/>' +
        '<rect x="92"  y="60" width="4" height="36" rx="2"/><rect x="100" y="72" width="4" height="12" rx="2"/>' +
        '<rect x="108" y="62" width="4" height="32" rx="2"/><rect x="116" y="54" width="4" height="48" rx="2"/>' +
        '<rect x="124" y="66" width="4" height="24" rx="2"/><rect x="132" y="74" width="4" height="8" rx="2"/>' +
        '<rect x="140" y="64" width="4" height="28" rx="2"/><rect x="148" y="72" width="4" height="12" rx="2"/>' +
        '<rect x="156" y="66" width="4" height="24" rx="2"/><rect x="164" y="74" width="4" height="8" rx="2"/>' +
      '</g>' +
      '<circle cx="112" cy="110" r="8" fill="#1D4ED8"/>' +
      '<path d="M109.5 106 L109.5 114 L116 110 Z" fill="#FFFFFF"/>' +
      '<rect x="140" y="104" width="42" height="12" rx="6" fill="rgba(34,197,94,0.12)" stroke="#166534"/>' +
      '<text x="147" y="112.5" font-family="DQ Mono, monospace" font-size="6" fill="#86EFAC">offline</text>'
    ),

    clinica: janela('sistema-clinico',
      '<rect x="82" y="22" width="76" height="104" rx="12" fill="#181B20" stroke="#2B3140"/>' +
      '<rect x="108" y="26" width="24" height="4" rx="2" fill="#2B3140"/>' +
      '<rect x="90" y="36" width="60" height="12" rx="6" fill="rgba(34,197,94,0.12)" stroke="#166534"/>' +
      '<text x="100" y="45" font-family="DQ Mono, monospace" font-size="6" fill="#86EFAC">● offline</text>' +
      '<rect x="90" y="54" width="60" height="16" rx="5" fill="#1D4ED8"/>' +
      '<rect x="95" y="59" width="30" height="3" rx="1.5" fill="#FFFFFF"/>' +
      '<rect x="95" y="64" width="18" height="2" rx="1" fill="#BFDBFE"/>' +
      '<rect x="90" y="74" width="60" height="16" rx="5" fill="#0B0E14" stroke="#2B3140"/>' +
      '<rect x="95" y="79" width="30" height="3" rx="1.5" fill="#F8FAFC"/>' +
      '<rect x="95" y="84" width="18" height="2" rx="1" fill="#475569"/>' +
      '<rect x="90" y="94" width="60" height="16" rx="5" fill="#0B0E14" stroke="#2B3140"/>' +
      '<rect x="95" y="99" width="30" height="3" rx="1.5" fill="#F8FAFC"/>' +
      '<rect x="95" y="104" width="18" height="2" rx="1" fill="#475569"/>' +
      '<rect x="90" y="113" width="60" height="9" rx="4.5" fill="#2563EB"/>' +
      '<g fill="none" stroke="#60A5FA" stroke-width="1.6">' +
        '<path d="M180 62 C196 62 196 84 180 84"/><path d="M180 84 L185 80 M180 84 L185 88"/>' +
        '<path d="M60 84 C44 84 44 62 60 62"/><path d="M60 62 L55 58 M60 62 L55 66"/>' +
      '</g>'
    ),

    reversa: janela('pipeline.py',
      '<g font-family="DQ Mono, monospace" font-size="7.2">' +
        '<text x="12" y="36" fill="#60A5FA">1</text><text x="26" y="36" fill="#F8FAFC">extrair(strings)</text>' +
        '<text x="12" y="52" fill="#60A5FA">2</text><text x="26" y="52" fill="#F8FAFC">traduzir(idiomas=5)</text>' +
        '<text x="12" y="68" fill="#60A5FA">3</text><text x="26" y="68" fill="#F8FAFC">auditar(fontes)</text>' +
        '<text x="12" y="84" fill="#60A5FA">4</text><text x="26" y="84" fill="#F8FAFC">reinjetar(strings)</text>' +
      '</g>' +
      '<rect x="12" y="100" width="48" height="14" rx="5" fill="#1D4ED8"/>' +
      '<text x="20" y="110" font-family="DQ Mono, monospace" font-size="7" fill="#FFFFFF">i18n × 5</text>' +
      '<rect x="68" y="100" width="82" height="14" rx="5" fill="#181B20" stroke="#2B3140"/>' +
      '<text x="75" y="110" font-family="DQ Mono, monospace" font-size="7" fill="#94A3B8">Android WebView</text>'
    )
  };

  /* ===== Dados de cada projeto (metricas apenas do conteudo do curriculo) ===== */
  var PROJETOS = {
    mindnote: {
      titulo: 'MindNote Engine', chip: CHIP_PRIVADO, foot: FOOT_PRIVADO,
      metricas: [['SVG + PDF', 'exportação calibrada'], ['S Pen', 'escrita contínua'], ['Regressão', 'testes no núcleo']]
    },
    canon: {
      titulo: 'CANON', chip: CHIP_PUBLICO, foot: FOOT_PUBLICO,
      metricas: [['14 ADRs', 'decisões documentadas'], ['3 APIs', 'AniList · TMDB · RAWG'], ['PNG + MP4', 'gerados no navegador']]
    },
    storage: {
      titulo: 'Storage Auditor &amp; Safe Mover', chip: CHIP_PRIVADO, foot: FOOT_PRIVADO,
      metricas: [['4 estágios', 'dedup SHA-256'], ['NTFS', 'auditoria de disco'], ['Atômico', 'sem perda de dados']]
    },
    brave: {
      titulo: 'Brave Neural Reader', chip: CHIP_PRIVADO, foot: FOOT_PRIVADO,
      metricas: [['&lt; 850 ms', 'tempo de resposta'], ['100%', 'offline · local'], ['pt-BR', 'voz neural Piper']]
    },
    clinica: {
      titulo: 'Sistema Clínico Local-First', chip: CHIP_PRIVADO, foot: FOOT_PRIVADO,
      metricas: [['Offline', 'first · PWA'], ['LGPD', 'conformidade'], ['PostgreSQL', '+ IndexedDB']]
    },
    reversa: {
      titulo: 'Localização &amp; Eng. Reversa', chip: CHIP_PRIVADO, foot: FOOT_PRIVADO,
      metricas: [['5 idiomas', 'tradução automatizada'], ['WebView', 'apps Android híbridos'], ['4 etapas', 'extrair → reinjetar']]
    }
  };

  /* ===== Regras de ativacao ===== */
  function efeitoAtivo() {
    if (window.matchMedia('print').matches) return false;
    var estreita = window.matchMedia('(max-width: 767px)').matches;
    var touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    return !(estreita && touch);
  }

  /* ===== Renderizacao ===== */
  function render(id) {
    var p = PROJETOS[id];
    if (!p) return false;
    var metricas = p.metricas.map(function (m) {
      return '<div class="preview__metric"><strong>' + m[0] + '</strong><span>' + m[1] + '</span></div>';
    }).join('');

    preview.innerHTML =
      '<div class="preview__head">' +
        '<h4 class="preview__title">' + p.titulo + '</h4>' +
        '<span class="preview__chip">' + p.chip + '</span>' +
      '</div>' +
      '<div class="preview__mock">' + MOCKUPS[id] + '</div>' +
      '<div class="preview__metrics">' + metricas + '</div>' +
      '<div class="preview__foot">' + p.foot + '</div>';
    return true;
  }

  /* ===== Posicionamento: direita, esquerda, acima, abaixo; sempre dentro da janela ===== */
  function posicionar(card) {
    var r = card.getBoundingClientRect();
    var w = preview.offsetWidth;
    var h = preview.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    function cabe(x, y) {
      return x >= MARGEM && y >= MARGEM && x + w <= vw - MARGEM && y + h <= vh - MARGEM;
    }
    function limitar(v, min, max) { return Math.max(min, Math.min(v, max)); }

    var yAlinhado = limitar(r.top, MARGEM, vh - h - MARGEM);
    var xAlinhado = limitar(r.left, MARGEM, vw - w - MARGEM);

    var candidatos = [
      [r.right + GAP, yAlinhado],
      [r.left - w - GAP, yAlinhado],
      [xAlinhado, r.top - h - GAP],
      [xAlinhado, r.bottom + GAP]
    ];

    var escolhido = null;
    for (var i = 0; i < candidatos.length; i++) {
      if (cabe(candidatos[i][0], candidatos[i][1])) { escolhido = candidatos[i]; break; }
    }
    if (!escolhido) {
      escolhido = [
        limitar(r.right - w, MARGEM, vw - w - MARGEM),
        limitar(r.top - h - GAP, MARGEM, vh - h - MARGEM)
      ];
    }
    preview.style.transform = 'translate(' + Math.round(escolhido[0]) + 'px,' + Math.round(escolhido[1]) + 'px)';
  }

  /* ===== Mostrar / ocultar ===== */
  function mostrar(card) {
    if (!efeitoAtivo()) return;
    if (!render(card.getAttribute('data-project'))) return;

    if (ativo && ativo !== card) ativo.removeAttribute('aria-describedby');
    ativo = card;
    card.setAttribute('aria-describedby', preview.id);

    preview.setAttribute('aria-hidden', 'false');
    posicionar(card);
    preview.classList.add('is-visible');
  }

  function ocultar() {
    preview.classList.remove('is-visible');
    preview.setAttribute('aria-hidden', 'true');
    if (ativo) {
      ativo.removeAttribute('aria-describedby');
      ativo = null;
    }
  }

  /* ===== Eventos nos cards ===== */
  cards.forEach(function (card) {
    card.addEventListener('mouseenter', function () { mostrar(card); });
    card.addEventListener('mouseleave', ocultar);
    card.addEventListener('focusin', function () { mostrar(card); });
    card.addEventListener('focusout', function (e) {
      if (!card.contains(e.relatedTarget)) ocultar();
    });
  });

  /* ===== Eventos globais ===== */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') ocultar();
  });

  window.addEventListener('scroll', function () { if (ativo) posicionar(ativo); }, { passive: true });
  window.addEventListener('resize', function () {
    if (!efeitoAtivo()) { ocultar(); return; }
    if (ativo) posicionar(ativo);
  });

  /* ===== Impressao ===== */
  window.addEventListener('beforeprint', ocultar);
  var mqPrint = window.matchMedia('print');
  var aoMudarPrint = function (e) { if (e.matches) ocultar(); };
  if (mqPrint.addEventListener) mqPrint.addEventListener('change', aoMudarPrint);
  else if (mqPrint.addListener) mqPrint.addListener(aoMudarPrint);
})();