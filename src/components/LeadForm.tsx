import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Period } from '../data/periodos';

type TipoAcomodacao = 'standard' | 'mezanino_bangalo' | 'sem_preferencia';
type FormStatus = 'idle' | 'loading' | 'success' | 'error' | 'no_vacancies';
type Category = 'hotelaria' | 'day_use';

interface Props {
  apiBase: string;
  whatsappNumber: string;
  sheetsWebhookUrl?: string;
  staticPeriods?: Period[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function buildWhatsAppMessage(
  period: Period,
  nome: string,
  telefone: string,
  email: string,
  qtdAdultos: number,
  qtdCriancas: number,
  idadesCriancas: number[],
  tipoAcomodacao: TipoAcomodacao,
  observacoes: string,
  restricoes: string,
  totalEstimado?: number | null,
) {
  const criancasText =
    qtdCriancas > 0
      ? `${qtdCriancas} (idades: ${idadesCriancas.join(', ')} anos)`
      : '0';

  const tipoLabel: Record<TipoAcomodacao, string> = {
    standard: 'Standard',
    mezanino_bangalo: 'Mezanino / Bangalô',
    sem_preferencia: 'Sem preferência',
  };

  return [
    '[Site] Olá! Tenho interesse em fazer uma reserva na Fazenda Hotel Candeal.',
    '',
    `*Período:* ${period.nome} (${formatDate(period.data_entrada)} a ${formatDate(period.data_saida)} · ${period.num_diarias} diária${period.num_diarias !== 1 ? 's' : ''})`,
    `*Nome:* ${nome}`,
    `*Telefone:* ${telefone}`,
    `*E-mail:* ${email}`,
    `*Adultos:* ${qtdAdultos}`,
    `*Crianças:* ${criancasText}`,
    period.tipo !== 'day_use' ? `*Acomodação preferida:* ${tipoLabel[tipoAcomodacao]}` : null,
    totalEstimado ? `*Valor estimado:* ${formatCurrency(totalEstimado)}` : null,
    observacoes ? `*Observações:* ${observacoes}` : null,
    restricoes ? `*Restrições alimentares:* ${restricoes}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

// ─── Cálculo de valor estimado ────────────────────────────────────────────────

function calcularResumo(
  tipoAcomodacao: TipoAcomodacao,
  qtdAdultos: number,
  idadesCriancas: number[],
  period: Period,
): { itens: { descricao: string; valor: number }[]; total: number } | null {
  if (tipoAcomodacao === 'sem_preferencia') return null;

  const basePrice =
    tipoAcomodacao === 'standard'
      ? period.preco_casal_standard
      : period.preco_casal_mezanino;

  if (!basePrice) return null;

  const numDiarias = period.num_diarias;
  const tipoLabel = tipoAcomodacao === 'standard' ? 'Standard' : 'Mezanino/Bangalô';
  const itens: { descricao: string; valor: number }[] = [];

  itens.push({
    descricao: `${numDiarias} diária${numDiarias !== 1 ? 's' : ''} (casal) — ${tipoLabel}`,
    valor: basePrice * numDiarias,
  });

  const extraAdults = Math.max(0, qtdAdultos - 2);
  if (extraAdults > 0) {
    itens.push({
      descricao: `${extraAdults} adulto${extraAdults > 1 ? 's' : ''} extra`,
      valor: extraAdults * period.preco_extra * numDiarias,
    });
  }

  for (let i = 0; i < idadesCriancas.length; i++) {
    const idade = idadesCriancas[i];
    if (idade >= 12) {
      itens.push({
        descricao: `Criança ${i + 1} (${idade} anos) — adulto extra`,
        valor: period.preco_extra * numDiarias,
      });
    } else if (idade >= 5) {
      itens.push({
        descricao: `Criança ${i + 1} (${idade} anos)`,
        valor: period.preco_crianca * numDiarias,
      });
    }
    // 0–4 anos: gratuito
  }

  return { itens, total: itens.reduce((sum, item) => sum + item.valor, 0) };
}

// ─── MiniCalendar ─────────────────────────────────────────────────────────────

function MiniCalendar({
  periods,
  selectedPeriodId,
  onSelect,
  category,
  viewYear,
  viewMonth,
  onPrev,
  onNext,
}: {
  periods: Period[];
  selectedPeriodId: string;
  onSelect: (id: string) => void;
  category: Category;
  viewYear: number;
  viewMonth: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (periods.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        Nenhuma data disponível para este formato.
      </p>
    );
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const availableByDay = new Map<number, Period>();
  periods.forEach((p) => {
    const entry = new Date(p.data_entrada + 'T12:00:00');
    if (entry.getFullYear() === viewYear && entry.getMonth() === viewMonth) {
      availableByDay.set(entry.getDate(), p);
    }
  });

  const selectedPeriod = periods.find((p) => p.periodo_id === selectedPeriodId);
  const rangeDays = new Set<number>();
  let checkInDay: number | null = null;
  let checkOutDay: number | null = null;

  if (selectedPeriod) {
    const entry = new Date(selectedPeriod.data_entrada + 'T12:00:00');
    const exit = new Date(selectedPeriod.data_saida + 'T12:00:00');

    if (entry.getFullYear() === viewYear && entry.getMonth() === viewMonth) {
      checkInDay = entry.getDate();
    }
    if (category === 'hotelaria') {
      if (exit.getFullYear() === viewYear && exit.getMonth() === viewMonth) {
        checkOutDay = exit.getDate();
      }
      for (let d = new Date(entry); d <= exit; d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
          rangeDays.add(d.getDate());
        }
      }
    } else {
      if (entry.getFullYear() === viewYear && entry.getMonth() === viewMonth) {
        rangeDays.add(entry.getDate());
      }
    }
  }

  // Todos os dias que pertencem a qualquer pacote no mês atual
  const allPackageDays = new Set<number>();
  periods.forEach((p) => {
    const entry = new Date(p.data_entrada + 'T12:00:00');
    const exit = new Date(p.data_saida + 'T12:00:00');
    for (let d = new Date(entry); d <= exit; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
        allPackageDays.add(d.getDate());
      }
    }
  });

  // Faixa navegável: do mês atual (ou do 1º pacote, o que vier antes) até
  // 12 meses após o último pacote. Assim as setas continuam funcionando mesmo
  // quando todos os pacotes estão num único mês — os meses vizinhos aparecem
  // vazios e só os dias de pacote permanecem clicáveis.
  const viewFirst = new Date(viewYear, viewMonth, 1);
  const now = new Date();
  const currentMonthFirst = new Date(now.getFullYear(), now.getMonth(), 1);

  const packageMonths = periods.map((p) => {
    const d = new Date(p.data_entrada + 'T12:00:00');
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const navMin = packageMonths.reduce((min, d) => (d < min ? d : min), currentMonthFirst);
  const lastPackage = packageMonths.reduce((max, d) => (d > max ? d : max), navMin);
  const navMax = new Date(lastPackage.getFullYear(), lastPackage.getMonth() + 12, 1);

  const hasPrev = viewFirst > navMin;
  const hasNext = viewFirst < navMax;

  const blanks = Array(firstDayOfWeek).fill(null);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div>
      {/* Navegação de mês */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-default transition-colors text-xl leading-none"
        >
          ‹
        </button>
        <p className="text-sm font-semibold text-[#1c1a16] capitalize">{monthLabel}</p>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-default transition-colors text-xl leading-none"
        >
          ›
        </button>
      </div>

      {/* Headers de dia da semana */}
      <div className="grid grid-cols-7 text-center mb-1">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-[11px] text-gray-400 font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Grid de dias */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {blanks.map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {days.map((day) => {
          const period = availableByDay.get(day);
          const isCheckIn = day === checkInDay;
          const isCheckOut = day === checkOutDay && category === 'hotelaria';
          const inRange = rangeDays.has(day) && !isCheckIn && !isCheckOut;
          const isAvailable = !!period;
          const inAnyPackage = allPackageDays.has(day) && !isCheckIn && !isCheckOut && !inRange && !isAvailable;

          let cls =
            'h-9 w-full text-xs flex items-center justify-center transition-colors select-none ';

          if (isCheckIn && isCheckOut) {
            cls += 'bg-[#2d6a4f] text-white font-bold rounded-full ';
          } else if (isCheckIn) {
            cls += 'bg-[#2d6a4f] text-white font-bold rounded-l-full ';
          } else if (isCheckOut) {
            cls += 'bg-[#2d6a4f] text-white font-bold rounded-r-full ';
          } else if (inRange) {
            cls += 'bg-[#2d6a4f]/12 text-[#1b4332] font-medium ';
          } else if (isAvailable) {
            cls +=
              'text-[#2d6a4f] font-semibold ring-2 ring-[#2d6a4f]/60 rounded-full hover:bg-[#2d6a4f]/10 cursor-pointer ';
          } else if (inAnyPackage) {
            cls += 'text-[#2d6a4f]/70 bg-[#2d6a4f]/[0.10] ';
          } else {
            cls += 'text-gray-300 cursor-default ';
          }

          return (
            <button
              key={day}
              type="button"
              onClick={isAvailable ? () => onSelect(period!.periodo_id) : undefined}
              disabled={!isAvailable}
              className={cls}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Day Use Slots ────────────────────────────────────────────────────────────

function generateDayUseSlots(hotelariaPeriods: Period[]): Period[] {
  const slots: Period[] = [];
  const seen = new Set<string>();
  for (const p of hotelariaPeriods) {
    const entry = new Date(p.data_entrada + 'T12:00:00');
    const exit  = new Date(p.data_saida   + 'T12:00:00');
    const cur   = new Date(entry);
    cur.setDate(cur.getDate() + 1);
    while (cur <= exit) {
      const dateStr = cur.toISOString().split('T')[0];
      if (!seen.has(dateStr)) {
        seen.add(dateStr);
        slots.push({
          periodo_id:           `dayuse-${p.periodo_id}-${dateStr}`,
          nome:                 `Day Use — ${dateStr}`,
          tipo:                 'day_use',
          data_entrada:         dateStr,
          hora_entrada:         '08:00',
          data_saida:           dateStr,
          hora_saida:           '18:00',
          num_diarias:          0,
          preco_casal_standard: 0,
          preco_casal_mezanino: 0,
          preco_crianca:        0,
          preco_extra:          0,
          vagas_disponiveis:    p.vagas_disponiveis,
        });
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
  return slots;
}

// ─── Counter ──────────────────────────────────────────────────────────────────

function Counter({
  label,
  value,
  min = 0,
  max = 20,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-8 h-8 rounded border border-[#d4cfc6] flex items-center justify-center text-[#5a4e3a] hover:border-[#2d6a4f] hover:text-[#2d6a4f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          −
        </button>
        <span className="w-6 text-center font-semibold text-gray-900">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-8 h-8 rounded border border-[#d4cfc6] flex items-center justify-center text-[#5a4e3a] hover:border-[#2d6a4f] hover:text-[#2d6a4f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadForm({ apiBase, whatsappNumber, sheetsWebhookUrl, staticPeriods }: Props) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [periodsError, setPeriodsError] = useState(false);
  const [category, setCategory] = useState<Category>('hotelaria');

  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [qtdAdultos, setQtdAdultos] = useState(2);
  const [qtdCriancas, setQtdCriancas] = useState(0);
  const [idadesCriancas, setIdadesCriancas] = useState<number[]>([]);
  const [tipoAcomodacao, setTipoAcomodacao] = useState<TipoAcomodacao>('sem_preferencia');
  const [observacoes, setObservacoes] = useState('');
  const [restricoes, setRestricoes] = useState('');

  const [aceitaComunicacoes, setAceitaComunicacoes] = useState(false);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [partialSent, setPartialSent] = useState(false);
  const scheduleTracked = useRef(false);

  const selectedPeriod = periods.find((p) => p.periodo_id === selectedPeriodId) ?? null;

  const resumo = useMemo(
    () =>
      selectedPeriod && category === 'hotelaria'
        ? calcularResumo(tipoAcomodacao, qtdAdultos, idadesCriancas, selectedPeriod)
        : null,
    [tipoAcomodacao, qtdAdultos, idadesCriancas, selectedPeriod, category],
  );

  const hotelariaPeriods = periods.filter((p) => p.tipo !== 'day_use');
  const dayUsePeriods = generateDayUseSlots(hotelariaPeriods);
  const activePeriods = category === 'hotelaria' ? hotelariaPeriods : dayUsePeriods;
  // A lista abaixo do calendário acompanha o mês exibido (pela data de entrada)
  const monthPeriods = activePeriods.filter((p) => {
    const d = new Date(p.data_entrada + 'T12:00:00');
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  });

  // Carrega períodos disponíveis ao montar
  useEffect(() => {
    const loadPeriods = (data: Period[]) => {
      setPeriods(data);
      const firstHotelaria = data.find((p) => p.tipo !== 'day_use');
      const firstPeriod = firstHotelaria ?? data[0];
      if (firstPeriod) {
        const d = new Date(firstPeriod.data_entrada + 'T12:00:00');
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
      setPeriodsLoading(false);
    };

    if (staticPeriods && staticPeriods.length > 0) {
      loadPeriods(staticPeriods);
      return;
    }

    if (!apiBase) {
      setPeriodsLoading(false);
      return;
    }

    fetch(`${apiBase}/api/periodos/disponiveis`)
      .then((r) => r.json())
      .then((data: Period[]) => loadPeriods(data))
      .catch(() => setPeriodsError(true))
      .finally(() => setPeriodsLoading(false));
  }, [apiBase, staticPeriods]);

  // Escuta evento disparado pelos botões "Reservar quarto X" da seção de acomodações
  useEffect(() => {
    const handler = (e: Event) => {
      const room = (e as CustomEvent<string>).detail;
      if (room === 'standard' || room === 'mezanino_bangalo') {
        setTipoAcomodacao(room as TipoAcomodacao);
      }
    };
    document.addEventListener('candeal:room', handler);
    return () => document.removeEventListener('candeal:room', handler);
  }, []);

  // Dispara Schedule no Meta Pixel quando usuário seleciona período pela primeira vez
  useEffect(() => {
    if (selectedPeriodId && !scheduleTracked.current) {
      scheduleTracked.current = true;
      window.fbq?.('track', 'Schedule');
    }
  }, [selectedPeriodId]);

  // Sincroniza o array de idades com qtdCriancas
  useEffect(() => {
    setIdadesCriancas((prev) => {
      if (qtdCriancas > prev.length) {
        return [...prev, ...Array(qtdCriancas - prev.length).fill(0)];
      }
      return prev.slice(0, qtdCriancas);
    });
  }, [qtdCriancas]);

  function handleCategoryChange(cat: Category) {
    setCategory(cat);
    const hotelaria = periods.filter((p) => p.tipo !== 'day_use');
    const list = cat === 'hotelaria' ? hotelaria : generateDayUseSlots(hotelaria);
    const first = list[0];
    setSelectedPeriodId(first?.periodo_id ?? '');
    if (first) {
      const d = new Date(first.data_entrada + 'T12:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }

  function handleCalPrev() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function handleCalNext() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  // Captura parcial silenciosa no onBlur do telefone
  const handleTelefoneBlur = useCallback(() => {
    if (!nome || !telefone || partialSent || !apiBase) return;
    setPartialSent(true);

    const utms = window.__utms ?? {};

    fetch(`${apiBase}/api/leads-parciais`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome,
        telefone,
        email: email || undefined,
        periodo_id: selectedPeriodId || undefined,
        qtd_adultos: qtdAdultos,
        qtd_criancas: qtdCriancas,
        tipo_acomodacao_preferido: tipoAcomodacao,
        etapa: 'formulario_incompleto',
        ...utms,
      }),
    }).catch(() => {});
  }, [nome, telefone, email, selectedPeriodId, qtdAdultos, qtdCriancas, tipoAcomodacao, partialSent, apiBase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPeriod || status === 'loading') return;

    setStatus('loading');

    const sendWhatsApp = () => {
      window.fbq?.('track', 'Lead');
      window.fbq?.('track', 'InitiateCheckout');
      window.gtag?.('event', 'generate_lead');
      const message = buildWhatsAppMessage(
        selectedPeriod,
        nome,
        telefone,
        email,
        qtdAdultos,
        qtdCriancas,
        idadesCriancas,
        tipoAcomodacao,
        observacoes,
        restricoes,
        resumo?.total,
      );
      const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      setStatus('success');
    };

    const sendSheets = () => {
      if (!sheetsWebhookUrl) return;
      const utms = window.__utms ?? {};
      fetch(sheetsWebhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          tipo: `formulario_${category}`,
          nome,
          telefone,
          email,
          periodo: selectedPeriod.nome,
          data_entrada: selectedPeriod.data_entrada,
          data_saida: selectedPeriod.data_saida,
          num_diarias: selectedPeriod.num_diarias,
          adultos: qtdAdultos,
          criancas: qtdCriancas,
          idades_criancas: idadesCriancas.join(', ') || '',
          tipo_acomodacao: tipoAcomodacao,
          observacoes: observacoes || '',
          restricoes: restricoes || '',
          ...utms,
        }),
      }).catch(() => {});
    };

    // Sem API configurada: vai direto para o WhatsApp
    if (!apiBase) {
      sendSheets();
      sendWhatsApp();
      return;
    }

    try {
      const res = await fetch(`${apiBase}/api/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo_id: selectedPeriodId,
          nome_responsavel: nome,
          telefone,
          email,
          qtd_adultos: qtdAdultos,
          qtd_criancas: qtdCriancas,
          idades_criancas: idadesCriancas,
          tipo_acomodacao_preferido: tipoAcomodacao,
          observacoes: observacoes || undefined,
          restricoes: restricoes || undefined,
        }),
      });

      if (res.status === 409) {
        setStatus('no_vacancies');
        return;
      }

      if (!res.ok) {
        setStatus('error');
        return;
      }

      sendSheets();
      sendWhatsApp();
    } catch {
      setStatus('error');
    }
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const inputClass =
    'w-full rounded-lg border border-[#d4cfc6] bg-white/80 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/15 outline-none transition-all font-sans';

  const labelClass = 'block text-sm font-medium text-[#5a4e3a] mb-1.5 font-sans';

  if (status === 'success') {
    return (
      <div className="max-w-2xl mx-auto text-center bg-white rounded-xl border border-[#d4cfc6] p-10 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-3">Solicitação enviada!</h3>
        <p className="text-gray-500 mb-6">
          Recebemos suas informações e abrimos o WhatsApp para você confirmar diretamente com nossa
          equipe. Respondemos em até 24h.
        </p>
        <button
          onClick={() => setStatus('idle')}
          className="text-sm text-[#2d6a4f] underline underline-offset-4 hover:text-[#1b4332]"
        >
          Fazer outra solicitação
        </button>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-5 gap-8 items-start">

      {/* ── Painel esquerdo: seletor de categoria + calendário ── */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-xl border border-[#d4cfc6] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.07)]">
          <h3 className="text-base mb-4 text-[#1c1a16]" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>
            Selecione seu formato
          </h3>

          {/* Toggle de categoria */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <button
              type="button"
              onClick={() => handleCategoryChange('hotelaria')}
              className={`py-2.5 px-2 rounded-lg border text-xs font-semibold transition-all font-sans flex items-center justify-center gap-1.5 ${
                category === 'hotelaria'
                  ? 'bg-[#2d6a4f] text-white border-[#2d6a4f] shadow-sm'
                  : 'bg-white text-[#5a4e3a] border-[#d4cfc6] hover:border-[#2d6a4f]/50'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
              Hotelaria Completa
            </button>
            <button
              type="button"
              onClick={() => handleCategoryChange('day_use')}
              className={`py-2.5 px-2 rounded-lg border text-xs font-semibold transition-all font-sans flex items-center justify-center gap-1.5 ${
                category === 'day_use'
                  ? 'bg-[#2d6a4f] text-white border-[#2d6a4f] shadow-sm'
                  : 'bg-white text-[#5a4e3a] border-[#d4cfc6] hover:border-[#2d6a4f]/50'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-12.37l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0zM7.05 18.36l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0z"/></svg>
              Day Use
            </button>
          </div>

          {/* Calendário */}
          {periodsLoading && (
            <div className="h-48 rounded-xl bg-gray-100 animate-pulse" />
          )}

          {periodsError && (
            <p className="text-sm text-gray-500 py-4 text-center">
              Não foi possível carregar as datas.
              <br />
              <a
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent('[Site] Olá! Gostaria de ver as datas disponíveis na Fazenda Candeal.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2d6a4f] underline"
              >
                Consulte pelo WhatsApp
              </a>
            </p>
          )}

          {!periodsLoading && !periodsError && (
            <>
              <MiniCalendar
                periods={activePeriods}
                selectedPeriodId={selectedPeriodId}
                onSelect={setSelectedPeriodId}
                category={category}
                viewYear={viewYear}
                viewMonth={viewMonth}
                onPrev={handleCalPrev}
                onNext={handleCalNext}
              />

              {/* Lista de pacotes disponíveis */}
              {activePeriods.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-bold text-[#2d6a4f] uppercase tracking-wider">
                      Pacotes disponíveis
                    </p>
                    {!selectedPeriodId && (
                      <span className="text-[11px] font-semibold text-[#b7791f] animate-pulse">
                        ← Escolha um pacote
                      </span>
                    )}
                  </div>
                  {!selectedPeriodId && monthPeriods.length > 0 && (
                    <p className="text-xs text-[#b7791f] bg-[#b7791f]/10 border border-[#b7791f]/30 rounded-lg px-3 py-2 mb-2">
                      Selecione abaixo a data do pacote que deseja reservar.
                    </p>
                  )}
                  {monthPeriods.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-3">
                      Nenhum pacote neste mês. Use as setas do calendário para ver outras datas.
                    </p>
                  )}
                  {monthPeriods.map((p) => {
                    const isSelected = p.periodo_id === selectedPeriodId;
                    return (
                      <button
                        key={p.periodo_id}
                        type="button"
                        onClick={() => {
                          setSelectedPeriodId(p.periodo_id);
                          const d = new Date(p.data_entrada + 'T12:00:00');
                          setViewYear(d.getFullYear());
                          setViewMonth(d.getMonth());
                        }}
                        className={`w-full text-left rounded-lg border px-3.5 py-3 transition-all ${
                          isSelected
                            ? 'border-[#2d6a4f] bg-[#2d6a4f]/6 ring-1 ring-[#2d6a4f]/30'
                            : selectedPeriodId
                              ? 'border-[#d4cfc6] bg-white hover:border-[#2d6a4f]/40 hover:bg-[#f7f3eb]'
                              : 'border-[#b7791f]/40 bg-white hover:border-[#2d6a4f]/40 hover:bg-[#f7f3eb]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={`text-sm font-semibold leading-snug ${isSelected ? 'text-[#1b4332]' : 'text-[#1c1a16]'}`}>
                              {p.nome}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {category === 'hotelaria'
                                ? `${formatDate(p.data_entrada)} → ${formatDate(p.data_saida)} · ${p.num_diarias} diária${p.num_diarias !== 1 ? 's' : ''}`
                                : `${formatDate(p.data_entrada)} · ${p.hora_entrada} às ${p.hora_saida}`
                              }
                            </p>
                          </div>
                          {isSelected && (
                            <svg className="flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2.5">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </div>
                        {p.vagas_disponiveis <= 3 && (
                          <span className="inline-block mt-1.5 text-[10px] font-bold text-[#b7791f] bg-[#b7791f]/10 rounded-full px-2 py-0.5">
                            Últimas vagas!
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Formulário ── */}
      <div className="lg:col-span-3">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-[#d4cfc6] p-6 sm:p-8 shadow-[0_2px_20px_rgba(0,0,0,0.07)] space-y-5"
        >
          <h3 className="text-lg text-[#1c1a16]" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>
            Informações para reserva
          </h3>

          {/* Nome */}
          <div>
            <label className={labelClass}>
              Nome completo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="João Silva"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Telefone */}
          <div>
            <label className={labelClass}>
              WhatsApp / Telefone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              placeholder="(71) 99999-0000"
              value={telefone}
              onChange={(e) => setTelefone(formatPhone(e.target.value))}
              onBlur={handleTelefoneBlur}
              className={inputClass}
            />
          </div>

          {/* Email */}
          <div>
            <label className={labelClass}>
              E-mail <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              placeholder="joao@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Hóspedes */}
          <div className="bg-[#f7f3eb] rounded-lg border border-[#d4cfc6] p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Hóspedes</p>
            <Counter label="Adultos" value={qtdAdultos} min={1} max={20} onChange={setQtdAdultos} />
            <Counter label="Crianças" value={qtdCriancas} min={0} max={10} onChange={setQtdCriancas} />

            {qtdCriancas > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {idadesCriancas.map((idade, i) => (
                  <div key={i}>
                    <label className="block text-xs text-gray-500 mb-1">
                      Criança {i + 1}: Idade
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={17}
                      value={idade === 0 ? '' : idade}
                      onChange={(e) => {
                        const next = [...idadesCriancas];
                        const raw = e.target.value;
                        next[i] = raw === '' ? 0 : Math.min(17, Math.max(0, parseInt(raw, 10) || 0));
                        setIdadesCriancas(next);
                      }}
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tipo de acomodação — apenas para hotelaria */}
          {category === 'hotelaria' && (
            <div>
              <label className={labelClass}>
                Tipo de acomodação <span className="text-red-500">*</span>
              </label>
              {selectedPeriod && selectedPeriod.preco_casal_standard > 0 && (
                <p className="text-xs text-gray-400 mb-2">
                  Standard: {formatCurrency(selectedPeriod.preco_casal_standard)} · Mezanino/Bangalô:{' '}
                  {formatCurrency(selectedPeriod.preco_casal_mezanino)}
                </p>
              )}
              <select
                value={tipoAcomodacao}
                onChange={(e) => setTipoAcomodacao(e.target.value as TipoAcomodacao)}
                className={`${inputClass} ${tipoAcomodacao === 'sem_preferencia' ? 'border-amber-400 ring-2 ring-amber-300/40' : ''}`}
              >
                <option value="sem_preferencia" disabled>Escolha o tipo de acomodação...</option>
                <option value="standard">Standard</option>
                <option value="mezanino_bangalo">Mezanino / Bangalô</option>
              </select>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className={labelClass}>Observações (opcional)</label>
            <textarea
              rows={2}
              placeholder="Alguma observação especial para a sua estadia?"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Restrições alimentares */}
          <div>
            <label className={labelClass}>Restrições alimentares (opcional)</label>
            <input
              type="text"
              placeholder="Ex: intolerância a lactose, vegetariano..."
              value={restricoes}
              onChange={(e) => setRestricoes(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Erro: sem vagas */}
          {status === 'no_vacancies' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              Ops, as vagas para este período acabaram. Selecione outro período ou{' '}
              <a
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent('[Site] Olá! Vi que o período que escolhi está sem vagas. Vocês têm outra opção?')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                fale conosco
              </a>
              .
            </div>
          )}

          {/* Erro: falha no envio */}
          {status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              Ocorreu um erro ao enviar.{' '}
              <a
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent('[Site] Olá! Tive um problema ao preencher o formulário e gostaria de fazer minha reserva.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                Entre em contato via WhatsApp.
              </a>
            </div>
          )}

          {/* Consentimento LGPD */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={aceitaComunicacoes}
              onChange={(e) => setAceitaComunicacoes(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-[#d4cfc6] text-[#2d6a4f] accent-[#2d6a4f] cursor-pointer"
            />
            <span className="text-xs text-gray-500 leading-relaxed group-hover:text-gray-700 transition-colors">
              Aceito receber comunicações da Fazenda Hotel Candeal sobre reservas, promoções e novidades.
            </span>
          </label>

          {/* Estimativa de valor */}
          {selectedPeriod && category === 'hotelaria' && (
            resumo ? (
              <div className="rounded-xl bg-[#f0f7f4] border border-[#2d6a4f]/30 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#2d6a4f] mb-3">
                  Estimativa de valor
                </p>
                <div className="space-y-2 mb-3">
                  {resumo.itens.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-[#5a4e3a]">{item.descricao}</span>
                      <span className="font-medium text-[#1c1a16] tabular-nums shrink-0">
                        {formatCurrency(item.valor)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#2d6a4f]/20 pt-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#1c1a16]">Total estimado</span>
                  <span className="text-xl font-bold text-[#2d6a4f] tabular-nums">
                    {formatCurrency(resumo.total)}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  * Estimativa — valores sujeitos à confirmação pela equipe
                </p>
              </div>
            ) : (
              tipoAcomodacao === 'sem_preferencia' && selectedPeriod.preco_casal_standard > 0 && (
                <div className="rounded-xl bg-[#f7f3eb] border border-[#d4cfc6] px-4 py-3 text-xs text-[#5a4e3a] text-center">
                  Selecione o tipo de acomodação para ver o valor estimado.
                </div>
              )
            )
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'loading' || !selectedPeriodId || periodsLoading || !aceitaComunicacoes || (category === 'hotelaria' && tipoAcomodacao === 'sem_preferencia')}
            className="w-full flex items-center justify-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg text-base transition-all duration-200 shadow-md hover:shadow-lg"
          >
            {status === 'loading' ? (
              <>
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" />
                  <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Enviando...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Quero reservar
              </>
            )}
          </button>

          {!selectedPeriodId && (
            <p className="text-xs text-center font-semibold text-[#b7791f]">
              Selecione um pacote acima para habilitar o envio.
            </p>
          )}

          {selectedPeriodId && category === 'hotelaria' && tipoAcomodacao === 'sem_preferencia' && (
            <p className="text-xs text-center font-semibold text-[#b7791f]">
              Escolha o tipo de acomodação para continuar.
            </p>
          )}

          <p className="text-xs text-center text-gray-400">
            Ao enviar, suas informações serão usadas apenas para confirmar sua reserva.
          </p>
        </form>
      </div>
    </div>
  );
}
