// Akce a dispatcher

async function loadBootstrap({ store, api }) {
  store.setState(s => ({ ...s, ui: { ...s.ui, status: 'LOADING', errorMessage: null } }));
  let result;
  try { result = await api.getBootstrap(store.getState().auth); }
  catch { result = { status: 'ERROR', message: 'Data se nepodařilo načíst. Zkuste to znovu.' }; }
  if (result.status !== 'SUCCESS') {
    store.setState(s => ({ ...s, ui: { ...s.ui, status: 'ERROR', errorMessage: result.message } }));
    return;
  }
  store.setState(s => ({ ...s, tickets: result.tickets, users: result.users, categories: result.categories,
    templates: result.templates ?? [], knowledge: result.knowledge ?? [],
    ui: { ...s.ui, mode: 'DASHBOARD', status: 'READY', errorMessage: null } }));
}

async function changeRole({ store, api, payload }) {
  if (store.getState().ui.isSubmitting || store.getState().ui.status !== 'READY') return;
  const nextUser = store.getState().users.find(u => u.role === payload.role);
  if (!nextUser) return;
  const nextAuth = { userId: nextUser.id, role: nextUser.role, name: nextUser.name };
  store.setState(s => ({ ...s, ui: { ...s.ui, status: 'LOADING', errorMessage: null, notification: null } }));
  let result;
  try { result = await api.getBootstrap(nextAuth); }
  catch { result = { status: 'ERROR', message: 'Přepnutí role se nezdařilo. Zkuste to znovu.' }; }
  if (result.status !== 'SUCCESS') {
    store.setState(s => ({ ...s, ui: { ...s.ui, status: 'READY', errorMessage: result.message } }));
    return;
  }
  store.setState(s => ({ ...s, auth: nextAuth, tickets: result.tickets, users: result.users, categories: result.categories,
    templates: result.templates ?? [], knowledge: result.knowledge ?? [], selectedTicketId: null, ...loadDrafts(nextAuth.userId),
    ui: { ...s.ui, mode: 'DASHBOARD', status: 'READY', statusFilter: 'ALL', priorityFilter: 'ALL', query: '',
      applicationFilter: 'ALL', categoryFilter: 'ALL', mineOnly: false, notification: 'Role byla přepnuta.', errorMessage: null } }));
}

function enterDashboard({ store }) {
  store.setState(s => ({ ...s, selectedTicketId: null, ui: { ...s.ui, mode: 'DASHBOARD', notification: null, errorMessage: null } }));
}

function enterTicketList({ store }) {
  store.setState(s => ({ ...s, ui: { ...s.ui, mode: 'TICKET_LIST', notification: null, errorMessage: null } }));
}

function enterTicketDetail({ store, payload }) {
  store.setState(s => ({ ...s, selectedTicketId: payload.ticketId, ui: { ...s.ui, mode: 'TICKET_DETAIL', notification: null, errorMessage: null } }));
}

async function performMutation({ store, api, method, args, successMessage, prepare, complete }) {
  if (store.getState().ui.isSubmitting || store.getState().ui.status !== 'READY') return false;
  const identity = store.getState().auth;
  store.setState(s => ({ ...s, ...(prepare?.(s) ?? {}), ui: { ...s.ui, isSubmitting: true, errorMessage: null, notification: null } }));
  let result;
  try { result = await api[method](identity, ...args); }
  catch { result = { status: 'ERROR', message: 'Požadavek se nepodařilo dokončit. Zkuste to znovu.' }; }
  const success = result.status === 'SUCCESS';
  store.setState(s => ({ ...s,
    ...(success ? { tickets: result.tickets, users: result.users, categories: result.categories,
      templates: result.templates ?? s.templates, knowledge: result.knowledge ?? s.knowledge, ...(complete?.(s) ?? {}) } : {}),
    ui: { ...s.ui, isSubmitting: false, errorMessage: success ? null : result.message, notification: success ? successMessage : null } }));
  return success;
}

function createTicketAction({ store, api, payload }) {
  return performMutation({ store, api, method: 'createTicket', args: [payload], successMessage: 'Incident byl vytvořen.',
    prepare: s => ({ ticketDraft: { ...s.ticketDraft, ...payload } }),
    complete: () => ({ ticketDraft: createEmptyTicketDraft() }) });
}

function assignTicket({ store, api, payload }) {
  return performMutation({ store, api, method: 'assignTicket', args: [payload.ticketId], successMessage: 'Incident byl přiřazen.' });
}

function resolveTicket({ store, api, payload }) {
  return performMutation({ store, api, method: 'resolveTicket', args: [payload.ticketId, payload.resolution],
    complete: s => ({ detailDrafts: { ...s.detailDrafts, [payload.ticketId]: { ...s.detailDrafts[payload.ticketId], resolution: '' } } }),
    successMessage: 'Incident byl označen jako vyřešený.' });
}

function closeTicket({ store, api, payload }) {
  return performMutation({ store, api, method: 'closeTicket', args: [payload.ticketId], successMessage: 'Incident byl uzavřen.' });
}

function addReply({ store, api, payload }) {
  return performMutation({ store, api, method: 'addReply', args: [payload.ticketId, payload.body], successMessage: 'Odpověď byla přidána.',
    prepare: s => ({ replyDrafts: { ...s.replyDrafts, [payload.ticketId]: payload.body } }),
    complete: s => ({ replyDrafts: { ...s.replyDrafts, [payload.ticketId]: '' } }) });
}

function setFilters({ store, payload }) {
  const allowed = ['query', 'statusFilter', 'priorityFilter', 'categoryFilter', 'applicationFilter', 'mineOnly'];
  store.setState(s => ({ ...s, ui: { ...s.ui, ...Object.fromEntries(Object.entries(payload).filter(([k]) => allowed.includes(k))), notification: null } }));
}

function updateDraft({ store, payload }) {
  const keys = Object.keys(createEmptyTicketDraft());
  store.setState(s => ({ ...s, ticketDraft: { ...s.ticketDraft, ...Object.fromEntries(Object.entries(payload).filter(([k, v]) => keys.includes(k) && typeof v === 'string')) } }));
}

function updateDetailDraft({ store, payload }) {
  const { ticketId, field, value } = payload;
  if (typeof value !== 'string') return;
  store.setState(s => field === 'reply'
    ? { ...s, replyDrafts: { ...s.replyDrafts, [ticketId]: value } }
    : { ...s, detailDrafts: { ...s.detailDrafts, [ticketId]: { ...s.detailDrafts[ticketId], [field]: value } } });
}

function applyTemplate({ store, payload }) {
  const template = store.getState().templates.find(t => t.id === payload.templateId);
  if (!template) return;
  store.setState(s => ({ ...s, ticketDraft: { ...s.ticketDraft, title: template.title, description: template.description, triedSteps: template.triedSteps, categoryId: template.categoryId, application: template.application },
    ui: { ...s.ui, notification: 'Šablona byla vložena. Doplňte odpovědi a údaje hlášení.' } }));
}

function enterKnowledge({ store }) {
  store.setState(s => ({ ...s, selectedTicketId: null, ui: { ...s.ui, mode: 'KNOWLEDGE', notification: null, errorMessage: null } }));
}

function searchKnowledge({ store, payload }) {
  store.setState(s => ({ ...s, ui: { ...s.ui, knowledgeQuery: payload.query } }));
}

const extendedDefs = {
  WAIT_FOR_INFO: ['waitForInfo', 'Incident čeká na doplnění informací.', 'reason'],
  RESUME_TICKET: ['resumeTicket', 'Řešení incidentu pokračuje.'],
  REOPEN_TICKET: ['reopenTicket', 'Incident byl znovu otevřen.', 'reason'],
  LINK_RELATED: ['linkRelatedTicket', 'Vazba na související incident byla uložena.', 'parentId'],
  PUBLISH_KNOWLEDGE: ['publishKnowledge', 'Řešení bylo uloženo do znalostní báze.'],
};

function extendedMutation({ store, api, payload, type }) {
  const [method, successMessage, field] = extendedDefs[type];
  return performMutation({ store, api, method, successMessage, args: field ? [payload.ticketId, payload[field]] : [payload.ticketId] });
}

async function uploadAttachment({ store, api, payload }) {
  if (store.getState().ui.isSubmitting) return;
  return performMutation({ store, api: {
    addAttachment: async (identity, id, file) => {
      try { return await api.addAttachment(identity, id, await readAttachment(file)); }
      catch (error) { return { status: 'ERROR', message: error.message }; }
    },
  }, method: 'addAttachment', args: [payload.ticketId, payload.file], successMessage: 'Příloha byla uložena.' });
}

function exportTickets({ store }) {
  try {
    downloadCsv(ticketsToCsv(selectFilteredTickets(store.getState())));
    store.setState(s => ({ ...s, ui: { ...s.ui, notification: 'Export vyfiltrovaných incidentů byl připraven.', errorMessage: null } }));
  } catch {
    store.setState(s => ({ ...s, ui: { ...s.ui, errorMessage: 'Export se nepodařilo stáhnout.' } }));
  }
}

function createDispatcher(store, api) {
  return async function dispatch(action) {
    const { type, payload = {} } = action ?? {};
    switch (type) {
      case 'APP_INIT': return loadBootstrap({ store, api });
      case 'CHANGE_ROLE': return changeRole({ store, api, payload });
      case 'ENTER_DASHBOARD': return enterDashboard({ store });
      case 'ENTER_TICKET_LIST': return enterTicketList({ store });
      case 'ENTER_TICKET_DETAIL': return enterTicketDetail({ store, payload });
      case 'CREATE_TICKET': return createTicketAction({ store, api, payload });
      case 'ASSIGN_TICKET': return assignTicket({ store, api, payload });
      case 'RESOLVE_TICKET': return resolveTicket({ store, api, payload });
      case 'CLOSE_TICKET': return closeTicket({ store, api, payload });
      case 'ADD_REPLY': return addReply({ store, api, payload });
      case 'SET_FILTERS': return setFilters({ store, payload });
      case 'UPDATE_TICKET_DRAFT': return updateDraft({ store, payload });
      case 'UPDATE_DETAIL_DRAFT': return updateDetailDraft({ store, payload });
      case 'APPLY_TEMPLATE': return applyTemplate({ store, payload });
      case 'ENTER_KNOWLEDGE': return enterKnowledge({ store });
      case 'SEARCH_KNOWLEDGE': return searchKnowledge({ store, payload });
      case 'UPLOAD_ATTACHMENT': return uploadAttachment({ store, api, payload });
      case 'EXPORT_TICKETS': return exportTickets({ store });
      case 'ENTER_MY_TICKETS':
        setFilters({ store, payload: { query: '', statusFilter: 'ALL', priorityFilter: 'ALL', applicationFilter: 'ALL', categoryFilter: 'ALL', mineOnly: true } });
        return enterTicketList({ store });
      case 'WAIT_FOR_INFO':
      case 'RESUME_TICKET':
      case 'REOPEN_TICKET':
      case 'LINK_RELATED':
      case 'PUBLISH_KNOWLEDGE':
        return extendedMutation({ store, api, payload, type });
      default:
        console.warn('Unknown action type: ' + type);
    }
  };
}
