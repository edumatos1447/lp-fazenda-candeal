// ─── Configuração de períodos disponíveis ─────────────────────────────────────
// Edite este arquivo para adicionar, remover ou alterar as datas disponíveis.
//
// tipo: 'feriado' | 'fim_de_semana' | 'temporada' (usado só para exibição interna)
// preco_casal_standard / preco_casal_mezanino: use 0 para não exibir preço
// vagas_disponiveis: exibe "Últimas vagas!" quando <= 3

export interface Period {
  periodo_id: string;
  nome: string;
  tipo: string;
  data_entrada: string;  // YYYY-MM-DD
  hora_entrada: string;  // HH:mm
  data_saida: string;    // YYYY-MM-DD
  hora_saida: string;    // HH:mm
  num_diarias: number;
  preco_casal_standard: number;
  preco_casal_mezanino: number;
  preco_crianca: number;
  preco_extra: number;
  vagas_disponiveis: number;
}

export const periodos: Period[] = [
  {
    periodo_id: 'bye-bye-ferias-jul-2026',
    nome: 'Bye Bye Férias',
    tipo: 'feriado',
    data_entrada: '2026-07-10',
    hora_entrada: '14:00',
    data_saida: '2026-07-12',
    hora_saida: '12:00',
    num_diarias: 3,
    preco_casal_standard: 0,
    preco_casal_mezanino: 0,
    preco_crianca: 0,
    preco_extra: 0,
    vagas_disponiveis: 8,
  },
  {
    periodo_id: 'dia-dos-pais-ago-2026',
    nome: 'Dia dos Pais',
    tipo: 'feriado',
    data_entrada: '2026-08-07',
    hora_entrada: '14:00',
    data_saida: '2026-08-09',
    hora_saida: '12:00',
    num_diarias: 3,
    preco_casal_standard: 0,
    preco_casal_mezanino: 0,
    preco_crianca: 0,
    preco_extra: 0,
    vagas_disponiveis: 8,
  },
  {
    periodo_id: 'festival-inverno-ago-2026',
    nome: 'Festival de Inverno',
    tipo: 'feriado',
    data_entrada: '2026-08-21',
    hora_entrada: '14:00',
    data_saida: '2026-08-23',
    hora_saida: '12:00',
    num_diarias: 3,
    preco_casal_standard: 0,
    preco_casal_mezanino: 0,
    preco_crianca: 0,
    preco_extra: 0,
    vagas_disponiveis: 8,
  },
];
