// Business pravidla, konstanty, šablony

const TicketStatus = Object.freeze({
  NEW: 'NEW',
  ASSIGNED: 'ASSIGNED',
  WAITING: 'WAITING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
});

const Priority = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

const Role = Object.freeze({
  DISPATCHER: 'DISPATCHER',
  IT_SUPPORT: 'IT_SUPPORT',
});

const Application = Object.freeze({ MOBILE: 'MOBILE', WEB: 'WEB' });
const Impact = Object.freeze({ SINGLE: 'SINGLE', TEAM: 'TEAM', ALL: 'ALL' });

const statusTransitions = Object.freeze({
  [TicketStatus.NEW]: [TicketStatus.ASSIGNED],
  [TicketStatus.ASSIGNED]: [TicketStatus.WAITING, TicketStatus.RESOLVED],
  [TicketStatus.WAITING]: [TicketStatus.ASSIGNED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.ASSIGNED],
  [TicketStatus.CLOSED]: [TicketStatus.ASSIGNED],
});

function canTransition(currentStatus, nextStatus) {
  return statusTransitions[currentStatus]?.includes(nextStatus) ?? false;
}

function getAllowedTransitions(ticket) {
  return statusTransitions[ticket.status] ?? [];
}

function canViewTicket(user, ticket) {
  return user.role === Role.IT_SUPPORT || ticket.dispatcherId === user.userId;
}

function canCreateTicket(user) {
  return user.role === Role.DISPATCHER;
}

function canAssignTicket(user, ticket) {
  return user.role === Role.IT_SUPPORT && ticket.status === TicketStatus.NEW;
}

function isAssignee(user, ticket) {
  return user.role === Role.IT_SUPPORT && ticket.assigneeId === user.userId;
}

function canResolveTicket(user, ticket) {
  return isAssignee(user, ticket) && ticket.status === TicketStatus.ASSIGNED;
}

function canWait(user, ticket) {
  return isAssignee(user, ticket) && ticket.status === TicketStatus.ASSIGNED;
}

function canResume(user, ticket) {
  return isAssignee(user, ticket) && ticket.status === TicketStatus.WAITING;
}

function canReopen(user, ticket) {
  return canViewTicket(user, ticket) && ['RESOLVED', 'CLOSED'].includes(ticket.status);
}

function canCloseTicket(user, ticket) {
  return ticket.status === TicketStatus.RESOLVED &&
    (user.role === Role.IT_SUPPORT || ticket.dispatcherId === user.userId);
}

function canReplyToTicket(user, ticket) {
  return canViewTicket(user, ticket) && ticket.status !== TicketStatus.CLOSED;
}

function assertText(value, minimum, message, maximum = 10000) {
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > maximum) {
    throw new Error(message);
  }
}

function assertResolution(value) {
  assertText(value, 10, 'Popište příčinu a řešení problému (alespoň 10 znaků).');
}

function assertReplyBody(body) {
  if (typeof body !== 'string' || body.trim().length < 3) {
    throw new Error('Odpověď musí mít alespoň 3 znaky.');
  }
}

function assertTicketTitle(title) {
  if (typeof title !== 'string' || title.trim().length < 5) {
    throw new Error('Název incidentu musí mít alespoň 5 znaků.');
  }
}

function assertTicketPayload(payload, categories) {
  assertTicketTitle(payload?.title);
  if (typeof payload.reporterName !== 'string' || payload.reporterName.trim().length < 2) {
    throw new Error('Uveďte jméno hlásícího technika nebo pracovníka (alespoň 2 znaky).');
  }
  if (!Object.values(Application).includes(payload.application)) {
    throw new Error('Vyberte mobilní nebo webovou aplikaci.');
  }
  if (typeof payload.workOrderId !== 'string') {
    throw new Error('Číslo pracovního příkazu musí být text.');
  }
  assertText(payload.description, 10, 'Popište problém alespoň 10 znaky.');
  for (const [name, maximum] of [['reporterContact', 100], ['specificApplication', 100], ['applicationVersion', 50], ['triedSteps', 5000]]) {
    if (payload[name] !== undefined) assertText(payload[name], 0, 'Neplatný nebo příliš dlouhý údaj: ' + name, maximum);
  }
  if (payload.impact !== undefined && !Object.values(Impact).includes(payload.impact)) {
    throw new Error('Vyberte platný rozsah dopadu.');
  }
  if (payload.occurredAt && !Number.isFinite(Date.parse(payload.occurredAt))) {
    throw new Error('Čas vzniku problému není platný.');
  }
  if (!Object.values(Priority).includes(payload.priority)) {
    throw new Error('Priorita musí být LOW, MEDIUM, HIGH nebo CRITICAL.');
  }
  if (!categories.some(c => c.id === payload.categoryId)) {
    throw new Error('Kategorie neexistuje.');
  }
}

const attachmentTypes = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain']);

function assertAttachment(file) {
  assertText(file?.name, 1, 'Neplatný název souboru.', 120);
  if (!attachmentTypes.includes(file.type) || !Number.isInteger(file.size) || file.size < 1 || file.size > 1024 * 1024) {
    throw new Error('Příloha musí být PNG, JPG, WebP, PDF nebo TXT do 1 MB.');
  }
  const prefix = `data:${file.type};base64,`;
  if (typeof file.dataUrl !== 'string' || !file.dataUrl.startsWith(prefix)) throw new Error('Neplatný obsah přílohy.');
  const base64 = file.dataUrl.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length > 1400000) throw new Error('Neplatný obsah přílohy.');
  const bytes = atob(base64);
  if (bytes.length !== file.size) throw new Error('Velikost přílohy neodpovídá obsahu.');
  const valid = file.type === 'text/plain'
    || (file.type === 'application/pdf' && bytes.startsWith('%PDF-'))
    || (file.type === 'image/png' && bytes.startsWith('\x89PNG\r\n\x1a\n'))
    || (file.type === 'image/jpeg' && bytes.startsWith('\xff\xd8\xff'))
    || (file.type === 'image/webp' && bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP');
  if (!valid) throw new Error('Obsah souboru neodpovídá jeho typu.');
}

const incidentTemplates = Object.freeze([
  { id: 'login', name: 'Nelze se přihlásit', title: 'Technik se nemůže přihlásit do aplikace', categoryId: 'cat-access', application: 'MOBILE',
    description: 'Chybová zpráva: \nKdy se problém objevil: \nBrání problém další práci: ', triedSteps: 'Ověření připojení: \nRestart aplikace: \nOvěření přihlašovacích údajů (bez zápisu hesla): ' },
  { id: 'delivery', name: 'Nepřichází práce do aplikace', title: 'Technik nevidí přidělenou práci', categoryId: 'cat-work-delivery', application: 'MOBILE',
    description: 'Jaká práce se nezobrazuje: \nJe příkaz vidět na webu: \nPoslední úspěšná synchronizace: ', triedSteps: 'Obnovení seznamu práce: \nOvěření připojení: ' },
  { id: 'completion', name: 'Nelze dokončit pracovní příkaz', title: 'Nelze dokončit pracovní příkaz', categoryId: 'cat-work-completion', application: 'MOBILE',
    description: 'Krok, ve kterém dokončení selže: \nChybová zpráva: \nJsou vyplněny povinné údaje: ', triedSteps: 'Opakování dokončení: \nObnovení aplikace: ' },
  { id: 'slow', name: 'Web je zpomalený', title: 'Webová aplikace reaguje se zpožděním', categoryId: 'cat-performance', application: 'WEB',
    description: 'Která obrazovka je pomalá: \nPřibližná délka odezvy: \nKoho problém zasahuje: ', triedSteps: 'Obnovení stránky: \nOvěření v jiném prohlížeči: ' },
]);
