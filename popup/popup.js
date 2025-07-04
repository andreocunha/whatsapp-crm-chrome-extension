// popup.js – código movido para respeitar CSP (sem inline)
(function () {
    const elMe = document.getElementById('me');
    const elContacts = document.getElementById('contacts');

    function renderContacts(list) {
        elContacts.innerHTML = '';
        if (!Array.isArray(list) || !list.length) {
            elContacts.textContent = 'Sem contatos encontrados.';
            return;
        }
        list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
        list.forEach((c) => {
            const card = document.createElement('div');
            card.className = 'contact-card';

            const img = document.createElement('img');
            img.src = c.pic || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2242%22 height=%2242%22></svg>';
            img.alt = 'foto';

            const info = document.createElement('div');
            info.className = 'c-info';

            const name = document.createElement('div');
            name.className = 'c-name';
            name.textContent = c.nome;

            const num = document.createElement('div');
            num.className = 'c-num';
            num.textContent = c.numero;

            info.appendChild(name);
            info.appendChild(num);

            card.appendChild(img);
            card.appendChild(info);
            elContacts.appendChild(card);
        });
    }

    chrome.storage.local.get(['meNumber', 'contacts'], ({ meNumber, contacts }) => {
        elMe.textContent = meNumber ? `📞 ${meNumber}` : 'Número não encontrado';
        renderContacts(contacts);
    });

    // Reage a mudanças (novas fotos, contatos, etc.)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.meNumber) {
                elMe.textContent = `📞 ${changes.meNumber.newValue}`;
            }
            if (changes.contacts) {
                renderContacts(changes.contacts.newValue);
            }
        }
    });
})();