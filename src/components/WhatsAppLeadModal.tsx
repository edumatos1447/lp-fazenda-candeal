import { useState, useEffect } from 'react';

interface Props {
  sheetsWebhookUrl?: string;
}

// Copy e rótulo por origem de CTA. O rótulo vai para os parâmetros do Pixel,
// que é o que permite criar Conversão Personalizada por produto no Meta.
const ORIGENS: Record<
  string,
  { rotulo: string; titulo: string; subtitulo: string; cta: string; pedeEscola?: boolean }
> = {
  day_use_escolar: {
    rotulo: 'Day Use Escolar',
    titulo: 'Vamos falar sobre sua turma',
    subtitulo: 'Preencha seus dados e nossa equipe escolar assume a conversa no WhatsApp.',
    cta: 'Reservar Day Use Escolar',
    pedeEscola: true,
  },
  day_use: {
    rotulo: 'Day Use',
    titulo: 'Antes de continuar...',
    subtitulo: 'Preencha seus dados para seguir para o WhatsApp.',
    cta: 'Falar sobre o Day Use',
  },
};

const ORIGEM_PADRAO = {
  rotulo: 'WhatsApp Direto',
  titulo: 'Antes de continuar...',
  subtitulo: 'Preencha seus dados para seguir para o WhatsApp.',
  cta: 'Reservar pelo WhatsApp',
};

// Anexa a escola à mensagem já montada no href do CTA, para a equipe receber
// o lead qualificado direto no WhatsApp e não só na planilha.
function anexarEscola(url: string, escola: string) {
  if (!escola.trim()) return url;
  try {
    const u = new URL(url);
    const texto = u.searchParams.get('text') ?? '';
    u.searchParams.set('text', `${texto}\n\n*Escola:* ${escola.trim()}`);
    return u.toString();
  } catch {
    return url;
  }
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

const WA_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export default function WhatsAppLeadModal({ sheetsWebhookUrl }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [leadTipo, setLeadTipo] = useState('whatsapp_direto');
  const [fbEvent, setFbEvent] = useState('Lead');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [escola, setEscola] = useState('');
  const [aceitaComunicacoes, setAceitaComunicacoes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const origem = ORIGENS[leadTipo] ?? ORIGEM_PADRAO;

  // Intercepta cliques em qualquer link wa.me fora do formulário principal
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('a[href*="wa.me"]') as HTMLAnchorElement | null;
      if (!el) return;
      if (el.closest('#reserva')) return; // pula links de erro dentro do LeadForm
      e.preventDefault();
      e.stopPropagation();
      setTargetUrl(el.href);
      setLeadTipo(el.dataset.leadTipo || 'whatsapp_direto');
      setFbEvent(el.dataset.fbEvent || 'Lead');
      setIsOpen(true);
    };

    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  // Trava o scroll do body quando o modal está aberto
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Fecha com ESC
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  function close() {
    setIsOpen(false);
    setLeadTipo('whatsapp_direto');
    setFbEvent('Lead');
    setNome('');
    setTelefone('');
    setEmail('');
    setEscola('');
    setAceitaComunicacoes(false);
    setIsSubmitting(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    if (sheetsWebhookUrl) {
      const utms = window.__utms ?? {};
      fetch(sheetsWebhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          nome,
          telefone,
          email: email || '',
          escola: escola.trim(),
          tipo: leadTipo,
          ...utms,
        }),
      }).catch(() => {});
    }

    // Evento do Pixel definido por botão via data-fb-event (default: Lead).
    // O Day Use Escolar usa "Contact" para não misturar com o funil de reserva.
    // Os parâmetros permitem montar Conversão Personalizada por produto no Meta
    // sem depender de criar um evento novo para cada CTA.
    window.fbq?.('track', fbEvent, {
      content_name: origem.rotulo,
      content_category: leadTipo,
    });
    window.gtag?.('event', 'generate_lead', { lead_source: leadTipo });
    window.open(anexarEscola(targetUrl, escola), '_blank', 'noopener,noreferrer');
    close();
  }

  if (!isOpen) return null;

  const inputClass =
    'w-full rounded-lg border border-[#d4cfc6] bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/15 outline-none transition-all font-sans';
  const labelClass = 'block text-sm font-medium text-[#5a4e3a] mb-1.5 font-sans';

  return (
    <>
      <style>{`
        @keyframes wa-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes wa-slide { from { transform: translateY(32px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .wa-backdrop { animation: wa-fade 0.2s ease both; }
        .wa-panel { animation: wa-slide 0.25s ease both; }
      `}</style>

      <div
        className="wa-backdrop fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-modal-title"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />

        {/* Painel */}
        <div className="wa-panel relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 sm:p-8 mx-0 sm:mx-4">
          {/* Botão fechar */}
          <button
            type="button"
            onClick={close}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Fechar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Cabeçalho */}
          <div className="mb-6 pr-8">
            <div className="w-10 h-10 rounded-full bg-[#25D366]/15 flex items-center justify-center mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <h2 id="wa-modal-title" className="text-xl font-bold text-[#1c1a16]">
              {origem.titulo}
            </h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              {origem.subtitulo}
            </p>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="wa-nome" className={labelClass}>
                Nome completo <span className="text-red-500">*</span>
              </label>
              <input
                id="wa-nome"
                type="text"
                required
                placeholder="João Silva"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </div>

            {origem.pedeEscola && (
              <div>
                <label htmlFor="wa-escola" className={labelClass}>
                  Escola interessada <span className="text-red-500">*</span>
                </label>
                <input
                  id="wa-escola"
                  type="text"
                  required
                  placeholder="Colégio Municipal Candeal"
                  value={escola}
                  onChange={(e) => setEscola(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label htmlFor="wa-tel" className={labelClass}>
                WhatsApp / Telefone <span className="text-red-500">*</span>
              </label>
              <input
                id="wa-tel"
                type="tel"
                required
                placeholder="(71) 99999-0000"
                value={telefone}
                onChange={(e) => setTelefone(formatPhone(e.target.value))}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="wa-email" className={labelClass}>
                E-mail (opcional)
              </label>
              <input
                id="wa-email"
                type="email"
                placeholder="joao@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

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

            <button
              type="submit"
              disabled={isSubmitting || !aceitaComunicacoes}
              className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5c] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg text-base transition-colors duration-200 shadow-md font-sans"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" />
                    <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Aguarde...
                </>
              ) : (
                <>{WA_ICON} {origem.cta}</>
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
