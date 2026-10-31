# Jak funguje IT dispečink — podrobný průvodce architekturou

Tento dokument ti vysvětlí, jak je aplikace postavená, proč jsou soubory rozdělené tak, jak jsou, a co se děje od chvíle, kdy uživatel otevře stránku, až po kliknutí na tlačítko a zobrazení výsledku. Nevyžaduje nic víc než základy JavaScriptu a HTML.

---

## 1. Velký obrázek — co aplikace vůbec dělá

IT dispečink je webová aplikace, která běží **výhradně v prohlížeči**. Není tu žádný server, žádná databáze, žádný backend. Veškerá data se ukládají do `localStorage` (úložiště prohlížeče) a aplikace se celá "drží" v paměti JavaScriptu jako jeden velký objekt zvaný **stav (state)**.

Aplikace umí:
- Evidovat IT incidenty (tikety) — jejich zakládání, přebírání, řešení, uzavírání
- Přepínat mezi dvěma rolemi: **Dispečer** (zakládá tikety) a **IT oddělení** (řeší je)
- Ukládat rozepsané formuláře průběžně, aby se neztratily při obnovení stránky
- Exportovat seznam tiketů do CSV
- Ukládat přílohy (obrázky, PDF) přímo do prohlížeče
- Spravovat znalostní bázi z vyřešených incidentů

---

## 2. Soubory a jejich role — přehled

```
index.html          ← vstupní bod, načítá všechny JS soubory
css/
  style.css         ← vzhled celé aplikace
js/
  domain.js         ← pravidla a konstanty (co smí kdo dělat)
  data.js           ← výchozí data a popisky
  store.js          ← "paměť" aplikace — uchovává stav
  api.js            ← simulovaný server (ukládá, načítá, validuje)
  selectors.js      ← připravuje data pro zobrazení
  actions.js        ← co se stane, když uživatel něco udělá
  views.js          ← kreslí HTML na obrazovku
  app.js            ← spouštěcí kód — všechno spojí dohromady
doc/
  architektura.md   ← tento soubor
```

Každý soubor má jednu jasnou odpovědnost. Tohle se nazývá **separation of concerns** (oddělení zodpovědností) a je to základ čitelného a udržitelného kódu.

---

## 3. Jak se aplikace spustí — krok za krokem

Když prohlížeč otevře `index.html`, stane se toto:

### 3.1 Prohlížeč načte HTML

```html
<body>
  <div id="app"></div>          <!-- sem se bude kreslit vše -->

  <script src="js/domain.js"></script>    <!-- 1. načte pravidla -->
  <script src="js/data.js"></script>      <!-- 2. načte data -->
  <script src="js/store.js"></script>     <!-- 3. načte paměť -->
  <script src="js/api.js"></script>       <!-- 4. načte api -->
  <script src="js/selectors.js"></script> <!-- 5. načte selektory -->
  <script src="js/actions.js"></script>   <!-- 6. načte akce -->
  <script src="js/views.js"></script>     <!-- 7. načte zobrazení -->
  <script src="js/app.js"></script>       <!-- 8. spustí vše -->
</body>
```

Skripty se načítají **shora dolů** a každý z nich smí používat jen to, co bylo definováno v souborech před ním. Proto je pořadí důležité.

### 3.2 Spustí se app.js

```js
const storage = browserStorage();           // přístup k localStorage
const initial = createInitialState();       // výchozí prázdný stav
const store = createStore({                 // vytvoření paměti aplikace
  ...initial,
  ...loadDrafts(initial.auth.userId, storage) // + načtení rozepsaných formulářů
});
const api = createMockApi({ storage });     // vytvoření "serveru"
const dispatch = createDispatcher(store, api); // vytvoření systému akcí
const root = document.getElementById('app');   // najde div#app v HTML
```

Pak se zaregistruje **posluchač změn stavu**:

```js
store.subscribe(state => {
  const warning = saveDrafts(state, storage);
  // ... uloží rozepsané formuláře
  render(root, state, dispatch); // překreslí celou stránku
});
```

A nakonec se vyšle první akce:

```js
dispatch({ type: 'APP_INIT' }); // "Ahoj, aplikace, nastartuj!"
```

---

## 4. Store — srdce aplikace

Soubor `store.js` obsahuje jednu funkci `createStore`. Ta vytváří objekt, který uchovává **celý stav aplikace** — jeden velký JavaScriptový objekt.

```js
function createStore(initialState) {
  let state = initialState;      // aktuální stav
  const listeners = [];          // seznam funkcí, které chtějí vědět o změnách

  return {
    getState()             // vrátí aktuální stav (pro čtení)
    setState(updateFn)     // změní stav a upozorní všechny posluchače
    subscribe(listener)    // přidá posluchače (funkci, která se zavolá při změně)
  };
}
```

### Jak vypadá stav (state)?

```js
{
  tickets: [...],         // seznam všech tiketů
  users: [...],           // seznam uživatelů
  categories: [...],      // kategorie incidentů
  knowledge: [...],       // znalostní báze
  templates: [...],       // šablony pro nové tikety
  selectedTicketId: null, // který tiket je právě otevřený
  ticketDraft: {...},     // rozepsaný formulář nového tiketu
  replyDrafts: {},        // rozepsané odpovědi (podle ID tiketu)
  detailDrafts: {},       // rozepsaná pole v detailu tiketu
  auth: {                 // přihlášený uživatel
    userId: 'u-1',
    role: 'DISPATCHER',
    name: 'Jana Nováková'
  },
  ui: {                   // stav uživatelského rozhraní
    mode: 'DASHBOARD',    // která obrazovka je aktivní
    status: 'LOADING',    // LOADING / READY / ERROR
    errorMessage: null,
    notification: null,
    statusFilter: 'ALL',  // filtry v seznamu tiketů
    priorityFilter: 'ALL',
    query: '',            // hledaný text
    isSubmitting: false,  // probíhá odesílání formuláře?
    draftWarning: null,   // varování při ukládání draftu
    ...
  }
}
```

### Proč je stav jeden velký objekt?

Protože pak existuje **jedno místo pravdy**. Kdykoli chceš vědět, co aplikace zobrazuje a proč, stačí se podívat na tento objekt. Nemusíš prohledávat desítky proměnných roztroušených po kódu.

---

## 5. Domain — pravidla hry

Soubor `domain.js` neukládá žádná data. Definuje, **co je povoleno a co ne**.

### Konstanty (výčty hodnot)

```js
const TicketStatus = Object.freeze({
  NEW: 'NEW',
  ASSIGNED: 'ASSIGNED',
  WAITING: 'WAITING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
});
```

`Object.freeze` znamená, že tyto hodnoty **nejde změnit**. Pokud by se někde omylem napsalo `TicketStatus.NEW = 'something'`, JavaScript to tiše ignoruje (nebo v strict mode hodí chybu). Zabrání to záhadným bugům.

### Stavový automat (state machine)

Tiket nemůže přeskočit libovolně z jednoho stavu do druhého. Existují povolené přechody:

```js
const statusTransitions = Object.freeze({
  NEW:      ['ASSIGNED'],              // Nový → jen Převzetí IT
  ASSIGNED: ['WAITING', 'RESOLVED'],   // V řešení → Čeká / Vyřešeno
  WAITING:  ['ASSIGNED'],              // Čeká → zpět V řešení
  RESOLVED: ['CLOSED', 'ASSIGNED'],    // Vyřešený → Uzavřít / Znovu otevřít
  CLOSED:   ['ASSIGNED'],              // Uzavřený → Znovu otevřít
});
```

Graficky to vypadá takto:

```
NEW → ASSIGNED ⇄ WAITING
         ↓
      RESOLVED → CLOSED
         ↑           ↑
     (znovu otevřít z obou)
```

Funkce `canTransition(currentStatus, nextStatus)` pak jednoduše zkontroluje, jestli je přechod povolený:

```js
function canTransition(currentStatus, nextStatus) {
  return statusTransitions[currentStatus]?.includes(nextStatus) ?? false;
}
```

### Oprávnění uživatelů

Každá akce má svou kontrolní funkci:

```js
function canAssignTicket(user, ticket) {
  return user.role === Role.IT_SUPPORT && ticket.status === TicketStatus.NEW;
}
// Přiřadit tiket může jen IT oddělení, a jen pokud je tiket Nový

function canResolveTicket(user, ticket) {
  return isAssignee(user, ticket) && ticket.status === TicketStatus.ASSIGNED;
}
// Vyřešit může jen ten, kdo je přiřazený řešitel, a jen pokud je tiket V řešení
```

Díky tomu je každé pravidlo na jednom místě. Pokud se změní politika ("uzavřít smí i dispečer"), upravíš **jednu funkci** a nikde jinde v kódu to neřešíš.

### Validace vstupů

```js
function assertTicketTitle(title) {
  if (typeof title !== 'string' || title.trim().length < 5) {
    throw new Error('Název incidentu musí mít alespoň 5 znaků.');
  }
}
```

`assert` funkce nic nevrátí — buď proběhnou tiše, nebo hodí chybu (`throw new Error`). Tato chyba se zachytí o patro výš v `api.js` a vrátí se jako chybová zpráva uživateli.

---

## 6. Data — výchozí hodnoty

Soubor `data.js` obsahuje:

- **Seed data** — ukázkové tikety, které se zobrazí při prvním spuštění
- **Popisky** — překlady kódů do čitelného textu (`statusLabels`, `priorityLabels`, atd.)
- **`createInitialState()`** — funkce, která sestaví prázdný stav aplikace
- **`createEmptyTicketDraft()`** — prázdný formulář pro nový tiket

```js
const statusLabels = Object.freeze({
  NEW: 'Nový',
  ASSIGNED: 'V řešení',
  WAITING: 'Čeká na doplnění',
  RESOLVED: 'Vyřešený',
  CLOSED: 'Uzavřený',
});
```

Díky tomu se v celém kódu pracuje s kódy (`'NEW'`, `'ASSIGNED'`), ale uživatel vidí čitelné texty. Pokud chceš přeložit aplikaci do angličtiny, změníš jen tento soubor.

---

## 7. API — simulovaný server

Soubor `api.js` je nejzajímavější část. Simuluje chování serverového API — jako kdyby aplikace volala skutečný server přes internet, ale vše běží lokálně v prohlížeči.

### Proč vůbec mock API?

Kdybys měl skutečný server, tvůj kód v actions.js by vypadal takto:
```js
const result = await fetch('/api/tickets', { method: 'POST', body: JSON.stringify(payload) });
```

Díky mock API vypadá kód úplně stejně, jen místo skutečného serveru voláš lokální objekt. Kdybys chtěla aplikaci připojit ke skutečnému serveru, stačí vyměnit `createMockApi` za skutečného HTTP klienta — zbytek kódu se nemění.

### Jak mock API funguje

```js
function createMockApi({ storage }) {
  let data = createSeedData(); // data v "paměti serveru"

  // Načtení dat z localStorage (pokud tam něco je)
  if (storage) {
    const saved = storage.getItem(DATA_KEY);
    if (saved) data = JSON.parse(saved);
  }

  // Pomocná funkce pro každou operaci
  function operation(handler, mutates = true) {
    return async (identity, ...args) => {
      // 1. Ověř, že uživatel existuje a má správnou roli
      const known = users.find(u => u.id === identity?.userId);
      if (!known) return fail('Neplatný uživatel.');

      // 2. Záloha dat (pro případ, že se něco pokazí)
      const before = mutates ? clone(data) : null;

      try {
        // 3. Spusť vlastní logiku
        const result = handler(user, ...args);

        // 4. Pokud se nepovedlo, obnov zálohu
        if (result?.status === 'ERROR') { data = before; return result; }

        // 5. Ulož do localStorage
        if (mutates && storage) storage.setItem(DATA_KEY, JSON.stringify(data));

        // 6. Vrať aktualizovaná data
        return publicDataFor(user);
      } catch (error) {
        data = before; // rollback při neočekávané chybě
        return fail(error.message);
      }
    };
  }
```

Klíčová myšlenka: pokud operace selže (validace, oprávnění, cokoliv), data se vrátí do stavu před pokusem o změnu. Nikdy nezůstanou v nekonzistentním stavu.

### Transakce — přechod stavu tiketu

```js
function transition(user, id, target, allowed, type, note) {
  const ticket = requireTicket(id);        // najdi tiket (nebo hoď chybu)
  if (!allowed(user, ticket))              // zkontroluj oprávnění
    return fail('Nemáte oprávnění...');
  if (!canTransition(ticket.status, target)) // zkontroluj stavový automat
    return fail('Nepovolený stavový přechod.');
  ticket.status = target;                  // změň stav
  addEvent(ticket, user, type, note);      // zapiš do historie
  return null;                             // null = success
}
```

---

## 8. Actions — co se stane po kliknutí

Soubor `actions.js` obsahuje funkce, které reagují na uživatelovy akce. Fungují jako **prostředník** mezi UI (views) a API.

### Dispatcher — ústřední přepínač

```js
function createDispatcher(store, api) {
  return async function dispatch(action) {
    const { type, payload = {} } = action;
    switch (type) {
      case 'APP_INIT':       return loadBootstrap({ store, api });
      case 'CREATE_TICKET':  return createTicketAction({ store, api, payload });
      case 'ASSIGN_TICKET':  return assignTicket({ store, api, payload });
      case 'RESOLVE_TICKET': return resolveTicket({ store, api, payload });
      // ... další akce
    }
  };
}
```

Každá akce je objekt se dvěma vlastnostmi:
- `type` — co se má stát (řetězec, konvencí velkými písmeny)
- `payload` — data, která akce potřebuje (volitelné)

```js
// Příklady akcí
dispatch({ type: 'ENTER_TICKET_DETAIL', payload: { ticketId: 'T-1001' } })
dispatch({ type: 'SET_FILTERS', payload: { statusFilter: 'NEW' } })
dispatch({ type: 'CREATE_TICKET', payload: { title: 'Nelze se přihlásit', ... } })
```

### Jak vypadá typická akce

```js
async function assignTicket({ store, api, payload }) {
  return performMutation({
    store, api,
    method: 'assignTicket',       // která metoda API se zavolá
    args: [payload.ticketId],     // s jakými argumenty
    successMessage: 'Incident byl přiřazen.',  // co zobrazit po úspěchu
  });
}
```

Veškerá "těžká práce" — zamknutí formuláře, volání API, zpracování výsledku, odemknutí — je schovaná v `performMutation`:

```js
async function performMutation({ store, api, method, args, successMessage, prepare, complete }) {
  // 1. Zamkni UI (disabled tlačítka, isSubmitting = true)
  store.setState(s => ({ ...s, ui: { ...s.ui, isSubmitting: true } }));

  // 2. Zavolej API
  let result;
  try { result = await api[method](identity, ...args); }
  catch { result = { status: 'ERROR', message: 'Požadavek se nepodařilo dokončit.' }; }

  const success = result.status === 'SUCCESS';

  // 3. Aktualizuj stav — buď nová data, nebo chybová zpráva
  store.setState(s => ({
    ...s,
    ...(success ? { tickets: result.tickets, ... } : {}),
    ui: {
      ...s.ui,
      isSubmitting: false,
      errorMessage: success ? null : result.message,
      notification: success ? successMessage : null
    }
  }));
}
```

### Immutable update pattern

Všimni si vzoru `{ ...s, ui: { ...s.ui, isSubmitting: true } }`. Místo toho, abychom napsali:
```js
s.ui.isSubmitting = true; // ŠPATNĚ — mutujeme stav přímo
```

Vytváříme **nový objekt**, který je kopií starého, ale s pozměněnou vlastností:
```js
store.setState(s => ({
  ...s,              // zkopíruj vše ze starého stavu
  ui: {              // ale ui nahraď novým objektem...
    ...s.ui,         // ...který je kopií starého ui...
    isSubmitting: true  // ...jen s touto změnou
}));
```

Proč? Protože `store.subscribe` pak může snadno poznat, že se stav změnil (jiná reference objektu), a překreslit UI.

---

## 9. Selectors — příprava dat pro zobrazení

Soubor `selectors.js` obsahuje funkce, které ze surového stavu připravují **obohacená data** vhodná pro zobrazení.

### Proč selektory?

V surovém stavu je tiket uložen takto:
```js
{
  id: 'T-1001',
  dispatcherId: 'u-1',     // jen ID
  assigneeId: 'u-3',       // jen ID
  categoryId: 'cat-access', // jen ID
  status: 'NEW',
  priority: 'HIGH',
  ...
}
```

Ale UI potřebuje zobrazit:
```js
{
  dispatcherName: 'Jana Nováková', // jméno místo ID
  assigneeName: 'Eva Dvořáková',
  categoryName: 'Přihlášení do aplikace',
  statusLabel: 'Nový',             // čitelný popis místo kódu
  priorityLabel: 'Vysoká',
  overdue: true,                   // je tiket po lhůtě?
  attentionReason: 'Nový incident · Kritická priorita',
  capabilities: {                  // co může přihlášený uživatel dělat?
    canAssign: false,
    canResolve: true,
    canClose: false,
    ...
  }
}
```

To vše dělá funkce `enrichTicket`:

```js
function enrichTicket(state, ticket) {
  const overdue = isActiveTicket(ticket) &&
    Date.now() - Date.parse(ticket.updatedAt) >= 24 * 60 * 60 * 1000;

  return {
    ...ticket,
    dispatcherName: userName(state, ticket.dispatcherId),
    assigneeName: ticket.assigneeId ? userName(state, ticket.assigneeId) : 'Nepřiřazeno',
    statusLabel: statusLabels[ticket.status],
    overdue,
    capabilities: {
      canAssign: canAssignTicket(state.auth, ticket),
      canResolve: canResolveTicket(state.auth, ticket),
      ...
    }
  };
}
```

### Filtrování a vyhledávání

```js
function selectFilteredTickets(state) {
  const query = normalizeSearch(state.ui.query).trim();
  return state.tickets
    .filter(t => state.ui.statusFilter === 'ALL' || t.status === state.ui.statusFilter)
    .filter(t => !query || normalizeSearch([t.id, t.title, t.reporterName].join(' ')).includes(query))
    .map(t => enrichTicket(state, t));
}
```

Funkce `normalizeSearch` před porovnáním odstraní diakritiku a převede na malá písmena:
```js
const normalizeSearch = value =>
  String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('cs');
```

Díky tomu hledání `"novak"` najde i `"Nováková"`.

### Která obrazovka se zobrazí?

```js
function selectViewState(state) {
  if (state.ui.status === 'LOADING') return { type: 'LOADING' };
  if (state.ui.status === 'ERROR')   return { type: 'ERROR', message: state.ui.errorMessage };
  switch (state.ui.mode) {
    case 'DASHBOARD':     return selectDashboardView(state);
    case 'TICKET_LIST':   return selectTicketListView(state);
    case 'TICKET_DETAIL': return selectTicketDetailView(state);
    case 'KNOWLEDGE':     return selectKnowledgeView(state);
  }
}
```

`state.ui.mode` je řetězec, který říká, co právě uživatel vidí. Každá akce jako `ENTER_TICKET_LIST` nebo `ENTER_DASHBOARD` prostě změní tuto hodnotu — a views automaticky zobrazí správnou obrazovku.

---

## 10. Views — kreslení HTML

Soubor `views.js` překresluje celou stránku při každé změně stavu. Nepoužívá žádný šablonovací jazyk (jako Handlebars nebo JSX) — HTML se vytváří čistým JavaScriptem.

### Pomocná funkce el()

Místo `document.createElement` a ručního nastavování vlastností existuje zkratka:

```js
// Ruční způsob (zdlouhavý):
const button = document.createElement('button');
button.type = 'button';
button.textContent = 'Klikni';
button.className = 'primary-button';
button.addEventListener('click', () => console.log('klik'));

// Pomocí el() (stručný):
const button = el('button', {
  type: 'button',
  text: 'Klikni',
  className: 'primary-button',
  onClick: () => console.log('klik'),
});
```

Třetí argument jsou **potomci** (children) — prvky, které se vloží dovnitř:

```js
el('div', { className: 'panel' }, [
  el('h2', { text: 'Nadpis' }),
  el('p', { text: 'Text odstavce' }),
  el('button', { text: 'OK', onClick: () => ... }),
])
```

Výsledkem je ekvivalent tohoto HTML:
```html
<div class="panel">
  <h2>Nadpis</h2>
  <p>Text odstavce</p>
  <button>OK</button>
</div>
```

### Komponenty — funkce vracející DOM elementy

Celé UI je složené z komponent — funkcí, které přijmou data a vrátí DOM element:

```js
function summaryGrid(s) {
  // s = { total: 5, new: 2, assigned: 1, ... }
  const cards = [
    ['Všechny incidenty', s.total, 'blue'],
    ['Nové', s.new, 'orange'],
    ...
  ];
  return el('div', { className: 'summary-grid' },
    cards.map(([label, count, tone]) =>
      el('article', { className: 'summary-card ' + tone }, [
        el('span', { text: label }),
        el('strong', { text: String(count) }),
      ])
    )
  );
}
```

Komponenty se skládají do sebe — větší komponenty volají menší:

```
render()
  └── Layout()                    ← celá stránka (sidebar + topbar + obsah)
        └── DashboardView()       ← obsah přehledu
              ├── summaryGrid()   ← karty s počty
              ├── attentionPanel() ← "Vyžaduje pozornost"
              ├── recentTickets() ← poslední incidenty
              └── actionPanel()   ← formulář pro nový tiket
```

### Jak se spouští překreslení?

```js
store.subscribe(state => {
  render(root, state, dispatch);
});
```

Pokaždé, když se změní stav, zavolá se `render`. Ta smaže veškerý obsah `div#app` a nakreslí ho znovu:

```js
function render(root, state, dispatch) {
  root.replaceChildren(); // smaž vše
  const viewState = selectViewState(state); // připrav data
  const content = /* příslušná View komponenta */;
  root.appendChild(Layout({ contentElement: content, ... })); // nakresli
}
```

### Obnovení focusu

Při překreslení by se ztratil focus (kurzor v textovém poli). Proto si `render` zapamatuje, které pole bylo aktivní, a po překreslení ho znovu aktivuje:

```js
const focused = document.activeElement; // zapamatuj
root.replaceChildren();                 // překresli
const next = root.querySelector('[name="' + focused.name + '"]');
next?.focus();                          // obnov focus
```

---

## 11. Celý životní cyklus — od kliknutí po zobrazení

Vezměme konkrétní příklad: **uživatel klikne na tlačítko "Převzít k řešení"**.

```
1. KLIKNUTÍ
   Uživatel klikne na tlačítko v TicketDetailView.
   Tlačítko má: onClick: () => h.onAssign()

2. HANDLER (views.js → actions.js)
   h.onAssign() zavolá:
   dispatch({ type: 'ASSIGN_TICKET', payload: { ticketId: 'T-1001' } })

3. DISPATCHER (actions.js)
   Funkce dispatch() najde case 'ASSIGN_TICKET':
   return assignTicket({ store, api, payload })

4. ACTION (actions.js)
   assignTicket() zavolá performMutation():
   - store.setState → isSubmitting: true  (zamknutí UI)
   - Zavolá api.assignTicket('T-1001')

5. API (api.js)
   - Ověří, že uživatel má roli IT_SUPPORT
   - Ověří, že tiket T-1001 existuje
   - Zavolá transition() → zkontroluje stavový automat
   - Změní ticket.status na 'ASSIGNED'
   - Přidá záznam do ticket.history
   - Uloží data do localStorage
   - Vrátí: { status: 'SUCCESS', tickets: [...aktualizovaný seznam...] }

6. ZPRACOVÁNÍ VÝSLEDKU (actions.js)
   performMutation() aktualizuje stav:
   - tickets: [...nový seznam s aktualizovaným tiketem...]
   - isSubmitting: false
   - notification: 'Incident byl přiřazen.'

7. STORE (store.js)
   store.setState() uloží nový stav a zavolá všechny posluchače.

8. RENDER (views.js)
   store.subscribe() zavolá render().
   render() zavolá selectViewState() → selectTicketDetailView() → enrichTicket()
   enrichTicket() zjistí: ticket.status je teď 'ASSIGNED', takže:
   - capabilities.canAssign = false  (tlačítko "Převzít" zmizí)
   - capabilities.canResolve = true  (objeví se formulář pro řešení)
   render() smaže #app a nakreslí aktualizované UI.

9. VÝSLEDEK
   Uživatel vidí aktualizovaný detail tiketu s novým stavem a notifikací.
```

Celý cyklus trvá typicky méně než 50 ms.

---

## 12. Ukládání formulářů (draft systém)

Aplikace průběžně ukládá rozepsané formuláře, aby se neztratily při obnovení stránky.

### Kdy se ukládá?

Při každém překreslení (tj. při každé změně stavu) se zavolá `saveDrafts`:

```js
store.subscribe(state => {
  saveDrafts(state, storage); // uloží do localStorage
  render(root, state, dispatch);
});
```

Co se ukládá:
- `ticketDraft` — formulář nového tiketu
- `replyDrafts` — odpovědi v jednotlivých tiketech (podle ID)
- `detailDrafts` — pole jako "Příčina a řešení" nebo "Důvod čekání"

### Klíč v localStorage

Data se ukládají pod klíčem odvozeným od přihlášeného uživatele:
```
it-dispecink-drafts-u-1    ← pro Janu Novákovou
it-dispecink-drafts-u-2    ← pro Petra Svobodu
```

Díky tomu si každý uživatel pamatuje svá vlastní rozepsaná data zvlášť.

---

## 13. Zabezpečení a validace

### Dvojí validace

Každý vstup se validuje na dvou místech:

1. **V `domain.js`** — funkce jako `assertTicketTitle`, `assertResolution` — sdílená pravidla
2. **V `api.js`** — volá domain funkce a přidává business pravidla (oprávnění, existence tiketu, atd.)

Pokud by aplikace měla skutečný server, logika z `api.js` by se přesunula tam. Validace v `domain.js` by zůstala i na frontendu (pro okamžitou zpětnou vazbu).

### Ochrana před CSV injection

Při exportu do CSV se každá buňka ošetří:

```js
const cell = value => {
  let text = String(value ?? '');
  // Pokud začíná =, +, @, - (znaky, které Excel interpretuje jako vzorce)
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; // přidej apostrof
  return '"' + text.replaceAll('"', '""') + '"';     // obal uvozovkami
};
```

Bez tohoto opatření by hodnota jako `=SUM(A1:A100)` v tiketu mohla po otevření v Excelu spustit makro.

### Validace příloh

Přílohy se kontrolují nejen podle přípony souboru, ale podle **skutečného obsahu** (magic bytes — první bajty souboru, které identifikují jeho typ):

```js
const valid =
  (file.type === 'image/png' && bytes.startsWith('\x89PNG\r\n\x1a\n')) ||
  (file.type === 'image/jpeg' && bytes.startsWith('\xff\xd8\xff')) ||
  (file.type === 'application/pdf' && bytes.startsWith('%PDF-'));
```

Útočník nemůže přejmenovat `skript.exe` na `foto.png` a nahrát ho — obsah souboru prozradí, co to skutečně je.

---

## 14. Vzory, které stojí za zapamatování

### 1. Jednosměrný tok dat (one-way data flow)

```
Uživatel → dispatch(akce) → store.setState → render → DOM
```

Data tečou vždy jedním směrem. UI nikdy nemění data přímo — vždy přes dispatch.

### 2. Čisté funkce (pure functions)

Funkce jako `enrichTicket(state, ticket)` nebo `selectFilteredTickets(state)` vždy vrátí stejný výsledek pro stejný vstup a nemění nic mimo sebe. Jsou předvídatelné a snadno testovatelné.

### 3. Kompozice malých funkcí

Místo jedné obrovské funkce je kód složený z malých, pojmenovaných funkcí, kde každá dělá jednu věc. `transition()` mění stav tiketu. `addEvent()` přidá záznam do historie. `publicDataFor()` připraví odpověď. Každá funkce je pochopitelná samostatně.

### 4. Fail fast

Pokud něco nesedí, funkce okamžitě hodí chybu nebo vrátí `fail(...)`. Nikdy se nesnaží "nějak to zvládnout" se špatnými daty. Díky tomu jsou chyby viditelné hned, ne až za hodinu v neočekávaném místě.

---

## Shrnutí

| Soubor | Otázka, na kterou odpovídá |
|---|---|
| `domain.js` | Co smí kdo dělat? Jaké přechody stavů jsou povolené? |
| `data.js` | Jak vypadají výchozí data a popisky? |
| `store.js` | Kde je aktuální stav aplikace uložený? |
| `api.js` | Jak se data čtou a mění? Jak se ukládají? |
| `selectors.js` | Jak připravit data ze stavu pro zobrazení? |
| `actions.js` | Jak zareagovat na uživatelovu akci? |
| `views.js` | Jak nakreslit UI z připravených dat? |
| `app.js` | Jak všechno spojit a nastartovat? |

Celá aplikace je **jeden velký kruh**: stav → UI → akce → nový stav → nové UI.
