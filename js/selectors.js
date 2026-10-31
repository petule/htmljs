// Selektory — příprava dat pro UI

const normalizeSearch = value =>
  String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('cs');

const isActiveTicket = ticket => !['RESOLVED', 'CLOSED'].includes(ticket.status);

const userName = (state, id) => state.users.find(u => u.id === id)?.name ?? 'Neznámý uživatel';
const categoryName = (state, id) => state.categories.find(c => c.id === id)?.name ?? 'Bez kategorie';

function enrichTicket(state, ticket, now = Date.now()) {
  const overdue = isActiveTicket(ticket) && now - Date.parse(ticket.updatedAt) >= 24 * 60 * 60 * 1000;
  return {
    ...ticket,
    dispatcherName: userName(state, ticket.dispatcherId),
    assigneeName: ticket.assigneeId ? userName(state, ticket.assigneeId) : 'Nepřiřazeno',
    categoryName: categoryName(state, ticket.categoryId),
    applicationName: applicationLabels[ticket.application],
    statusLabel: statusLabels[ticket.status],
    priorityLabel: priorityLabels[ticket.priority],
    impactLabel: impactLabels[ticket.impact],
    allowedTransitions: getAllowedTransitions(ticket),
    overdue,
    attentionReason: [
      ticket.status === 'NEW' ? 'Nový incident' : '',
      isActiveTicket(ticket) && ticket.priority === 'CRITICAL' ? 'Kritická priorita' : '',
      overdue ? 'Bez aktualizace déle než 24 hodin' : '',
    ].filter(Boolean).join(' · '),
    replies: ticket.replies.map(r => ({ ...r, authorName: userName(state, r.authorId) })),
    history: ticket.history.map(e => ({ ...e, actorName: userName(state, e.actorId), label: eventLabels[e.type] ?? e.type })),
    attachments: ticket.attachments.map(a => ({ ...a, authorName: userName(state, a.authorId) })),
    capabilities: {
      canAssign: canAssignTicket(state.auth, ticket),
      canResolve: canResolveTicket(state.auth, ticket),
      canClose: canCloseTicket(state.auth, ticket),
      canReply: canReplyToTicket(state.auth, ticket),
      canWait: canWait(state.auth, ticket),
      canResume: canResume(state.auth, ticket),
      canReopen: canReopen(state.auth, ticket),
      canLink: ticket.status !== 'CLOSED',
      canPublish: state.auth.role === 'IT_SUPPORT' && ['RESOLVED', 'CLOSED'].includes(ticket.status)
        && !state.knowledge.some(a => a.sourceTicketId === ticket.id),
    },
  };
}

function selectFilteredTickets(state) {
  const query = normalizeSearch(state.ui.query).trim();
  return state.tickets
    .filter(t => state.ui.statusFilter === 'ALL' || t.status === state.ui.statusFilter)
    .filter(t => state.ui.priorityFilter === 'ALL' || t.priority === state.ui.priorityFilter)
    .filter(t => state.ui.applicationFilter === 'ALL' || t.application === state.ui.applicationFilter)
    .filter(t => state.ui.categoryFilter === 'ALL' || t.categoryId === state.ui.categoryFilter)
    .filter(t => !state.ui.mineOnly || (t.assigneeId === state.auth.userId && isActiveTicket(t)))
    .filter(t => !query || normalizeSearch([t.id, t.title, t.reporterName, t.workOrderId, t.description, t.specificApplication].join(' ')).includes(query))
    .map(t => enrichTicket(state, t));
}

function selectLayoutData(state) {
  return { auth: state.auth, notification: state.ui.notification, errorMessage: state.ui.errorMessage,
    draftWarning: state.ui.draftWarning, isBusy: state.ui.isSubmitting || state.ui.status === 'LOADING',
    isSupport: state.auth.role === 'IT_SUPPORT' };
}

function selectDashboardView(state) {
  const tickets = state.tickets.map(t => enrichTicket(state, t));
  const counts = { total: state.tickets.length, new: 0, assigned: 0, waiting: 0, resolved: 0, closed: 0, critical: 0 };
  for (const t of state.tickets) { counts[t.status.toLowerCase()]++; if (isActiveTicket(t) && t.priority === 'CRITICAL') counts.critical++; }
  return {
    type: 'DASHBOARD', summary: counts,
    recentTickets: tickets.slice(0, 4),
    attentionTickets: tickets.filter(t => t.attentionReason).sort((a, b) => (b.priority === 'CRITICAL') - (a.priority === 'CRITICAL') || Date.parse(a.updatedAt) - Date.parse(b.updatedAt)),
    categoryStats: state.categories.map(c => ({ ...c, count: state.tickets.filter(t => t.categoryId === c.id).length })).sort((a, b) => b.count - a.count),
    ticketDraft: state.ticketDraft, isSubmitting: state.ui.isSubmitting, categories: state.categories, templates: state.templates,
    capabilities: { canCreateTicket: canCreateTicket(state.auth) },
    mineCount: state.tickets.filter(t => t.assigneeId === state.auth.userId && isActiveTicket(t)).length,
  };
}

function selectTicketListView(state) {
  return { type: 'TICKET_LIST', tickets: selectFilteredTickets(state), ...state.ui, categories: state.categories, isSupport: state.auth.role === 'IT_SUPPORT' };
}

function selectTicketDetailView(state) {
  const raw = state.tickets.find(t => t.id === state.selectedTicketId);
  return { type: 'TICKET_DETAIL', ticket: raw ? enrichTicket(state, raw) : null,
    replyDraft: state.replyDrafts[state.selectedTicketId] ?? '',
    detailDraft: state.detailDrafts[state.selectedTicketId] ?? {},
    isSubmitting: state.ui.isSubmitting,
    relatedOptions: state.tickets.filter(t => t.id !== state.selectedTicketId).map(t => ({ id: t.id, title: t.title })),
    parent: state.tickets.find(t => t.id === raw?.relatedTicketId) ?? null,
    children: state.tickets.filter(t => t.relatedTicketId === raw?.id),
  };
}

function selectKnowledgeView(state) {
  const query = normalizeSearch(state.ui.knowledgeQuery).trim();
  return { type: 'KNOWLEDGE', query: state.ui.knowledgeQuery,
    articles: state.knowledge
      .map(a => ({ ...a, categoryName: categoryName(state, a.categoryId), authorName: userName(state, a.authorId), applicationName: applicationLabels[a.application], canOpenSource: state.tickets.some(t => t.id === a.sourceTicketId) }))
      .filter(a => !query || normalizeSearch([a.title, a.body, a.categoryName, a.applicationName].join(' ')).includes(query)) };
}

function selectViewState(state) {
  if (state.ui.status === 'LOADING') return { type: 'LOADING' };
  if (state.ui.status === 'ERROR') return { type: 'ERROR', message: state.ui.errorMessage };
  switch (state.ui.mode) {
    case 'DASHBOARD': return selectDashboardView(state);
    case 'TICKET_LIST': return selectTicketListView(state);
    case 'TICKET_DETAIL': return selectTicketDetailView(state);
    case 'KNOWLEDGE': return selectKnowledgeView(state);
    default: return { type: 'ERROR', message: 'Neznámý režim UI: ' + state.ui.mode };
  }
}
