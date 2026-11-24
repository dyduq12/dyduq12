/**
 * Standardized AI prompt generator synchronized with js/core/schema.js constants.
 */

import { SCORE_KEYS, WORK_STATUSES, WORK_TYPES } from '../core/schema.js';

const EXAMPLE_PAYLOAD = Object.freeze({
  type: 'anime',
  title: 'Frieren: Beyond Journey\'s End',
  year: 2023,
  genre: 'Fantasia, Aventura, Drama',
  studio: 'Madhouse',
  director: 'Keiichiro Saito',
  soundtrack: 'Evan Call',
  starring: '',
  scores: {
    geral: 9.5,
    historia: 9.5,
    gameplay_ritmo: 9.0,
    graficos_fotografia: 9.5,
    trilha: 9.5,
    direcao_arte: 9.5
  },
  pros: [
    'Ritmo contemplativo que valoriza o luto e a passagem do tempo',
    'Direção de animação expressiva mesmo em cenas cotidianas'
  ],
  cons: [
    'Início lento pode exigir paciência nos primeiros episódios'
  ],
  status: 'completed',
  verdict: 'Fantasia melancólica rara sobre memória, vínculo e legado.'
});

/**
 * Generates the standard Portuguese prompt instructing an external AI to output one valid CANON JSON block.
 * Derived directly from schema.js constants so types, statuses, and score keys stay synchronized.
 * @returns {string}
 */
export function buildAiPromptTemplate() {
  const typesList = WORK_TYPES.join(', ');
  const statusesList = WORK_STATUSES.join(', ');
  const scoreKeysList = SCORE_KEYS.join(', ');
  const exampleJson = JSON.stringify(EXAMPLE_PAYLOAD, null, 2);

  return [
    'Quero registrar a obra abaixo no meu catálogo CANON a partir das minhas impressões.',
    '',
    'REGRAS OBRIGATÓRIAS DE RESPOSTA:',
    '1. Responda SOMENTE com UM único bloco de código JSON (delimitado por crases triplas com marcação json), sem texto antes ou depois.',
    `2. O campo "type" deve ser exatamente um destes valores: ${typesList}.`,
    `3. O campo "status" deve ser exatamente um destes valores: ${statusesList}.`,
    `4. O objeto "scores" deve conter TODAS as 6 chaves exatas: ${scoreKeysList}.`,
    '5. Todas as notas devem estar entre 0 e 10 em passos de 0,5 (use ponto decimal no JSON, ex.: 8.5).',
    '6. Escreva "pros" e "cons" como listas de frases curtas e diretas (máximo 8 itens cada).',
    '7. NÃO invente dados factuais (ano, gênero, estúdio/desenvolvedora, direção, trilha ou elenco): se não tiver certeza, deixe como string vazia "" (ou null para "year").',
    '',
    'EXEMPLO COMPLETO E VÁLIDO:',
    '```json',
    exampleJson,
    '```',
    '',
    'Agora analise minhas impressões a seguir e devolva apenas o bloco JSON:'
  ].join('\n');
}

export const getAiPromptTemplate = buildAiPromptTemplate;
