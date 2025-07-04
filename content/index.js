// content.js – versão enxuta: apenas IndexedDB, sem endpoints externos
(async function () {
    /* ---------- HELPERS ---------- */
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    /* ---------- KANBAN CONFIG ---------- */
    const COLUMNS = [
        { key: 'nova', label: 'Nova oportunidade' },
        { key: 'atendimento', label: 'Em atendimento' },
        { key: 'negociacao', label: 'Em negociação' },
        { key: 'fechado', label: 'Negócio fechado' },
        { key: 'perdido', label: 'Perdida/arquivada' }
    ];

    /* ---------- NÚMERO LOGADO ---------- */
    function getMeNumber() {
        const widRaw = localStorage.getItem('last-wid-md') || localStorage.getItem('last-wid');
        if (!widRaw) return null;
        let wid;
        try {
            const p = JSON.parse(widRaw);
            wid = typeof p === 'string' ? p : `${p.user}@${p.server}`;
        } catch {
            wid = widRaw.replace(/^"+|"+$/g, '');
        }
        return wid.split('@')[0].split(':')[0];
    }

    /* ---------- MAPA DE FOTOS ---------- */
    const getProfilePicMap = (db) =>
        new Promise((resolve) => {
            if (!db.objectStoreNames.contains('profile-pic-thumb')) return resolve(new Map());
            const tx = db.transaction('profile-pic-thumb', 'readonly');
            const store = tx.objectStore('profile-pic-thumb');
            const req = store.getAll();
            req.onsuccess = () => {
                const map = new Map();
                console.log(req.result)
                console.log(`📷 ${req.result.length} fotos encontradas no banco local.`);
                req.result.forEach((p) => {
                    // Extrai só o número do id da foto (ex: 5527993091185@c.us → 5527993091185)
                    if (p.id) {
                        const num = p.id.replace(/@.*/, '');
                        map.set(num, p.previewEurl || p.eurl || '');
                    }
                });
                resolve(map);
            };
            req.onerror = () => resolve(new Map());
        });

    /* ---------- CONTATOS ---------- */
    async function fetchContacts() {
        if (!indexedDB.databases) return [];
        const dbs = await indexedDB.databases();
        const dbInfo = dbs.find((d) => d.name?.startsWith('wawc') || d.name?.startsWith('model-storage'));
        if (!dbInfo) return [];

        const openRequest = indexedDB.open(dbInfo.name);
        return new Promise((resolve) => {
            openRequest.onsuccess = async (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('contact')) return resolve([]);
                const picMap = await getProfilePicMap(db);
                const tx = db.transaction('contact', 'readonly');
                const store = tx.objectStore('contact');
                const getAll = store.getAll();
                getAll.onsuccess = () => {
                    const raw = getAll.result.map((c) => {
                        let nome = c.name || c.shortName || c.pushname || '';
                        const id = typeof c.id === 'string' ? c.id : `${c.id?.user || ''}@${c.id?.server || ''}`;
                        // Extrai só o número do contato
                        let numero = '';
                        if (c.phoneNumber) numero = c.phoneNumber.replace('@c.us', '');
                        else if (id.endsWith('@s.whatsapp.net')) numero = id.replace('@s.whatsapp.net', '');
                        else numero = id.replace(/@.*/, '');
                        // Se não tem nome, usa o telefone como nome
                        if (!nome.trim()) nome = numero;
                        // Associa a foto pelo número
                        return { nome, numero, id, pic: picMap.get(numero) || '' };
                    });
                    // Remove duplicados por número
                    const map = new Map();
                    raw.forEach((c) => { if (c.numero && !map.has(c.numero)) map.set(c.numero, c); });
                    let contactsArr = [...map.values()];
                    // Ordena: nomes reais primeiro (alfabético), depois os que são só número
                    contactsArr.sort((a, b) => {
                        const aIsNum = a.nome === a.numero;
                        const bIsNum = b.nome === b.numero;
                        if (aIsNum && !bIsNum) return 1;
                        if (!aIsNum && bIsNum) return -1;
                        return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
                    });
                    resolve(contactsArr);
                };
                getAll.onerror = () => resolve([]);
            };
            openRequest.onerror = () => resolve([]);
        });
    }

    /* ---------- MAIN ---------- */
    const MAX_TRIES = 30;
    let tries = 0;
    while (tries < MAX_TRIES && !document.querySelector('#app')) {
        await sleep(1000);
        tries++;
    }

    const meNumber = getMeNumber();
    const contacts = await fetchContacts();

    // Guarda para o popup
    chrome.storage.local.set({ meNumber, contacts });

    /* ---------- KANBAN UI ---------- */
    // Injeta botão Kanban ao lado do botão de configurações
    (function injectKanbanButton() {
        const interval = setInterval(() => {
            const settingsButton = document.querySelector('button[aria-label="Settings"]');
            if (settingsButton && settingsButton.parentElement) {
                clearInterval(interval);

                // Evita injetar múltiplas vezes
                if (document.getElementById("kanban-custom-button")) return;

                // Cria um botão usando <button> para manter o estilo, mas só com o ícone
                const newButton = document.createElement('button');
                newButton.setAttribute("aria-label", "Kanban");
                newButton.setAttribute("id", "kanban-custom-button");
                newButton.style.background = 'transparent';
                newButton.style.border = 'none';
                newButton.style.padding = settingsButton.style.padding; // igual ao botão original
                newButton.style.display = settingsButton.style.display || 'flex';
                newButton.style.alignItems = settingsButton.style.alignItems || 'center';
                newButton.style.justifyContent = settingsButton.style.justifyContent || 'center';
                newButton.style.height = settingsButton.offsetHeight ? settingsButton.offsetHeight + 'px' : '';
                newButton.style.width = settingsButton.offsetWidth ? settingsButton.offsetWidth + 'px' : '';
                newButton.style.cursor = 'pointer';
                newButton.style.boxSizing = 'border-box';

                const img = document.createElement('img');
                img.src = "https://magic.assis.co/logo2.png";
                img.style.width = "25px";
                img.style.height = "25px";
                img.style.display = "block";
                img.alt = "Kanban";
                img.style.margin = "0 auto";

                newButton.appendChild(img);

                newButton.onclick = (e) => {
                    e.stopPropagation();
                    if (document.body.classList.contains('kanban-on')) {
                        closeKanban();
                    } else {
                        openKanban();
                    }
                };

                // Insere acima do botão de configurações
                settingsButton.parentElement.insertAdjacentElement("beforebegin", newButton);
            }
        }, 500);
    })();

    // Ajuste: não esconder o menu lateral do WhatsApp
    // Remover: body.kanban-on #pane-side{display:none!important}
    const style = document.createElement('style');
    style.textContent = `
      #kanban-board {
        position:fixed;inset:0;background:#f0f2f5;z-index:9999;
        display:flex;gap:12px;padding:16px;overflow:auto;font-family:system-ui
      }
      .kanban-col {
        flex:1 0 260px;
        background:#f8fafc;
        border-radius:10px;
        display:flex;flex-direction:column;
        box-shadow:0 2px 8px #0001;
        border:1px solid #e2e8f0;
      }
      .kanban-col-title {
        padding:12px 16px;
        font-weight:700;
        border-bottom:1px solid #e2e8f0;
        background:#e0e7ef;
        color:#1a202c;
        border-radius:10px 10px 0 0;
        font-size:15px;
        letter-spacing:0.01em;
      }
      .kanban-list {
        flex:1;overflow-y:auto;padding:12px;
        display:flex;flex-direction:column;gap:10px
      }
      .kanban-card {
        background:#fff;
        border:1.5px solid #cbd5e1;
        border-radius:8px;
        padding:10px;
        display:flex;align-items:center;gap:10px;
        cursor:pointer;
        user-select:none;
        box-shadow:0 1px 4px #0001;
        transition:box-shadow .15s,border-color .15s;
        color:#222;
        font-size:14px;
      }
      .kanban-card:hover {
        border-color:#00a884;
        box-shadow:0 2px 8px #00a88422;
        background:#f0fdf6;
      }
      .kanban-card img {
        width:36px;height:36px;border-radius:50%;background:#e2e8f0;
        border:1px solid #cbd5e1;
      }
      .kanban-card span {
        font-weight:600;
        color:#1a202c;
        text-shadow:0 1px 0 #fff8;
        max-width:160px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      /* Removido: body.kanban-on #pane-side{display:none!important} */
    `;
    document.head.appendChild(style);

    function openKanban() {
        document.body.classList.add('kanban-on');
        buildKanbanBoard();
    }

    function closeKanban() {
        document.body.classList.remove('kanban-on');
        document.getElementById('kanban-board')?.remove();
    }

    function buildKanbanBoard() {
        const board = document.createElement('div');
        board.id = 'kanban-board';
        board.style.flexDirection = 'column'; // Garante layout em coluna

        // Wrapper do topo (título + botão X)
        const topBar = document.createElement('div');
        topBar.style.display = 'flex';
        topBar.style.alignItems = 'center';
        topBar.style.justifyContent = 'space-between';
        topBar.style.width = '100%';
        topBar.style.position = 'sticky';
        topBar.style.top = '0';
        topBar.style.background = '#f0f2f5';
        topBar.style.zIndex = '10001';
        topBar.style.padding = '0 0 12px 0';

        // Título do Kanban
        const title = document.createElement('div');
        title.textContent = 'Painel de vendas Assis';
        title.style.fontSize = '20px';
        title.style.fontWeight = 'bold';
        title.style.color = '#1a202c';
        title.style.letterSpacing = '0.01em';
        title.style.padding = '8px 0 8px 8px';

        // Botão de fechar (X)
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✖';
        closeBtn.title = 'Fechar Kanban';
        closeBtn.style.background = 'transparent';
        closeBtn.style.border = 'none';
        closeBtn.style.fontSize = '22px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.color = '#555';
        closeBtn.style.padding = '2px 12px 2px 8px';
        closeBtn.style.borderRadius = '6px';
        closeBtn.onmouseenter = () => closeBtn.style.background = '#eee';
        closeBtn.onmouseleave = () => closeBtn.style.background = 'transparent';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeKanban();
        };

        topBar.appendChild(title);
        topBar.appendChild(closeBtn);
        board.appendChild(topBar);

        // Container das colunas (para alinhar as colunas lado a lado)
        const columnsWrapper = document.createElement('div');
        columnsWrapper.style.display = 'flex';
        columnsWrapper.style.gap = '12px';
        columnsWrapper.style.width = '100%';
        columnsWrapper.style.flex = '1 1 auto';
        columnsWrapper.style.overflow = 'auto';

        chrome.storage.local.get('kanbanPositions', ({ kanbanPositions }) => {
            const positions = kanbanPositions || {};

            // Cria as colunas
            COLUMNS.forEach(col => {
                const colEl = document.createElement('div');
                colEl.className = 'kanban-col';
                colEl.dataset.key = col.key;

                const title = document.createElement('div');
                title.className = 'kanban-col-title';
                title.textContent = col.label;

                const list = document.createElement('div');
                list.className = 'kanban-list';

                // Drag-and-drop na lista
                list.addEventListener('dragover', e => e.preventDefault());
                list.addEventListener('drop', e => {
                    e.preventDefault();
                    const num = e.dataTransfer.getData('text/plain');
                    const card = board.querySelector(`.kanban-card[data-num="${num}"]`);
                    if (card && list !== card.parentElement) {
                        list.appendChild(card);
                        positions[num] = col.key;
                        chrome.storage.local.set({ kanbanPositions: positions });
                    }
                });

                colEl.append(title, list);
                columnsWrapper.appendChild(colEl);
            });

            // Cria os cards
            contacts.forEach(c => {
                const colKey = positions[c.numero] || 'nova';
                const list = columnsWrapper.querySelector(
                    `.kanban-col[data-key="${colKey}"] .kanban-list`
                );

                const card = document.createElement('div');
                card.className = 'kanban-card';
                card.draggable = true;
                card.dataset.num = c.numero;

                card.addEventListener('dragstart', e =>
                    e.dataTransfer.setData('text/plain', c.numero)
                );

                card.addEventListener('click', () => {
                    closeKanban();
                    // Tenta encontrar o contato na lista lateral e clicar nele
                    const paneSide = document.querySelector('#pane-side');
                    if (paneSide) {
                        // Busca por elementos que contenham o número do contato
                        const contactEls = paneSide.querySelectorAll('[data-id], [data-testid]');
                        let found = false;
                        contactEls.forEach(el => {
                            // Procura pelo número no atributo data-id ou no texto
                            const dataId = el.getAttribute('data-id') || '';
                            if (dataId.includes(c.numero)) {
                                el.click();
                                found = true;
                            } else if (el.textContent && el.textContent.replace(/\D/g, '').includes(c.numero)) {
                                el.click();
                                found = true;
                            }
                        });
                        if (!found) {
                            // Fallback: abre via URL (pode causar reload)
                            window.location.href = `https://web.whatsapp.com/send?phone=${c.numero}`;
                        }
                    } else {
                        // Fallback: abre via URL (pode causar reload)
                        window.location.href = `https://web.whatsapp.com/send?phone=${c.numero}`;
                    }
                });

                const img = document.createElement('img');
                img.src = c.pic ||
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>';

                // Nome e telefone embaixo
                const infoDiv = document.createElement('div');
                infoDiv.style.display = 'flex';
                infoDiv.style.flexDirection = 'column';

                const spanNome = document.createElement('span');
                spanNome.textContent = c.nome;
                spanNome.style.fontWeight = '600';
                spanNome.style.color = '#1a202c';
                spanNome.style.maxWidth = '160px';
                spanNome.style.whiteSpace = 'nowrap';
                spanNome.style.overflow = 'hidden';
                spanNome.style.textOverflow = 'ellipsis';

                const spanNum = document.createElement('span');
                spanNum.textContent = c.numero;
                spanNum.style.fontSize = '12px';
                spanNum.style.color = '#555';
                spanNum.style.opacity = '0.8';
                spanNum.style.marginTop = '6px';

                infoDiv.append(spanNome, spanNum);

                card.append(img, infoDiv);
                list.appendChild(card);
            });

            board.appendChild(columnsWrapper);
            document.body.appendChild(board);
        });
    }

    // Console debug
    console.table(contacts);
    const pics = contacts.filter((c) => c.pic).map((c) => c.pic);
    console.log(`🖼️ ${pics.length} imagens capturadas do banco local:`);
    console.log(pics);
})();