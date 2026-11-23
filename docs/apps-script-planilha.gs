/**
 * Webhook de leads da LP Fazenda Hotel Candeal → Google Sheets.
 *
 * Publicação: Implantar > Nova implantação > App da Web
 *   Executar como: Eu  |  Quem tem acesso: Qualquer pessoa
 * A URL gerada vai em PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL (.env da LP).
 *
 * IMPORTANTE ao atualizar este código: use "Gerenciar implantações >
 * editar (lápis) > Versão: Nova versão". Criar uma implantação nova gera
 * outra URL e a LP para de escrever na planilha.
 *
 * Este script faz duas coisas:
 *   1. doPost: grava cada lead na aba de leads (a primeira aba que não é "Datas").
 *   2. doGet ?acao=datas: entrega à LP as datas de hotelaria da aba "Datas",
 *      que o dono do hotel edita. A LP lê essa aba a cada visita.
 *
 * Primeira vez: rode a função criarAbaDatas() uma vez pelo editor
 * (selecione no menu ao lado de "Executar"). Ela cria e formata a aba.
 */

var ABA_DATAS = 'Datas';

// ─── Colunas ────────────────────────────────────────────────────────────────
// Ordem usada apenas quando a planilha está vazia. Em planilha que já tem
// dados, colunas ausentes são acrescentadas à DIREITA do cabeçalho atual e as
// linhas são montadas seguindo o cabeçalho real — o histórico nunca desalinha.

var CAMPOS = {
  'Data/Hora':        function (d) { return d.timestamp ? new Date(d.timestamp).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR'); },
  'Origem':           function (d) { return rotuloOrigem_(d.tipo); },
  'Nome':             function (d) { return d.nome; },
  'Telefone':         function (d) { return d.telefone; },
  'Email':            function (d) { return d.email; },
  'Escola':           function (d) { return d.escola; },
  'Período':          function (d) { return d.periodo; },
  'Entrada':          function (d) { return d.data_entrada; },
  'Saída':            function (d) { return d.data_saida; },
  'Diárias':          function (d) { return d.num_diarias; },
  'Adultos':          function (d) { return d.adultos; },
  'Crianças':         function (d) { return d.criancas; },
  'Idades Crianças':  function (d) { return d.idades_criancas; },
  'Acomodação':       function (d) { return d.tipo_acomodacao; },
  'Observações':      function (d) { return d.observacoes; },
  'Restrições':       function (d) { return d.restricoes; },
  'UTM Source':       function (d) { return d.utm_source; },
  'UTM Medium':       function (d) { return d.utm_medium; },
  'UTM Campaign':     function (d) { return d.utm_campaign; },  // Meta: nome da campanha
  'Conjunto':         function (d) { return d.utm_term; },      // Meta: nome do conjunto
  'Anúncio':          function (d) { return d.utm_content; },   // Meta: nome do anúncio
  'ID da Campanha':   function (d) { return d.utm_id; }
};

var ORDEM = [
  'Data/Hora', 'Origem', 'Nome', 'Telefone', 'Email', 'Escola',
  'Período', 'Entrada', 'Saída', 'Diárias',
  'Adultos', 'Crianças', 'Idades Crianças',
  'Acomodação', 'Observações', 'Restrições',
  'UTM Source', 'UTM Medium', 'UTM Campaign',
  'Conjunto', 'Anúncio', 'ID da Campanha'
];

// Rótulos legíveis para o campo `tipo` enviado pela LP.
var ROTULOS_ORIGEM = {
  'formulario_hotelaria': 'Formulário — Hotelaria',
  'formulario_day_use':   'Formulário — Day Use',
  'day_use_escolar':      'Day Use Escolar',
  'day_use':              'Day Use',
  'whatsapp_flutuante':   'Botão flutuante',
  'whatsapp_direto':      'WhatsApp (hero/menu/rodapé)'
};

function rotuloOrigem_(tipo) {
  if (!tipo) return '';
  return ROTULOS_ORIGEM[tipo] || tipo;
}

// ─── Webhook ────────────────────────────────────────────────────────────────

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // dois leads simultâneos não podem escrever na mesma linha

  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = abaDeLeads_();
    var cabecalho = sincronizarCabecalho_(sheet);

    sheet.appendRow(cabecalho.map(function (coluna) {
      var campo = CAMPOS[coluna];
      if (!campo) return ''; // coluna manual criada na planilha: preserva vazia
      var valor = campo(data);
      return (valor === 0 || valor) ? valor : '';
    }));

    return json_({ ok: true });
  } catch (err) {
    return json_({ error: err.message });
  } finally {
    lock.releaseLock();
  }
}

// Sem parâmetro: sanidade, abrir a URL no navegador deve responder {"ok":true}.
// ?acao=datas: datas de hotelaria para a LP.
function doGet(e) {
  var acao = e && e.parameter ? e.parameter.acao : '';
  if (acao === 'datas') {
    try {
      return json_(lerDatas_());
    } catch (err) {
      return json_({ error: err.message });
    }
  }
  return json_({ ok: true, colunas: ORDEM.length });
}

/**
 * Aba onde os leads são gravados: a primeira que não é a de datas.
 * Antes era getActiveSheet(), que num web app é sempre a primeira aba; o
 * filtro mantém isso e impede que um lead caia na aba "Datas" caso ela seja
 * arrastada para o começo.
 */
function abaDeLeads_() {
  var abas = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < abas.length; i++) {
    if (abas[i].getName() !== ABA_DATAS) return abas[i];
  }
  throw new Error('Nenhuma aba de leads encontrada.');
}

// ─── Aba "Datas" ────────────────────────────────────────────────────────────
// O dono do hotel edita esta aba; a LP mostra só linhas ativas cuja entrada
// é hoje ou depois. Linha com data inválida, saída antes da entrada ou sem
// nome é ignorada em vez de quebrar a página.

var COLUNAS_DATAS = [
  'Pacote', 'Entrada', 'Saída',
  'Preço Casal Standard', 'Preço Casal Mezanino', 'Preço Criança', 'Preço Adulto Extra',
  'Vagas', 'Ativo'
];

var CACHE_DATAS = 'datas';
var CACHE_SEGUNDOS = 60; // edições na aba já limpam o cache (onEdit); isto é só o teto

function lerDatas_() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get(CACHE_DATAS);
  if (guardado) return JSON.parse(guardado);

  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName(ABA_DATAS);
  if (!aba) throw new Error('Aba "' + ABA_DATAS + '" não encontrada. Rode criarAbaDatas().');

  var fuso = planilha.getSpreadsheetTimeZone();
  var hoje = Utilities.formatDate(new Date(), fuso, 'yyyy-MM-dd');

  var linhas = aba.getDataRange().getValues();
  var cabecalho = linhas.shift().map(function (c) { return String(c).trim(); });
  var col = function (linha, nome) {
    var i = cabecalho.indexOf(nome);
    return i === -1 ? '' : linha[i];
  };

  var periodos = [];
  linhas.forEach(function (linha) {
    var nome = String(col(linha, 'Pacote')).trim();
    var entrada = dataIso_(col(linha, 'Entrada'), fuso);
    var saida = dataIso_(col(linha, 'Saída'), fuso);
    if (!nome || !entrada || !saida || saida <= entrada) return;
    if (!ativo_(col(linha, 'Ativo'))) return;
    if (entrada < hoje) return;

    periodos.push({
      periodo_id: 'pacote-' + entrada + '-' + slug_(nome),
      nome: nome,
      tipo: 'pacote',
      data_entrada: entrada,
      hora_entrada: '14:00',
      data_saida: saida,
      hora_saida: '12:00',
      num_diarias: diasEntre_(entrada, saida),
      preco_casal_standard: numero_(col(linha, 'Preço Casal Standard'), 0),
      preco_casal_mezanino: numero_(col(linha, 'Preço Casal Mezanino'), 0),
      preco_crianca: numero_(col(linha, 'Preço Criança'), 0),
      preco_extra: numero_(col(linha, 'Preço Adulto Extra'), 0),
      vagas_disponiveis: numero_(col(linha, 'Vagas'), 99) // vazio = sem aviso de "últimas vagas"
    });
  });

  periodos.sort(function (a, b) { return a.data_entrada < b.data_entrada ? -1 : 1; });

  var resposta = { ok: true, periodos: periodos };
  cache.put(CACHE_DATAS, JSON.stringify(resposta), CACHE_SEGUNDOS);
  return resposta;
}

/** Aceita célula de data do Sheets, "dd/mm/aaaa" ou "aaaa-mm-dd". */
function dataIso_(valor, fuso) {
  if (valor instanceof Date) {
    return isNaN(valor.getTime()) ? '' : Utilities.formatDate(valor, fuso, 'yyyy-MM-dd');
  }
  var texto = String(valor).trim();
  var br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) texto = br[3] + '-' + ('0' + br[2]).slice(-2) + '-' + ('0' + br[1]).slice(-2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return '';
  var p = texto.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  // Rejeita 31/02 e afins, que o Date "corrige" para outro dia
  return d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2] ? texto : '';
}

function diasEntre_(entrada, saida) {
  var a = entrada.split('-').map(Number);
  var b = saida.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

/** Caixa de seleção desmarcada ou "não" = inativo. Célula vazia = ativo. */
function ativo_(valor) {
  if (valor === false) return false;
  var texto = String(valor).trim().toLowerCase();
  return ['não', 'nao', 'n', 'false', 'falso', '0'].indexOf(texto) === -1;
}

/** Aceita número ou texto tipo "R$ 1.079,00". */
function numero_(valor, padrao) {
  if (typeof valor === 'number') return valor;
  var texto = String(valor).replace(/[^\d,.-]/g, '');
  if (!texto) return padrao;
  if (texto.indexOf(',') !== -1) texto = texto.replace(/\./g, '').replace(',', '.');
  var n = Number(texto);
  return isNaN(n) ? padrao : n;
}

function slug_(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Gatilho simples: editar a aba "Datas" invalida o cache na hora. */
function onEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === ABA_DATAS) {
    CacheService.getScriptCache().remove(CACHE_DATAS);
  }
}

/**
 * Rode uma vez pelo editor. Cria a aba "Datas" formatada (datas, moeda,
 * caixa de seleção em "Ativo") já com as datas que estavam na LP.
 * Se a aba já existir, não mexe em nada.
 */
function criarAbaDatas() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  if (planilha.getSheetByName(ABA_DATAS)) {
    SpreadsheetApp.getUi().alert('A aba "' + ABA_DATAS + '" já existe. Nada foi alterado.');
    return;
  }

  var aba = planilha.insertSheet(ABA_DATAS, planilha.getSheets().length); // sempre no fim
  var LINHAS = 100;

  aba.getRange(1, 1, 1, COLUNAS_DATAS.length).setValues([COLUNAS_DATAS])
    .setFontWeight('bold').setBackground('#e8f0ec');
  aba.setFrozenRows(1);

  var inicial = [
    ['Dia Nacional do Forró',   new Date(2026, 11, 11), new Date(2026, 11, 13), 972, 1079, 218, 364, 8, true],
    ['Imersão na Agroecologia', new Date(2026, 11, 18), new Date(2026, 11, 20), 972, 1079, 218, 364, 8, true]
  ];
  aba.getRange(2, 1, inicial.length, COLUNAS_DATAS.length).setValues(inicial);

  var soData = SpreadsheetApp.newDataValidation().requireDate()
    .setAllowInvalid(false).setHelpText('Digite uma data, ex.: 11/12/2026').build();
  aba.getRange(2, 2, LINHAS, 2).setNumberFormat('dd/mm/yyyy').setDataValidation(soData);
  aba.getRange(2, 4, LINHAS, 4).setNumberFormat('"R$" #,##0.00');
  aba.getRange(2, 8, LINHAS, 1).setNumberFormat('0');
  aba.getRange(2, 9, LINHAS, 1).insertCheckboxes();
  aba.getRange(2, 9, inicial.length, 1).check();

  aba.setColumnWidth(1, 240);
  aba.autoResizeColumns(2, COLUNAS_DATAS.length - 1);

  aba.getRange(LINHAS + 3, 1).setValue(
    'Como usar: uma linha por pacote. Desmarque "Ativo" para tirar da LP sem apagar. ' +
    'Datas que já passaram somem sozinhas. Preço vazio = valor não aparece no resumo. ' +
    'Vagas vazio = sem aviso de "Últimas vagas" (aparece com 3 ou menos).'
  ).setFontStyle('italic').setFontColor('#666666');
}

/**
 * Garante que toda coluna de ORDEM exista no cabeçalho e devolve o cabeçalho
 * real da planilha, na ordem real. Colunas novas entram no fim.
 */
function sincronizarCabecalho_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(ORDEM);
    sheet.getRange(1, 1, 1, ORDEM.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return ORDEM;
  }

  var atual = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  while (atual.length && atual[atual.length - 1] === '') atual.pop();

  var faltando = ORDEM.filter(function (nome) { return atual.indexOf(nome) === -1; });
  if (faltando.length) {
    sheet.getRange(1, atual.length + 1, 1, faltando.length)
      .setValues([faltando])
      .setFontWeight('bold');
    atual = atual.concat(faltando);
  }

  return atual;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
