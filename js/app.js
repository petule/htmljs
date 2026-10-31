// Inicializace aplikace

const storage = browserStorage();
const initial = createInitialState();
const store = createStore({ ...initial, ...loadDrafts(initial.auth.userId, storage) });
const api = createMockApi({ storage });
const dispatch = createDispatcher(store, api);
const root = document.getElementById('app');

store.subscribe(state => {
  const warning = saveDrafts(state, storage);
  if (state.ui.draftWarning !== warning) {
    store.setState(s => ({ ...s, ui: { ...s.ui, draftWarning: warning } }));
    return;
  }
  render(root, state, dispatch);
});

dispatch({ type: 'APP_INIT' });
