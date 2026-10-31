// DOM helpers a všechny view komponenty

function el(tag, opts = {}, children = []) {
  const e = document.createElement(tag);
  if (opts.className) e.className = opts.className;
  if (opts.text !== undefined) e.textContent = opts.text;
  if (opts.type) e.type = opts.type;
  if (opts.value !== undefined) e.value = opts.value;
  if (opts.max !== undefined) e.max = opts.max;
  if (opts.ariaLabel) e.ariaLabel = opts.ariaLabel;
  for (const p of ['checked', 'accept', 'href', 'download', 'src', 'alt', 'colSpan']) {
    if (opts[p] !== undefined) e[p] = opts[p];
  }
  if (opts.placeholder) e.placeholder = opts.placeholder;
  if (opts.name) e.name = opts.name;
  if (opts.forId) e.htmlFor = opts.forId;
  if (opts.id) e.id = opts.id;
  if (opts.disabled) e.disabled = true;
  if (opts.title) e.title = opts.title;
  if (opts.onClick) e.addEventListener('click', opts.onClick);
  if (opts.onChange) e.addEventListener('change', opts.onChange);
  if (opts.onInput) e.addEventListener('input', opts.onInput);
  if (opts.onSubmit) e.addEventListener('submit', opts.onSubmit);
  children.forEach(child => { if (child != null) e.appendChild(child); });
  return e;
}

function opt(value, label, selected) {
  const item = el('option', { value, text: label });
  item.selected = value === selected;
  return item;
}

function btn(label, className, onClick, disabled = false) {
  return el('button', { type: 'button', text: label, className, onClick, disabled });
}

function field(label, input) {
  return el('label', { className: 'field' }, [el('span', { text: label }), input]);
}

function formatDate(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
    : 'Neuvedeno';
}

// --- Layout ---

function Layout({ layoutData, handlers, contentElement, activeView }) {
  const initials = layoutData.auth.name.split(' ').map(p => p[0]).slice(0, 2).join('');
  const shell = el('div', { className: 'app-shell' });

  const sidebar = el('aside', { className: 'sidebar' }, [
    el('div', { className: 'brand' }, [
      el('span', { className: 'brand-mark', text: 'IT' }),
      el('div', {}, [el('strong', { text: 'DISPEČINK' }), el('span', { text: 'EVIDENCE INCIDENTŮ' })]),
    ]),
    el('p', { className: 'nav-caption', text: 'PRACOVNÍ PROSTOR' }),
    el('nav', { ariaLabel: 'Hlavní navigace' }, [
      navBtn('Přehled', 'DASHBOARD', activeView, handlers, '▦'),
      navBtn('Incidenty', 'TICKET_LIST', activeView, handlers, '≡'),
      layoutData.isSupport ? navBtn('Moje řešení', 'MY_TICKETS', activeView, handlers, '↗') : null,
      navBtn('Znalostní báze', 'KNOWLEDGE', activeView, handlers, '◇'),
    ]),
    el('div', { className: 'sidebar-guide' }, [
      el('span', { className: 'guide-icon', text: '↗' }),
      el('strong', { text: 'Od hlášení k řešení' }),
      el('p', { text: 'Zapište problém, předejte jej IT a sledujte průběh na jednom místě.' }),
    ]),
    el('div', { className: 'sidebar-footer', text: 'Dispečink / IT oddělení' }),
  ]);

  const header = el('header', { className: 'topbar' }, [
    el('div', { className: 'breadcrumb' }, [
      el('span', { text: 'Pracovní prostor' }),
      el('span', { className: 'breadcrumb-separator', text: '/' }),
      el('strong', { text: activeView === 'DASHBOARD' ? 'Přehled' : activeView === 'TICKET_DETAIL' ? 'Detail incidentu' : activeView === 'KNOWLEDGE' ? 'Znalostní báze' : 'Incidenty' }),
    ]),
    el('div', { className: 'role-switcher' }, [
      el('span', { className: 'avatar', text: initials }),
      el('div', { className: 'user-context' }, [el('strong', { text: layoutData.auth.name }), el('span', { text: 'Interní IT podpora' })]),
      el('select', { className: 'role-select', name: 'role', disabled: layoutData.isBusy, ariaLabel: 'Aktuální role', onChange: e => handlers.onRoleChange(e.target.value) }, [
        opt('DISPATCHER', 'Dispečer', layoutData.auth.role),
        opt('IT_SUPPORT', 'IT oddělení', layoutData.auth.role),
      ]),
    ]),
  ]);

  const main = el('main', { className: 'content' });
  if (layoutData.errorMessage) main.appendChild(el('div', { className: 'alert alert-error', text: layoutData.errorMessage }));
  if (layoutData.notification) main.appendChild(el('div', { className: 'alert alert-success', text: layoutData.notification }));
  if (layoutData.draftWarning) main.appendChild(el('div', { className: 'alert alert-warning', text: layoutData.draftWarning }));
  main.appendChild(contentElement);

  shell.appendChild(sidebar);
  shell.appendChild(header);
  shell.appendChild(main);
  return shell;
}

function navBtn(label, target, activeView, handlers, symbol) {
  const isActive = activeView === target || (target === 'TICKET_LIST' && activeView === 'TICKET_DETAIL');
  const item = el('button', { type: 'button', className: isActive ? 'nav-item active' : 'nav-item', onClick: () => handlers.onNavigate(target) }, [
    el('span', { className: 'nav-icon', text: symbol }),
    el('span', { text: label }),
  ]);
  if (isActive) item.ariaCurrent = 'page';
  return item;
}

// --- Handlers ---

function createLayoutHandlers(dispatch) {
  return {
    onNavigate: target => {
      if (target === 'DASHBOARD') return dispatch({ type: 'ENTER_DASHBOARD' });
      if (target === 'TICKET_LIST') { dispatch({ type: 'SET_FILTERS', payload: { mineOnly: false } }); return dispatch({ type: 'ENTER_TICKET_LIST' }); }
      if (target === 'MY_TICKETS') return dispatch({ type: 'ENTER_MY_TICKETS' });
      if (target === 'KNOWLEDGE') return dispatch({ type: 'ENTER_KNOWLEDGE' });
    },
    onRoleChange: role => dispatch({ type: 'CHANGE_ROLE', payload: { role } }),
  };
}

function createHandlers(dispatch, viewState) {
  const ticketId = viewState.ticket?.id;
  switch (viewState.type) {
    case 'DASHBOARD': return {
      onOpenTickets: () => dispatch({ type: 'ENTER_TICKET_LIST' }),
      onOpenTicket: id => dispatch({ type: 'ENTER_TICKET_DETAIL', payload: { ticketId: id } }),
      onCreateTicket: payload => dispatch({ type: 'CREATE_TICKET', payload }),
      onDraftChange: payload => dispatch({ type: 'UPDATE_TICKET_DRAFT', payload }),
      onTemplate: templateId => dispatch({ type: 'APPLY_TEMPLATE', payload: { templateId } }),
      onMine: () => dispatch({ type: 'ENTER_MY_TICKETS' }),
    };
    case 'TICKET_LIST': return {
      onOpenTicket: id => dispatch({ type: 'ENTER_TICKET_DETAIL', payload: { ticketId: id } }),
      onFilterChange: payload => dispatch({ type: 'SET_FILTERS', payload }),
      onExport: () => dispatch({ type: 'EXPORT_TICKETS' }),
    };
    case 'TICKET_DETAIL': return {
      onGoBack: () => dispatch({ type: 'ENTER_TICKET_LIST' }),
      onAssign: () => dispatch({ type: 'ASSIGN_TICKET', payload: { ticketId } }),
      onResolve: resolution => dispatch({ type: 'RESOLVE_TICKET', payload: { ticketId, resolution } }),
      onClose: () => dispatch({ type: 'CLOSE_TICKET', payload: { ticketId } }),
      onAddReply: body => dispatch({ type: 'ADD_REPLY', payload: { ticketId, body } }),
      onDraftChange: (f, value) => dispatch({ type: 'UPDATE_DETAIL_DRAFT', payload: { ticketId, field: f, value } }),
      onWait: reason => dispatch({ type: 'WAIT_FOR_INFO', payload: { ticketId, reason } }),
      onResume: () => dispatch({ type: 'RESUME_TICKET', payload: { ticketId } }),
      onReopen: reason => dispatch({ type: 'REOPEN_TICKET', payload: { ticketId, reason } }),
      onLink: parentId => dispatch({ type: 'LINK_RELATED', payload: { ticketId, parentId } }),
      onUpload: file => dispatch({ type: 'UPLOAD_ATTACHMENT', payload: { ticketId, file } }),
      onPublish: () => dispatch({ type: 'PUBLISH_KNOWLEDGE', payload: { ticketId } }),
      onOpenTicket: id => dispatch({ type: 'ENTER_TICKET_DETAIL', payload: { ticketId: id } }),
    };
    case 'KNOWLEDGE': return {
      onSearch: query => dispatch({ type: 'SEARCH_KNOWLEDGE', payload: { query } }),
      onOpenTicket: id => dispatch({ type: 'ENTER_TICKET_DETAIL', payload: { ticketId: id } }),
    };
    case 'ERROR': return { onContinue: () => dispatch({ type: 'APP_INIT' }) };
    default: return {};
  }
}

// --- View komponenty ---

function LoadingView() {
  return el('section', { className: 'panel', text: 'Načítám data...' });
}

function ErrorView({ message, handlers }) {
  return el('section', { className: 'panel empty-state' }, [
    el('h2', { text: 'Aplikace narazila na problém' }),
    el('p', { text: message }),
    btn('Zkusit znovu', 'primary-button', handlers.onContinue),
  ]);
}

function DashboardView({ viewState: v, handlers: h }) {
  return el('section', { className: 'page-stack' }, [
    el('div', { className: 'page-heading' }, [
      el('div', {}, [el('span', { className: 'eyebrow', text: 'PŘEHLED PRACOVIŠTĚ' }), el('h1', { text: 'Přehled incidentů' }), el('p', { text: 'Hlášení, komunikace a řešení problémů na jednom místě.' })]),
      btn('Zobrazit všechny incidenty', 'secondary-button', h.onOpenTickets),
    ]),
    summaryGrid(v.summary),
    attentionPanel(v, h),
    el('div', { className: 'two-column' }, [
      el('div', { className: 'overview-stack' }, [recentTickets(v.recentTickets, h), statusDistribution(v.summary), categoryStats(v.categoryStats, v.summary.total)]),
      actionPanel(v, h),
    ]),
    el('section', { className: 'panel' }, [
      el('h2', { text: 'Jak probíhá řešení' }),
      el('div', { className: 'flow' }, ['01 Nahlášení', '02 Převzetí IT', '03 Řešení a případné doplnění', '04 Ověření a uzavření'].map(text => el('span', { text }))),
      el('p', { className: 'muted', text: 'Pokud řešení nepomohlo, vyřešený nebo uzavřený incident lze s odůvodněním znovu otevřít.' }),
    ]),
  ]);
}

function summaryGrid(s) {
  const cards = [['Všechny incidenty', s.total, 'blue'], ['Nové', s.new, 'orange'], ['V řešení', s.assigned, 'violet'],
    ['Čeká na doplnění', s.waiting, 'amber'], ['Vyřešené', s.resolved, 'green'], ['Uzavřené', s.closed, 'slate'], ['Kritické otevřené', s.critical, 'red']];
  return el('div', { className: 'summary-grid' }, cards.map(([label, count, tone]) =>
    el('article', { className: 'summary-card ' + tone }, [el('span', { className: 'summary-dot' }), el('span', { text: label }), el('strong', { text: String(count) })])));
}

function attentionPanel(v, h) {
  return el('section', { className: 'panel attention-panel' }, [
    el('div', { className: 'panel-heading' }, [
      el('div', {}, [el('h2', { text: 'Vyžaduje pozornost' }), el('p', { className: 'muted', text: 'Nové, kritické a nevyřešené incidenty bez aktualizace déle než 24 hodin.' })]),
      el('span', { className: 'count-pill', text: String(v.attentionTickets.length) }),
    ]),
    v.attentionTickets.length
      ? el('div', { className: 'attention-list' }, v.attentionTickets.slice(0, 6).map(t =>
          el('button', { type: 'button', className: 'attention-item', onClick: () => h.onOpenTicket(t.id) }, [el('strong', { text: t.id + ' · ' + t.title }), el('span', { className: 'muted', text: t.attentionReason })])))
      : el('p', { className: 'muted', text: 'Žádný incident nyní nevyžaduje zvýšenou pozornost.' }),
  ]);
}

function recentTickets(tickets, h) {
  return el('section', { className: 'panel' }, [
    el('div', { className: 'panel-heading' }, [el('div', {}, [el('h2', { text: 'Poslední incidenty' }), el('p', { className: 'muted', text: 'Poslední nahlášené problémy a jejich stav' })]), el('span', { className: 'count-pill', text: String(tickets.length) })]),
    el('div', { className: 'ticket-list' }, tickets.length ? tickets.map(t =>
      el('button', { type: 'button', className: 'ticket-row', onClick: () => h.onOpenTicket(t.id) }, [
        el('div', { className: 'ticket-row-main' }, [el('span', { className: 'ticket-reference', text: t.id + ' · ' + t.applicationName }), el('span', { className: 'ticket-title', text: t.title }), el('span', { className: 'ticket-reporter', text: t.reporterName })]),
        el('div', { className: 'ticket-badges' }, [el('span', { className: 'badge status-' + t.status.toLowerCase(), text: t.statusLabel }), el('span', { className: 'badge priority-' + t.priority.toLowerCase(), text: t.priorityLabel })]),
        el('span', { className: 'row-arrow', text: '↗' }),
      ])) : [el('p', { className: 'muted', text: 'Zatím nejsou nahlášeny žádné incidenty.' })]),
  ]);
}

function statusDistribution(s) {
  const rows = [['Nové', s.new, 'orange'], ['V řešení', s.assigned, 'violet'], ['Čeká na doplnění', s.waiting, 'amber'], ['Vyřešené', s.resolved, 'green'], ['Uzavřené', s.closed, 'slate']];
  return el('section', { className: 'panel distribution-panel' }, [el('h2', { text: 'Stav řešení' }),
    ...rows.map(([label, count, tone]) => el('div', { className: 'distribution-row ' + tone }, [el('span', { text: label }), el('progress', { max: s.total || 1, value: count, ariaLabel: label }), el('strong', { text: String(count) })]))]);
}

function categoryStats(cats, total) {
  return el('section', { className: 'panel' }, [el('h2', { text: 'Nejčastější problémy' }), el('p', { className: 'muted', text: 'Počty incidentů podle kategorií.' }),
    ...cats.map(c => el('div', { className: 'category-stat blue' }, [el('span', { text: c.name }), el('strong', { text: String(c.count) }), el('progress', { max: total || 1, value: c.count, ariaLabel: c.name })]))]);
}

function actionPanel(v, h) {
  if (!v.capabilities.canCreateTicket) {
    return el('section', { className: 'panel' }, [
      el('h2', { text: 'Práce IT oddělení' }),
      el('p', { text: 'Převezměte incident, vyžádejte doplnění nebo zaznamenejte řešení.' }),
      el('p', { className: 'muted', text: 'Vaše nevyřešené incidenty: ' + v.mineCount }),
      el('div', { className: 'button-row' }, [btn('Moje incidenty k řešení', 'primary-button', h.onMine), btn('Všechny incidenty', 'secondary-button', h.onOpenTickets)]),
    ]);
  }
  const d = v.ticketDraft;
  const inp = (label, name, placeholder = '', type = 'text', wide = false) => {
    const control = el(type === 'textarea' ? 'textarea' : 'input', { type: type === 'textarea' ? undefined : type, name, value: d[name], placeholder, disabled: v.isSubmitting, onInput: e => h.onDraftChange({ [name]: e.target.value }) });
    const wrapper = field(label, control);
    if (wide) wrapper.className += ' full-width';
    return wrapper;
  };
  const sel = (label, name, choices, wide = false) => {
    const selected = d[name] || (name === 'categoryId' ? v.categories[0]?.id : '');
    const wrapper = field(label, el('select', { name, disabled: v.isSubmitting, onChange: e => h.onDraftChange({ [name]: e.target.value }) }, choices.map(([val, text]) => opt(val, text, selected))));
    if (wide) wrapper.className += ' full-width';
    return wrapper;
  };
  return el('section', { className: 'panel incident-entry' }, [
    el('span', { className: 'eyebrow', text: 'NOVÉ HLÁŠENÍ' }),
    el('h2', { text: 'Co se nedaří?' }),
    el('p', { className: 'muted', text: 'Zapište telefonické hlášení technika nebo problém s webem. Rozepsané údaje se ukládají průběžně.' }),
    field('Použít šablonu', el('select', { name: 'templateId', disabled: v.isSubmitting, onChange: e => h.onTemplate(e.target.value) }, [opt('', 'Vybrat častý problém…', ''), ...v.templates.map(t => opt(t.id, t.name, ''))])),
    el('form', { className: 'ticket-form expanded-form', onSubmit: e => { e.preventDefault(); h.onCreateTicket(Object.fromEntries(new FormData(e.currentTarget))); } }, [
      inp('Název incidentu', 'title', 'Např. nelze dokončit pracovní příkaz', 'text', true),
      inp('Kdo problém hlásí', 'reporterName', 'Jméno technika nebo pracovníka'),
      inp('Telefon / pracovní ID (nepovinné)', 'reporterContact', 'Kontakt pro zpětné ověření'),
      sel('Typ aplikace', 'application', [['MOBILE', 'Mobilní aplikace technika'], ['WEB', 'Webová aplikace dispečinku']]),
      inp('Název aplikace (nepovinné)', 'specificApplication', 'Upřesnění dotčené aplikace'),
      inp('Verze aplikace (nepovinné)', 'applicationVersion', 'Např. 2.4.1'),
      inp('Pracovní příkaz (nepovinné)', 'workOrderId', 'Číslo příkazu'),
      inp('Kdy problém začal (nepovinné)', 'occurredAt', '', 'datetime-local', true),
      sel('Rozsah dopadu', 'impact', Object.entries(impactLabels), true),
      inp('Popis problému', 'description', 'Co přesně nefunguje a jaká chyba se zobrazuje? Alespoň 10 znaků.', 'textarea', true),
      inp('Co už bylo vyzkoušeno (nepovinné)', 'triedSteps', 'Např. restart aplikace, ověření připojení…', 'textarea', true),
      sel('Kategorie', 'categoryId', v.categories.map(c => [c.id, c.name])),
      sel('Priorita', 'priority', Object.entries(priorityLabels)),
      el('button', { type: 'submit', className: 'primary-button', text: v.isSubmitting ? 'Odesílám…' : 'Nahlásit incident', disabled: v.isSubmitting }),
      el('p', { className: 'muted full-width', text: 'Snímky chyby a další přílohy můžete přidat po založení v detailu incidentu.' }),
    ]),
  ]);
}

function TicketListView({ viewState: v, handlers: h }) {
  const filter = (label, name, options) => field(label, el('select', { name, value: v[name], onChange: e => h.onFilterChange({ [name]: e.target.value }) }, options.map(([val, text]) => opt(val, text, v[name]))));
  return el('section', { className: 'page-stack' }, [
    el('div', { className: 'page-heading' }, [
      el('div', {}, [el('span', { className: 'eyebrow', text: 'EVIDENCE A PŘEDÁNÍ SMĚNY' }), el('h1', { text: v.mineOnly ? 'Moje incidenty k řešení' : 'Incidenty' }), el('p', { text: 'Nalezeno: ' + v.tickets.length + ' · Export obsahuje právě zobrazený výběr.' })]),
      btn('Stáhnout CSV', 'secondary-button', h.onExport, v.tickets.length === 0),
    ]),
    el('section', { className: 'panel filter-grid' }, [
      field('Vyhledávání', el('input', { type: 'search', name: 'incidentSearch', value: v.query, placeholder: 'Název, ID, technik, pracovní příkaz…', onInput: e => h.onFilterChange({ query: e.target.value }) })),
      filter('Stav', 'statusFilter', [['ALL', 'Všechny stavy'], ...Object.entries(statusLabels)]),
      filter('Priorita', 'priorityFilter', [['ALL', 'Všechny priority'], ...Object.entries(priorityLabels)]),
      filter('Aplikace', 'applicationFilter', [['ALL', 'Všechny aplikace'], ...Object.entries(applicationLabels)]),
      filter('Kategorie', 'categoryFilter', [['ALL', 'Všechny kategorie'], ...v.categories.map(c => [c.id, c.name])]),
      v.isSupport ? field('Moje přidělené incidenty', el('input', { type: 'checkbox', name: 'mineOnly', checked: v.mineOnly, onChange: e => h.onFilterChange({ mineOnly: e.target.checked }) })) : null,
      btn('Zrušit filtry', 'secondary-button', () => h.onFilterChange({ query: '', statusFilter: 'ALL', priorityFilter: 'ALL', applicationFilter: 'ALL', categoryFilter: 'ALL', mineOnly: false })),
    ]),
    el('section', { className: 'panel' }, [
      el('table', { className: 'data-table' }, [
        el('thead', {}, [el('tr', {}, ['ID', 'Název / pracovní příkaz', 'Problém hlásí', 'Aplikace', 'Kategorie', 'Priorita', 'Stav', 'Řešitel', 'Akce'].map(text => el('th', { text })))]),
        el('tbody', {}, v.tickets.length ? v.tickets.map(t => el('tr', {}, [
          el('td', { text: t.id }),
          el('td', {}, [el('strong', { text: t.title }), el('div', { className: 'muted', text: t.workOrderId || 'Bez pracovního příkazu' })]),
          el('td', { text: t.reporterName }),
          el('td', { text: t.specificApplication || t.applicationName }),
          el('td', { text: t.categoryName }),
          el('td', {}, [el('span', { className: 'badge priority-' + t.priority.toLowerCase(), text: t.priorityLabel })]),
          el('td', {}, [el('span', { className: 'badge status-' + t.status.toLowerCase(), text: t.statusLabel })]),
          el('td', { text: t.assigneeName }),
          el('td', {}, [btn('Detail', 'link-button', () => h.onOpenTicket(t.id))]),
        ])) : [el('tr', {}, [el('td', { text: 'Žádné incidenty neodpovídají filtrům.', colSpan: 9, className: 'empty-cell' })])]),
      ]),
    ]),
  ]);
}

function TicketDetailView({ viewState: v, handlers: h }) {
  if (!v.ticket) return el('section', { className: 'panel empty-state' }, [el('h1', { text: 'Incident nenalezen' }), btn('Zpět na seznam', 'secondary-button', h.onGoBack)]);
  const t = v.ticket;
  const item = (label, value) => el('div', { className: 'detail-item' }, [el('span', { text: label }), el('strong', { text: value || 'Neuvedeno' })]);
  return el('section', { className: 'page-stack' }, [
    el('div', { className: 'page-heading' }, [
      el('div', {}, [el('span', { className: 'eyebrow', text: t.id + ' · ' + t.categoryName }), el('h1', { text: t.title }), el('p', { text: t.statusLabel + ' · ' + t.priorityLabel + ' priorita' })]),
      btn('Zpět na seznam', 'secondary-button', h.onGoBack),
    ]),
    t.waitingReason ? el('div', { className: 'alert alert-warning pre-wrap', text: 'IT čeká na doplnění: ' + t.waitingReason }) : null,
    el('section', { className: 'panel detail-grid' }, [
      item('Stav', t.statusLabel), item('Priorita', t.priorityLabel), item('Řešitel', t.assigneeName), item('Zapsal dispečer', t.dispatcherName),
      item('Problém hlásí', t.reporterName), item('Kontakt / pracovní ID', t.reporterContact), item('Typ aplikace', t.applicationName),
      item('Název aplikace', t.specificApplication), item('Verze', t.applicationVersion), item('Pracovní příkaz', t.workOrderId),
      item('Rozsah dopadu', t.impactLabel), item('Problém vznikl', formatDate(t.occurredAt)), item('Nahlášeno', formatDate(t.createdAt)), item('Poslední změna', formatDate(t.updatedAt)),
      el('div', { className: 'detail-description' }, [el('span', { text: 'Popis problému' }), el('p', { text: t.description })]),
      el('div', { className: 'detail-description' }, [el('span', { text: 'Co už bylo vyzkoušeno' }), el('p', { text: t.triedSteps || 'Zatím nebylo uvedeno.' })]),
    ]),
    workflowPanel(v, h),
    el('div', { className: 'two-column' }, [repliesPanel(v, h), attachmentsPanel(v, h)]),
    relatedPanel(v, h),
    el('details', { className: 'panel history-panel' }, [
      el('summary', { text: 'Historie incidentu (' + t.history.length + ')' }),
      el('ol', { className: 'history-list' }, [...t.history].reverse().map(e => el('li', {}, [
        el('strong', { text: e.label }),
        el('span', { className: 'muted', text: e.actorName + ' · ' + formatDate(e.createdAt) }),
        e.from !== e.to ? el('span', { className: 'badge', text: (statusLabels[e.from] || 'Nové hlášení') + ' → ' + statusLabels[e.to] }) : null,
        el('p', { className: 'pre-wrap', text: e.note }),
      ]))),
    ]),
  ]);
}

function draftArea(v, h, key, label, placeholder) {
  return field(label, el('textarea', { name: key, value: v.detailDraft[key] ?? '', placeholder, disabled: v.isSubmitting, onInput: e => h.onDraftChange(key, e.target.value) }));
}

function workflowPanel(v, h) {
  const t = v.ticket, c = t.capabilities;
  const parts = [
    el('h2', { text: 'Průběh řešení' }),
    el('div', { className: 'button-row' }, [
      c.canAssign ? btn('Převzít k řešení', 'primary-button', h.onAssign, v.isSubmitting) : null,
      c.canResume ? btn('Pokračovat v řešení', 'primary-button', h.onResume, v.isSubmitting) : null,
      c.canClose ? btn('Ověřeno – uzavřít incident', 'primary-button', h.onClose, v.isSubmitting) : null,
    ]),
  ];
  if (t.status === 'NEW' && !c.canAssign) parts.push(el('p', { className: 'muted', text: 'Incident byl předán IT oddělení a čeká na převzetí.' }));
  if (c.canResolve) parts.push(el('form', { className: 'workflow-form', onSubmit: e => { e.preventDefault(); h.onResolve(new FormData(e.currentTarget).get('resolution')); } }, [
    draftArea(v, h, 'resolution', 'Příčina a řešení problému', 'Co problém způsobilo a jak byl odstraněn? Alespoň 10 znaků.'),
    el('button', { type: 'submit', className: 'primary-button', text: 'Uložit řešení a označit jako vyřešené', disabled: v.isSubmitting }),
  ]));
  if (c.canWait) parts.push(el('form', { className: 'workflow-form', onSubmit: e => { e.preventDefault(); h.onWait(new FormData(e.currentTarget).get('waitingReason')); } }, [
    draftArea(v, h, 'waitingReason', 'Potřebujete další informace?', 'Popište, co má dispečer doplnit.'),
    el('button', { type: 'submit', className: 'secondary-button', text: 'Vyžádat doplnění informací', disabled: v.isSubmitting }),
  ]));
  if (t.resolution) parts.push(el('div', { className: 'resolution-note' }, [
    el('h3', { text: 'Zaznamenané řešení' }),
    el('p', { className: 'pre-wrap', text: t.resolution }),
    c.canPublish ? btn('Uložit řešení jako návod', 'secondary-button', h.onPublish, v.isSubmitting) : null,
  ]));
  if (c.canReopen) parts.push(el('form', { className: 'workflow-form', onSubmit: e => { e.preventDefault(); h.onReopen(new FormData(e.currentTarget).get('reopenReason')); } }, [
    draftArea(v, h, 'reopenReason', 'Problém přetrvává nebo se vrátil?', 'Uveďte důvod znovuotevření.'),
    el('button', { type: 'submit', className: 'secondary-button', text: 'Znovu otevřít incident', disabled: v.isSubmitting }),
  ]));
  return el('section', { className: 'panel' }, parts);
}

function repliesPanel(v, h) {
  const t = v.ticket;
  return el('section', { className: 'panel' }, [
    el('h2', { text: 'Komunikace s IT' }),
    el('div', { className: 'reply-list' }, t.replies.length
      ? t.replies.map(r => el('article', { className: 'reply' }, [el('strong', { text: r.authorName }), el('span', { text: formatDate(r.createdAt) }), el('p', { text: r.body })]))
      : [el('p', { className: 'muted', text: 'Zatím bez odpovědi.' })]),
    t.capabilities.canReply
      ? el('form', { className: 'reply-form', onSubmit: e => { e.preventDefault(); h.onAddReply(new FormData(e.currentTarget).get('body')); } }, [
          field('Nová odpověď', el('textarea', { name: 'body', value: v.replyDraft, placeholder: 'Doplňte informace nebo napište IT oddělení…', disabled: v.isSubmitting, onInput: e => h.onDraftChange('reply', e.target.value) })),
          el('button', { type: 'submit', className: 'primary-button', text: 'Přidat odpověď', disabled: v.isSubmitting }),
        ])
      : el('p', { className: 'muted', text: 'Incident je uzavřený. Pro další komunikaci jej nejprve znovu otevřete.' }),
  ]);
}

function attachmentsPanel(v, h) {
  const t = v.ticket;
  return el('section', { className: 'panel' }, [
    el('h2', { text: 'Přílohy a snímky chyby' }),
    el('p', { className: 'muted', text: 'PNG, JPG, WebP, PDF nebo TXT do 1 MB. Nejvýše 10 souborů na incident; celkem 2 MB v aplikaci.' }),
    el('div', { className: 'attachment-list' }, t.attachments.map(a => el('article', { className: 'attachment-card' }, [
      a.type.startsWith('image/') ? el('img', { src: a.dataUrl, alt: 'Příloha: ' + a.name, className: 'attachment-preview' }) : null,
      el('a', { href: a.dataUrl, download: a.name, text: a.name }),
      el('span', { className: 'muted', text: Math.ceil(a.size / 1024) + ' kB · ' + a.authorName }),
    ]))),
    t.attachments.length ? null : el('p', { className: 'muted', text: 'Zatím bez příloh.' }),
    t.capabilities.canReply ? field('Přidat přílohu', el('input', { type: 'file', name: 'attachment', accept: 'image/png,image/jpeg,image/webp,application/pdf,text/plain', disabled: v.isSubmitting, onChange: e => { const file = e.target.files?.[0]; if (file) h.onUpload(file); } })) : null,
  ]);
}

function relatedPanel(v, h) {
  const t = v.ticket;
  return el('section', { className: 'panel' }, [
    el('h2', { text: 'Související incidenty' }),
    el('p', { className: 'muted', text: 'Propojte opakovaná hlášení se společným hlavním incidentem.' }),
    v.parent ? btn(v.parent.id + ' · ' + v.parent.title, 'link-button', () => h.onOpenTicket(v.parent.id)) : null,
    ...v.children.map(child => btn(child.id + ' · ' + child.title, 'link-button', () => h.onOpenTicket(child.id))),
    t.capabilities.canLink ? el('form', { className: 'related-form', onSubmit: e => { e.preventDefault(); h.onLink(new FormData(e.currentTarget).get('parentId')); } }, [
      field('Hlavní incident', el('select', { name: 'parentId', disabled: v.isSubmitting, onChange: e => h.onDraftChange('parentId', e.target.value) }, [
        opt('', 'Bez hlavního incidentu', v.detailDraft.parentId ?? t.relatedTicketId ?? ''),
        ...v.relatedOptions.map(other => opt(other.id, other.id + ' · ' + other.title, v.detailDraft.parentId ?? t.relatedTicketId ?? '')),
      ])),
      el('button', { type: 'submit', className: 'secondary-button', text: 'Uložit propojení', disabled: v.isSubmitting }),
    ]) : null,
  ]);
}

function KnowledgeView({ viewState: v, handlers: h }) {
  return el('section', { className: 'page-stack' }, [
    el('div', { className: 'page-heading' }, [el('div', {}, [
      el('span', { className: 'eyebrow', text: 'ZNALOSTNÍ BÁZE' }),
      el('h1', { text: 'Ověřená řešení na jednom místě' }),
      el('p', { text: 'Návody uložené IT oddělením z vyřešených incidentů. Nalezeno: ' + v.articles.length }),
    ])]),
    el('section', { className: 'panel' }, [field('Hledat návod', el('input', { type: 'search', name: 'knowledgeSearch', value: v.query, placeholder: 'Problém, aplikace nebo řešení…', onInput: e => h.onSearch(e.target.value) }))]),
    ...v.articles.map(a => el('details', { className: 'panel knowledge-article' }, [
      el('summary', {}, [el('strong', { text: a.title }), el('span', { className: 'muted', text: a.id + ' · ' + a.categoryName + ' · ' + a.applicationName })]),
      el('p', { className: 'pre-wrap', text: a.body }),
      el('p', { className: 'muted', text: 'Uložil/a ' + a.authorName + ' · ' + formatDate(a.createdAt) }),
      a.canOpenSource ? btn('Otevřít zdrojový incident', 'secondary-button', () => h.onOpenTicket(a.sourceTicketId)) : null,
    ])),
    v.articles.length ? null : el('section', { className: 'panel empty-state' }, [el('h2', { text: 'Žádný odpovídající návod' }), el('p', { className: 'muted', text: 'Zkuste jiný dotaz. IT oddělení může nové návody uložit v detailu vyřešeného incidentu.' })]),
  ]);
}

function render(root, state, dispatch) {
  const focused = document.activeElement;
  const restoreFocus = focused?.name && root.contains(focused);
  const focusState = restoreFocus ? { name: focused.name, start: focused.selectionStart, end: focused.selectionEnd, scroll: window.scrollY } : null;

  root.replaceChildren();
  const viewState = selectViewState(state);
  const handlers = createHandlers(dispatch, viewState);
  const layoutData = selectLayoutData(state);
  const layoutHandlers = createLayoutHandlers(dispatch);

  let content;
  switch (viewState.type) {
    case 'LOADING': content = LoadingView(); break;
    case 'ERROR': content = ErrorView({ message: viewState.message, handlers }); break;
    case 'DASHBOARD': content = DashboardView({ viewState, handlers }); break;
    case 'TICKET_LIST': content = TicketListView({ viewState, handlers }); break;
    case 'TICKET_DETAIL': content = TicketDetailView({ viewState, handlers }); break;
    case 'KNOWLEDGE': content = KnowledgeView({ viewState, handlers }); break;
    default: content = ErrorView({ message: 'Neznámý view typ: ' + viewState.type, handlers });
  }

  root.appendChild(Layout({ layoutData, handlers: layoutHandlers, contentElement: content, activeView: viewState.type }));

  if (focusState) {
    const next = [...root.querySelectorAll('[name]')].find(e => e.name === focusState.name);
    if (next && !next.disabled && next.type !== 'file') {
      next.focus({ preventScroll: true });
      try { if (focusState.start !== null) next.setSelectionRange(focusState.start, focusState.end); } catch { }
      window.scrollTo(0, focusState.scroll);
    }
  }
}
