// Seed data, popisky, počáteční stav

const users = [
  { id: 'u-1', name: 'Jana Nováková', role: Role.DISPATCHER },
  { id: 'u-2', name: 'Petr Svoboda', role: Role.DISPATCHER },
  { id: 'u-3', name: 'Eva Dvořáková', role: Role.IT_SUPPORT },
  { id: 'u-4', name: 'Lukáš Černý', role: Role.IT_SUPPORT },
];

const categories = [
  { id: 'cat-access', name: 'Přihlášení do aplikace' },
  { id: 'cat-work-delivery', name: 'Nepřichází práce do aplikace' },
  { id: 'cat-work-completion', name: 'Dokončení pracovního příkazu' },
  { id: 'cat-performance', name: 'Zpomalení a zpoždění aplikace' },
  { id: 'cat-other', name: 'Jiná chyba aplikace' },
];

const statusLabels = Object.freeze({ NEW: 'Nový', ASSIGNED: 'V řešení', WAITING: 'Čeká na doplnění', RESOLVED: 'Vyřešený', CLOSED: 'Uzavřený' });
const priorityLabels = Object.freeze({ LOW: 'Nízká', MEDIUM: 'Střední', HIGH: 'Vysoká', CRITICAL: 'Kritická' });
const impactLabels = Object.freeze({ SINGLE: 'Jeden pracovník', TEAM: 'Více pracovníků / tým', ALL: 'Celý dispečink' });
const applicationLabels = Object.freeze({ MOBILE: 'Mobilní aplikace technika', WEB: 'Webová aplikace dispečinku' });
const eventLabels = Object.freeze({ CREATED: 'Nahlášení', ASSIGNED: 'Převzetí IT', WAITING: 'Vyžádání informací', RESUMED: 'Pokračování v řešení', RESOLVED: 'Vyřešení', CLOSED: 'Uzavření', REOPENED: 'Znovuotevření', REPLIED: 'Odpověď', ATTACHED: 'Příloha', LINKED: 'Související incident', PUBLISHED: 'Znalostní báze' });

function createEmptyTicketDraft() {
  return {
    title: '', description: '', categoryId: '', priority: 'MEDIUM',
    reporterName: '', application: 'MOBILE', workOrderId: '',
    reporterContact: '', specificApplication: '', applicationVersion: '',
    occurredAt: '', impact: 'SINGLE', triedSteps: '',
  };
}

function createInitialState() {
  return {
    tickets: [], users: [], categories: [], knowledge: [], templates: [],
    selectedTicketId: null,
    ticketDraft: createEmptyTicketDraft(),
    replyDrafts: {},
    detailDrafts: {},
    auth: { userId: 'u-1', role: 'DISPATCHER', name: 'Jana Nováková' },
    ui: {
      mode: 'DASHBOARD', status: 'LOADING', errorMessage: null, notification: null,
      statusFilter: 'ALL', priorityFilter: 'ALL', query: '', applicationFilter: 'ALL',
      categoryFilter: 'ALL', mineOnly: false, knowledgeQuery: '', draftWarning: null,
      isSubmitting: false,
    },
  };
}

function createSeedData() {
  const initialTickets = [
    { id: 'T-1001', title: 'Technik se nemůže přihlásit do mobilní aplikace',
      description: 'Technik telefonicky hlásí, že aplikace po zadání přihlašovacích údajů zobrazí chybu. Restart aplikace nepomohl. Dispečer předává incident IT oddělení.',
      reporterName: 'Martin Dvořák', application: 'MOBILE', workOrderId: '', categoryId: 'cat-access',
      priority: Priority.HIGH, status: TicketStatus.NEW, dispatcherId: 'u-1', assigneeId: null, createdAt: '2026-07-01 09:15',
      replies: [{ id: 'r-1', authorId: 'u-1', body: 'Zapsáno podle telefonátu technika. Prosím IT oddělení o prověření přístupu do aplikace.', createdAt: '2026-07-01 09:22' }] },
    { id: 'T-1002', title: 'Technikovi nepřichází pracovní příkaz do aplikace',
      description: 'Technik telefonicky hlásí, že v mobilní aplikaci nevidí přidělenou práci. Dispečer ověřil, že příkaz je ve webové aplikaci přidělený.',
      reporterName: 'Tomáš Novotný', application: 'MOBILE', workOrderId: 'PP-DEMO-2026-0142', categoryId: 'cat-work-delivery',
      priority: Priority.MEDIUM, status: TicketStatus.ASSIGNED, dispatcherId: 'u-2', assigneeId: 'u-3', createdAt: '2026-06-30 14:40',
      replies: [{ id: 'r-2', authorId: 'u-3', body: 'IT oddělení incident převzalo. Prověřuji synchronizaci pracovního příkazu do mobilní aplikace.', createdAt: '2026-06-30 15:05' }] },
    { id: 'T-1003', title: 'Webová aplikace zobrazuje změny se zpožděním',
      description: 'Dispečer zaznamenal pomalé načítání přehledu práce. Změny stavů pracovních příkazů se na webu zobrazují se zpožděním.',
      reporterName: 'Jana Nováková – dispečink', application: 'WEB', workOrderId: '', categoryId: 'cat-performance',
      priority: Priority.LOW, status: TicketStatus.RESOLVED, dispatcherId: 'u-1', assigneeId: 'u-3', createdAt: '2026-06-28 11:10',
      replies: [{ id: 'r-3', authorId: 'u-3', body: 'Zpoždění aktualizací bylo odstraněno. Prosím dispečink o ověření rychlosti webové aplikace a uzavření incidentu.', createdAt: '2026-06-28 12:30' }] },
  ];

  let eventId = 1;
  const tickets = structuredClone(initialTickets).map(ticket => {
    const createdAt = new Date(ticket.createdAt.replace(' ', 'T') + 'Z').toISOString();
    const resolution = ticket.status === 'RESOLVED' ? ticket.replies.at(-1).body : '';
    const history = [{ id: 'h-' + eventId++, type: 'CREATED', actorId: ticket.dispatcherId, createdAt, from: null, to: 'NEW', note: 'Incident byl nahlášen.' }];
    if (ticket.assigneeId) history.push({ id: 'h-' + eventId++, type: 'ASSIGNED', actorId: ticket.assigneeId, createdAt, from: 'NEW', to: 'ASSIGNED', note: 'Převzetí incidentu.' });
    if (resolution) history.push({ id: 'h-' + eventId++, type: 'RESOLVED', actorId: ticket.assigneeId, createdAt, from: 'ASSIGNED', to: 'RESOLVED', note: resolution });
    return { ...ticket, createdAt, updatedAt: createdAt, occurredAt: createdAt,
      reporterContact: '', specificApplication: ticket.application === 'MOBILE' ? 'Servisní aplikace' : 'Dispečerský portál',
      applicationVersion: '', impact: 'SINGLE', triedSteps: 'Restart aplikace a ověření připojení.',
      resolution, waitingReason: '', relatedTicketId: null, attachments: [], history };
  });

  return {
    version: 1, tickets,
    knowledge: [{ id: 'KB-1', sourceTicketId: 'T-1003', title: 'Zpožděné aktualizace webové aplikace',
      body: tickets[2].resolution, categoryId: 'cat-performance', application: 'WEB', authorId: 'u-3', createdAt: tickets[2].createdAt }],
  };
}
