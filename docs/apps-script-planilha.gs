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
 */

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
  'UTM Campaign':     function (d) { return d.utm_campaign; }
};

var ORDEM = [
  'Data/Hora', 'Origem', 'Nome', 'Telefone', 'Email', 'Escola',
  'Período', 'Entrada', 'Saída', 'Diárias',
  'Adultos', 'Crianças', 'Idades Crianças',
  'Acomodação', 'Observações', 'Restrições',
  'UTM Source', 'UTM Medium', 'UTM Campaign'
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
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
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

// Sanidade: abrir a URL do webhook no navegador deve responder {"ok":true}.
function doGet() {
  return json_({ ok: true, colunas: ORDEM.length });
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
