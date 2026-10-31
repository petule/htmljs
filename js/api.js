// Mock API a pomocné funkce pro soubory a export

const DATA_KEY = 'it-dispecink-data-v1';

function createMockApi({ storage = null, now = () => new Date() } = {}) {
  const clone = v => structuredClone(v);
  const fail = (message, code = 'BUSINESS_RULE_VIOLATION') => ({ status: 'ERROR', code, message });
  const nextId = (prefix, rows) => prefix + (Math.max(0, ...rows.map(r => Number(r.id?.replace(prefix, '')) || 0)) + 1);

  let data = createSeedData();
  let storageError = null;

  if (storage) {
    try {
      const saved = storage.getItem(DATA_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (!validDataset(parsed)) throw new Error('Invalid stored dataset');
        data = parsed;
      }
    } catch {
      storageError = 'Uložená data nelze načíst. Obnovte přístup k úložišti nebo obnovte jeho zálohu.';
    }
  }

  function validDataset(d) {
    return d?.version === 1 && Array.isArray(d.tickets) && Array.isArray(d.knowledge)
      && d.tickets.every(t => typeof t.id === 'string' && typeof t.title === 'string'
        && typeof t.description === 'string' && typeof t.reporterName === 'string'
        && typeof t.workOrderId === 'string' && ['MOBILE', 'WEB'].includes(t.application)
        && Object.values(TicketStatus).includes(t.status) && Object.values(Priority).includes(t.priority)
        && users.some(u => u.id === t.dispatcherId) && categories.some(c => c.id === t.categoryId)
        && Number.isFinite(Date.parse(t.createdAt)) && Number.isFinite(Date.parse(t.updatedAt))
        && Array.isArray(t.replies) && Array.isArray(t.history) && Array.isArray(t.attachments)
        && t.attachments.every(a => { try { assertAttachment(a); return true; } catch { return false; } }))
      && d.knowledge.every(a => typeof a.id === 'string' && typeof a.title === 'string' && typeof a.body === 'string');
  }

  const timestamp = () => now().toISOString();

  function publicDataFor(user) {
    return { status: 'SUCCESS', ...clone({ tickets: data.tickets.filter(t => canViewTicket(user, t)), users, categories, templates: incidentTemplates, knowledge: data.knowledge }) };
  }

  function requireTicket(id) {
    const ticket = data.tickets.find(t => t.id === id);
    if (!ticket) { const e = new Error('Incident nebyl nalezen.'); e.code = 'NOT_FOUND'; throw e; }
    return ticket;
  }

  function addEvent(ticket, user, type, note, from = ticket.status) {
    const createdAt = timestamp();
    ticket.history.push({ id: nextId('h-', data.tickets.flatMap(t => t.history)), type, actorId: user.userId, createdAt, from, to: ticket.status, note });
    ticket.updatedAt = createdAt;
  }

  function operation(handler, mutates = true) {
    return async (identity, ...args) => {
      const known = users.find(u => u.id === identity?.userId);
      if (!known || known.role !== identity.role) return fail('Neplatný uživatel nebo role.', 'FORBIDDEN');
      if (storageError) return fail(storageError, 'STORAGE_ERROR');
      const user = { userId: known.id, role: known.role };
      const before = mutates ? clone(data) : null;
      try {
        const result = handler(user, ...args);
        if (result?.status === 'ERROR') { if (before) data = before; return result; }
        if (mutates && storage) {
          try { storage.setItem(DATA_KEY, JSON.stringify(data)); }
          catch { data = before; return fail('Změnu se nepodařilo uložit. Úložiště je nedostupné nebo plné.', 'STORAGE_ERROR'); }
        }
        return publicDataFor(user);
      } catch (error) {
        if (before) data = before;
        return fail(error.message, error.code ?? 'BUSINESS_RULE_VIOLATION');
      }
    };
  }

  function transition(user, id, target, allowed, type, note) {
    const ticket = requireTicket(id);
    if (!allowed(user, ticket)) return fail('Pro tuto akci nemáte oprávnění nebo incident není v odpovídajícím stavu.', 'FORBIDDEN');
    if (!canTransition(ticket.status, target)) return fail('Nepovolený stavový přechod.');
    const from = ticket.status;
    ticket.status = target;
    if (target === 'ASSIGNED' && !ticket.assigneeId) ticket.assigneeId = user.userId;
    addEvent(ticket, user, type, note, from);
    return null;
  }

  return {
    getBootstrap: operation(() => null, false),

    createTicket: operation((user, payload) => {
      if (!canCreateTicket(user)) return fail('Incident může vytvořit pouze dispečer.', 'FORBIDDEN');
      assertTicketPayload(payload, categories);
      const createdAt = timestamp();
      const occurredAt = payload.occurredAt ? new Date(payload.occurredAt).toISOString() : createdAt;
      if (Date.parse(occurredAt) > Date.parse(createdAt)) return fail('Vznik problému nemůže být v budoucnosti.');
      const ticket = { id: nextId('T-', data.tickets), title: payload.title.trim(), description: payload.description.trim(),
        reporterName: payload.reporterName.trim(), reporterContact: (payload.reporterContact ?? '').trim(),
        application: payload.application, specificApplication: (payload.specificApplication ?? '').trim(),
        applicationVersion: (payload.applicationVersion ?? '').trim(), impact: payload.impact ?? 'SINGLE',
        triedSteps: (payload.triedSteps ?? '').trim(), occurredAt, workOrderId: payload.workOrderId.trim(),
        categoryId: payload.categoryId, priority: payload.priority, status: 'NEW', dispatcherId: user.userId,
        assigneeId: null, createdAt, updatedAt: createdAt, replies: [], history: [], attachments: [],
        resolution: '', waitingReason: '', relatedTicketId: null };
      data.tickets.unshift(ticket);
      addEvent(ticket, user, 'CREATED', 'Incident byl nahlášen.', null);
    }),

    assignTicket: operation((user, id) => transition(user, id, 'ASSIGNED', canAssignTicket, 'ASSIGNED', 'IT převzalo incident k řešení.')),

    resolveTicket: operation((user, id, resolution) => {
      const ticket = requireTicket(id);
      if (!canResolveTicket(user, ticket)) return fail('Vyřešit může jen přiřazený pracovník IT ve stavu V řešení.', 'FORBIDDEN');
      assertResolution(resolution);
      const result = transition(user, id, 'RESOLVED', canResolveTicket, 'RESOLVED', resolution.trim());
      if (!result) { ticket.resolution = resolution.trim(); ticket.waitingReason = ''; }
      return result;
    }),

    closeTicket: operation((user, id) => transition(user, id, 'CLOSED', canCloseTicket, 'CLOSED', 'Řešení bylo ověřeno a incident uzavřen.')),

    waitForInfo: operation((user, id, reason) => {
      const ticket = requireTicket(id);
      if (!canWait(user, ticket)) return fail('Doplnění může vyžádat pouze přiřazený pracovník IT.', 'FORBIDDEN');
      assertText(reason, 5, 'Napište, jaké informace potřebujete (alespoň 5 znaků).');
      const result = transition(user, id, 'WAITING', canWait, 'WAITING', reason.trim());
      if (!result) ticket.waitingReason = reason.trim();
      return result;
    }),

    resumeTicket: operation((user, id) => {
      const ticket = requireTicket(id);
      const result = transition(user, id, 'ASSIGNED', canResume, 'RESUMED', 'Pokračování v řešení po doplnění informací.');
      if (!result) ticket.waitingReason = '';
      return result;
    }),

    reopenTicket: operation((user, id, reason) => {
      const ticket = requireTicket(id);
      if (!canReopen(user, ticket)) return fail('Znovu otevřít lze pouze vyřešený nebo uzavřený dostupný incident.', 'FORBIDDEN');
      assertText(reason, 5, 'Uveďte důvod znovuotevření (alespoň 5 znaků).');
      const result = transition(user, id, 'ASSIGNED', canReopen, 'REOPENED', reason.trim());
      if (!result) { ticket.resolution = ''; ticket.waitingReason = ''; }
      return result;
    }),

    addReply: operation((user, id, body) => {
      const ticket = requireTicket(id);
      if (!canReplyToTicket(user, ticket)) return fail('Do uzavřeného nebo cizího incidentu nelze odpovídat.', 'FORBIDDEN');
      assertReplyBody(body);
      const reply = { id: nextId('r-', data.tickets.flatMap(t => t.replies)), authorId: user.userId, body: body.trim(), createdAt: timestamp() };
      ticket.replies.push(reply);
      addEvent(ticket, user, 'REPLIED', reply.body);
    }),

    addAttachment: operation((user, id, attachment) => {
      const ticket = requireTicket(id);
      if (!canReplyToTicket(user, ticket)) return fail('K tomuto incidentu nelze přidat přílohu.', 'FORBIDDEN');
      assertAttachment(attachment);
      const total = data.tickets.flatMap(t => t.attachments).reduce((sum, a) => sum + a.size, 0);
      if (ticket.attachments.length >= 10 || total + attachment.size > 2 * 1024 * 1024) return fail('Limit příloh je 10 na incident a celkem 2 MB v aplikaci.');
      ticket.attachments.push({ id: nextId('a-', data.tickets.flatMap(t => t.attachments)), name: attachment.name, type: attachment.type, size: attachment.size, dataUrl: attachment.dataUrl, authorId: user.userId, createdAt: timestamp() });
      addEvent(ticket, user, 'ATTACHED', 'Přiložen soubor: ' + attachment.name);
    }),

    linkRelatedTicket: operation((user, id, parentId) => {
      const ticket = requireTicket(id);
      if (!canViewTicket(user, ticket) || ticket.status === 'CLOSED') return fail('Vazbu tohoto incidentu nelze upravit.', 'FORBIDDEN');
      if (parentId) {
        const parent = requireTicket(parentId);
        if (!canViewTicket(user, parent)) return fail('Související incident není dostupný.', 'FORBIDDEN');
        let cursor = parent;
        const seen = new Set();
        while (cursor) {
          if (cursor.id === id || seen.has(cursor.id)) return fail('Incident nelze propojit sám se sebou ani vytvořit kruhovou vazbu.');
          seen.add(cursor.id);
          cursor = cursor.relatedTicketId ? requireTicket(cursor.relatedTicketId) : null;
        }
      }
      ticket.relatedTicketId = parentId || null;
      addEvent(ticket, user, 'LINKED', parentId ? 'Propojeno s hlavním incidentem ' + parentId : 'Vazba na hlavní incident byla odebrána.');
    }),

    publishKnowledge: operation((user, id) => {
      const ticket = requireTicket(id);
      if (user.role !== Role.IT_SUPPORT || !['RESOLVED', 'CLOSED'].includes(ticket.status)) return fail('Návod může uložit IT z vyřešeného incidentu.', 'FORBIDDEN');
      assertResolution(ticket.resolution);
      if (data.knowledge.some(a => a.sourceTicketId === id)) return fail('Návod z tohoto incidentu již existuje.');
      data.knowledge.unshift({ id: nextId('KB-', data.knowledge), sourceTicketId: id, title: ticket.title, body: ticket.resolution, categoryId: ticket.categoryId, application: ticket.application, authorId: user.userId, createdAt: timestamp() });
      addEvent(ticket, user, 'PUBLISHED', 'Řešení bylo přidáno do znalostní báze.');
    }),
  };
}

function ticketsToCsv(tickets) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = [
    ['ID', 'Název', 'Hlásí', 'Kontakt', 'Aplikace', 'Verze', 'Pracovní příkaz', 'Kategorie', 'Priorita', 'Stav', 'Dopad', 'Dispečer', 'Řešitel', 'Vznik', 'Nahlášeno', 'Řešení'],
    ...tickets.map(t => [t.id, t.title, t.reporterName, t.reporterContact, t.specificApplication || t.applicationName, t.applicationVersion, t.workOrderId, t.categoryName, t.priorityLabel, t.statusLabel, t.impactLabel, t.dispatcherName, t.assigneeName, t.occurredAt, t.createdAt, t.resolution]),
  ];
  return '﻿' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}

function downloadCsv(content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'incidenty-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!file || file.size > 1024 * 1024) { reject(new Error('Vyberte soubor do 1 MB.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Soubor se nepodařilo přečíst.'));
    reader.onload = () => resolve({ name: file.name, size: file.size, type: file.type, dataUrl: reader.result });
    reader.readAsDataURL(file);
  });
}
