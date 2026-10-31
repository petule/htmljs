// Centrální store a ukládání rozpracovaných formulářů

function createStore(initialState) {
  let state = initialState;
  const listeners = [];

  return {
    getState() { return state; },
    setState(updateFn) { state = updateFn(state); listeners.forEach(l => l(state)); },
    subscribe(listener) { listeners.push(listener); },
  };
}

function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function loadDrafts(userId, storage = browserStorage()) {
  const empty = { ticketDraft: createEmptyTicketDraft(), replyDrafts: {}, detailDrafts: {} };
  try {
    const parsed = JSON.parse(storage?.getItem('it-dispecink-drafts-' + userId) ?? 'null');
    if (!parsed || parsed.version !== 1) return empty;
    const strings = obj => Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => typeof v === 'string'));
    const fields = Object.keys(empty.ticketDraft);
    return {
      ticketDraft: { ...empty.ticketDraft, ...Object.fromEntries(Object.entries(strings(parsed.ticketDraft)).filter(([k]) => fields.includes(k))) },
      replyDrafts: strings(parsed.replyDrafts),
      detailDrafts: Object.fromEntries(Object.entries(parsed.detailDrafts ?? {}).map(([id, d]) => [id, strings(d)])),
    };
  } catch { return empty; }
}

function saveDrafts(state, storage = browserStorage()) {
  try {
    if (!storage) return 'Ukládání v prohlížeči není dostupné. Záznamy a rozepsané formuláře se zachovají jen do obnovení stránky.';
    storage.setItem('it-dispecink-drafts-' + state.auth.userId, JSON.stringify({
      version: 1, ticketDraft: state.ticketDraft, replyDrafts: state.replyDrafts, detailDrafts: state.detailDrafts,
    }));
    return null;
  } catch {
    return 'Rozepsaný formulář se nepodařilo uložit do prohlížeče. Před obnovením stránky si zkopírujte text.';
  }
}
