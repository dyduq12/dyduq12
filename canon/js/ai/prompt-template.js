/**
 * Standardized AI prompt generator synchronized with js/core/schema.js constants.
 */

import { CRITERIA_KEYS, WORK_STATUSES, WORK_TYPES } from '../core/schema.js';

const MAX_TAG_ITEMS = 6;
const MAX_TAG_CHARS = 40;

const CRITERIA_LABELS = Object.freeze({
  historia: 'História',
  gameplay_ritmo: 'Gameplay/Ritmo',
  graficos_fotografia: 'Gráficos/Fotografia',
  trilha: 'Trilha Sonora'
});

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
    historia: 9.5,
    gameplay_ritmo: 9.0,
    graficos_fotografia: 9.5,
    trilha: 9.5
  },
  pros: [
    'Ritmo contemplativo',
    'Luto e passagem do tempo',
    'Animação expressiva'
  ],
  cons: [
    'Início lento',
    'Poucas cenas de ação'
  ],
  status: 'completed',
  verdict: 'Fantasia melancólica rara sobre memória, vínculo e legado.'
});

/**
 * Generates the standard Portuguese prompt instructing an external AI to output one valid CANON JSON block.
 * Derived directly from schema.js constants so types, statuses, and the 4 active criteria stay synchronized.
 * The overall score is never requested: the system computes it from the mean of the 4 criteria.
 * @returns {string}
 */
export function buildAiPromptTemplate() {
  const typesList = WORK_TYPES.join(', ');
  const statusesList = WORK_STATUSES.join(', ');
  const criteriaCount = CRITERIA_KEYS.length;
  const criteriaKeysList = CRITERIA_KEYS.join(', ');
  const criteriaLabelsList = CRITERIA_KEYS.map(
    (key) => `${CRITERIA_LABELS[key] ?? key} (${key})`
  ).join('; ');
  const exampleJson = JSON.stringify(EXAMPLE_PAYLOAD, null, 2);

  return [
    'Quero registrar a obra abaixo no meu catálogo CANON a partir das minhas impressões.',
    '',
    'REGRAS OBRIGATÓRIAS DE RESPOSTA:',
    '1. Responda SOMENTE com UM único bloco de código JSON (delimitado por crases triplas com marcação json), sem texto antes ou depois.',
    `2. O campo "type" deve ser exatamente um destes valores: ${typesList}.`,
    `3. O campo "status" deve ser exatamente um destes valores: ${statusesList}.`,
    `4. O objeto "scores" deve conter EXATAMENTE as ${criteriaCount} chaves: ${criteriaKeysList}. Correspondem a: ${criteriaLabelsList}. Não inclua nenhuma outra chave em "scores".`,
    '5. Todas as notas devem estar entre 0 e 10 em passos de 0,5 (use ponto decimal no JSON, ex.: 8.5).',
    `6. A Nota Geral é calculada automaticamente pelo sistema como a média aritmética das ${criteriaCount} notas acima: NÃO envie nota geral.`,
    `7. Escreva "pros" e "cons" como tags curtas e objetivas (2 a 5 palavras, no máximo ${MAX_TAG_CHARS} caracteres cada), com NO MÁXIMO ${MAX_TAG_ITEMS} itens por lista, para caberem com folga no verso do card.`,
    '8. NÃO invente dados factuais (ano, gênero, estúdio/desenvolvedora, direção, trilha ou elenco): se não tiver certeza, deixe como string vazia "" (ou null para "year").',
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
