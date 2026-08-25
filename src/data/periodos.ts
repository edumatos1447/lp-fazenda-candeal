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
    periodo_id: 'feriado-independencia-set-2026',
    nome: 'Feriado da Independência',
    tipo: 'feriado',
    data_entrada: '2026-09-04',
    hora_entrada: '14:00',
    data_saida: '2026-09-07',
    hora_saida: '12:00',
    num_diarias: 3,
    preco_casal_standard: 972,
    preco_casal_mezanino: 1079,
    preco_crianca: 218,
    preco_extra: 364,
    vagas_disponiveis: 8,
  },
  {
    periodo_id: 'fim-de-semana-fazenda-set-18-2026',
    nome: 'Fim de Semana na Fazenda',
    tipo: 'fim_de_semana',
    data_entrada: '2026-09-18',
    hora_entrada: '14:00',
    data_saida: '2026-09-20',
    hora_saida: '12:00',
    num_diarias: 2,
    preco_casal_standard: 972,
    preco_casal_mezanino: 1079,
    preco_crianca: 218,
    preco_extra: 364,
    vagas_disponiveis: 8,
  },
  {
    periodo_id: 'fim-de-semana-fazenda-set-25-2026',
    nome: 'Fim de Semana na Fazenda',
    tipo: 'fim_de_semana',
    data_entrada: '2026-09-25',
    hora_entrada: '14:00',
    data_saida: '2026-09-27',
    hora_saida: '12:00',
    num_diarias: 2,
    preco_casal_standard: 972,
    preco_casal_mezanino: 1079,
    preco_crianca: 218,
    preco_extra: 364,
    vagas_disponiveis: 8,
  },
];
