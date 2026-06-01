// Participation + Annonces IG
const PARTICIPATIONS_COLLECTION = 'participations';
let participationsCache = [];
let annonceLinesState = [];

function formatAnnoncePrice(number) {
    if (number == null || isNaN(number) || number <= 0) return null;
    if (number >= 1000000) {
        return (number / 1000000).toFixed(1).replace(/\.0$/, '').replace('.', ',') + 'M';
    }
    if (number >= 1000) {
        return (number / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',') + 'K';
    }
    return formatNumberWithSpaces(Math.round(number));
}

function buildAnnonceLineForGroup(g) {
    const prices =
        typeof resolveDualPrices === 'function' ? resolveDualPrices(g) : {};
    const pPropre = formatAnnoncePrice(prices.propre ?? g.salePricePropre);
    const pSale = formatAnnoncePrice(prices.sale ?? g.salePriceSale);
    if (pPropre && pSale) return `${g.name} ${pPropre}/${pSale} sale`;
    if (pSale) return `${g.name} ${pSale} sale`;
    if (pPropre) return `${g.name} ${pPropre} propre`;
    return null;
}

function buildAnnonceLinesFromStock() {
    const weapons = typeof getWeapons === 'function' ? getWeapons() : [];
    const grouped =
        typeof groupWeaponsByName === 'function' ? groupWeaponsByName(weapons, true) : {};
    const lines = [];
    Object.values(grouped)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .forEach((g) => {
            const line = buildAnnonceLineForGroup(g);
            if (line) lines.push(line);
        });
    return lines;
}

function mergeAnnonceLinesWithSaved(savedLines, freshLines) {
    const result = [];
    const freshSet = new Set(freshLines);
    savedLines.forEach((line) => {
        if (freshSet.has(line) || line.trim()) result.push(line);
    });
    freshLines.forEach((line) => {
        if (!result.includes(line)) result.push(line);
    });
    return result;
}

async function loadSavedAnnonceLines() {
    if (typeof getSetting === 'function') {
        const lines = await getSetting('annonceLines');
        if (Array.isArray(lines) && lines.length > 0) return lines;
    }
    const stored = localStorage.getItem('annonceLines');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            return null;
        }
    }
    return null;
}

async function persistAnnonceLines(lines) {
    annonceLinesState = lines;
    if (typeof saveSetting === 'function') {
        await saveSetting('annonceLines', lines);
    }
    localStorage.setItem('annonceLines', JSON.stringify(lines));
    const title = document.getElementById('annonce-title')?.value || '';
    if (title && typeof saveSetting === 'function') {
        await saveSetting('annonceTitle', title);
    }
}

function syncAnnonceTextarea() {
    const descArea = document.getElementById('annonce-description');
    if (descArea) descArea.value = annonceLinesState.join('\n');
}

function renderAnnonceLinesEditor() {
    const container = document.getElementById('annonce-lines-editor');
    if (!container) return;
    container.innerHTML = '';
    if (annonceLinesState.length === 0) {
        container.innerHTML =
            '<p class="annonce-lines-empty">Aucune ligne. Cliquez sur Actualiser depuis le stock.</p>';
        syncAnnonceTextarea();
        return;
    }
    annonceLinesState.forEach((line, index) => {
        const row = document.createElement('div');
        row.className = 'annonce-line-row';
        const upDisabled = index === 0 ? 'disabled' : '';
        const downDisabled = index === annonceLinesState.length - 1 ? 'disabled' : '';
        row.innerHTML = `
            <div class="annonce-line-arrows">
                <button type="button" class="annonce-arrow-btn" data-dir="-1" data-idx="${index}" ${upDisabled} title="Monter">▲</button>
                <button type="button" class="annonce-arrow-btn" data-dir="1" data-idx="${index}" ${downDisabled} title="Descendre">▼</button>
            </div>
            <span class="annonce-line-text">${escapeHtml(line)}</span>`;
        container.appendChild(row);
    });
    container.querySelectorAll('.annonce-arrow-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const dir = parseInt(btn.dataset.dir, 10);
            moveAnnonceLine(idx, dir);
        });
    });
    syncAnnonceTextarea();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function moveAnnonceLine(index, delta) {
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= annonceLinesState.length) return;
    const tmp = annonceLinesState[index];
    annonceLinesState[index] = annonceLinesState[newIndex];
    annonceLinesState[newIndex] = tmp;
    renderAnnonceLinesEditor();
}

async function saveAnnonceOrder() {
    await persistAnnonceLines([...annonceLinesState]);
    showNotification('Ordre de l\'annonce enregistré !', 'success');
}

async function loadParticipations() {
    if (!window.db) {
        const stored = localStorage.getItem('participations');
        participationsCache = stored ? JSON.parse(stored) : [];
        return participationsCache;
    }
    try {
        const snapshot = await window.firebaseGetDocs(
            window.firebaseCollection(window.db, PARTICIPATIONS_COLLECTION)
        );
        participationsCache = [];
        snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            participationsCache.push({
                id: docSnap.id,
                personName: d.personName || '',
                amount: parseFloat(d.amount) || 0,
                note: d.note || ''
            });
        });
        participationsCache.sort((a, b) => a.personName.localeCompare(b.personName, 'fr'));
        return participationsCache;
    } catch (e) {
        console.error('[PARTICIPATION]', e);
        return participationsCache;
    }
}

function renderParticipationPanel() {
    const list = document.getElementById('participation-list');
    const totalEl = document.getElementById('participation-total');
    if (!list) return;
    list.innerHTML = '';
    let total = 0;
    if (participationsCache.length === 0) {
        list.innerHTML = '<p class="participation-empty">Aucune participation</p>';
    } else {
        participationsCache.forEach((p) => {
            total += p.amount;
            list.appendChild(createParticipationItem(p));
        });
    }
    if (totalEl) {
        totalEl.textContent = 'Total: ' + formatNumberWithSpaces(Math.round(total)) + ' €';
    }
}

function createParticipationItem(p) {
    const div = document.createElement('div');
    div.className = 'participation-item';
    div.innerHTML = `
        <div class="participation-display">
            <strong class="part-name">${p.personName}</strong>
            <span class="part-amount">${formatNumberWithSpaces(Math.round(p.amount))} €</span>
            ${p.note ? `<span class="part-note">${p.note}</span>` : ''}
        </div>
        <div class="participation-actions">
            <button type="button" class="btn-edit btn-edit-part" onclick="editParticipation('${p.id}')">✏️</button>
            <button type="button" class="btn-delete" onclick="deleteParticipation('${p.id}')">×</button>
        </div>`;
    return div;
}

let editingParticipationId = null;

async function saveParticipation(e) {
    e.preventDefault();
    const personName = document.getElementById('part-person-name').value.trim();
    const amountRaw = document.getElementById('part-amount').value.replace(/\s/g, '');
    const amount = parseFloat(amountRaw);
    const note = document.getElementById('part-note').value.trim();
    if (!personName || isNaN(amount)) {
        alert('Nom et montant requis');
        return;
    }
    const data = { personName, amount, note };
    try {
        if (window.db) {
            if (editingParticipationId) {
                await window.firebaseUpdateDoc(
                    window.firebaseDoc(window.db, PARTICIPATIONS_COLLECTION, editingParticipationId),
                    data
                );
            } else {
                await window.firebaseAddDoc(
                    window.firebaseCollection(window.db, PARTICIPATIONS_COLLECTION),
                    data
                );
            }
        } else {
            if (editingParticipationId) {
                const idx = participationsCache.findIndex((x) => x.id === editingParticipationId);
                if (idx !== -1) participationsCache[idx] = { id: editingParticipationId, ...data };
            } else {
                participationsCache.push({ id: Date.now().toString(36), ...data });
            }
            localStorage.setItem('participations', JSON.stringify(participationsCache));
        }
        resetParticipationForm();
        await loadParticipations();
        renderParticipationPanel();
        showNotification('Participation enregistrée', 'success');
    } catch (err) {
        console.error(err);
        alert('Erreur sauvegarde');
    }
}

function editParticipation(id) {
    const p = participationsCache.find((x) => x.id === id);
    if (!p) return;
    editingParticipationId = id;
    document.getElementById('part-person-name').value = p.personName;
    document.getElementById('part-amount').value = formatNumberWithSpaces(Math.round(p.amount));
    document.getElementById('part-note').value = p.note || '';
    document.getElementById('part-submit-btn').textContent = 'Modifier';
    document.getElementById('part-cancel-btn').style.display = 'inline-block';
}

function resetParticipationForm() {
    const form = document.getElementById('participation-form');
    if (form) form.reset();
    editingParticipationId = null;
    const submit = document.getElementById('part-submit-btn');
    const cancel = document.getElementById('part-cancel-btn');
    if (submit) submit.textContent = 'Ajouter';
    if (cancel) cancel.style.display = 'none';
}

async function deleteParticipation(id) {
    if (!confirm('Supprimer cette participation ?')) return;
    try {
        if (window.db) {
            await window.firebaseDeleteDoc(
                window.firebaseDoc(window.db, PARTICIPATIONS_COLLECTION, id)
            );
        } else {
            participationsCache = participationsCache.filter((p) => p.id !== id);
            localStorage.setItem('participations', JSON.stringify(participationsCache));
        }
        await loadParticipations();
        renderParticipationPanel();
    } catch (e) {
        alert('Erreur suppression');
    }
}

async function refreshAnnoncePreview() {
    if (typeof loadPriceCatalogFromFirestore === 'function') {
        await loadPriceCatalogFromFirestore();
    }
    const fresh = buildAnnonceLinesFromStock();
    const saved = await loadSavedAnnonceLines();
    annonceLinesState = saved && saved.length > 0 ? mergeAnnonceLinesWithSaved(saved, fresh) : fresh;

    const titleInput = document.getElementById('annonce-title');
    if (titleInput && !titleInput.dataset.userEdited) {
        const savedTitle =
            typeof getSetting === 'function' ? await getSetting('annonceTitle') : null;
        titleInput.value = savedTitle || '-GFR- Vente Arme -GFR-';
    }
    renderAnnonceLinesEditor();
}

async function loadAnnonceTab() {
    const titleInput = document.getElementById('annonce-title');
    if (titleInput && typeof getSetting === 'function') {
        const savedTitle = await getSetting('annonceTitle');
        if (savedTitle) {
            titleInput.value = savedTitle;
            titleInput.dataset.userEdited = '1';
        }
    }
    const saved = await loadSavedAnnonceLines();
    if (saved && saved.length > 0) {
        annonceLinesState = saved;
        renderAnnonceLinesEditor();
    } else {
        await refreshAnnoncePreview();
    }
}

function copyAnnonceToClipboard() {
    syncAnnonceTextarea();
    const title = document.getElementById('annonce-title')?.value || '';
    const desc = document.getElementById('annonce-description')?.value || '';
    const text = title + '\n\n' + desc;
    navigator.clipboard
        .writeText(text)
        .then(() => showNotification('Annonce copiée !', 'success'))
        .catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            showNotification('Annonce copiée !', 'success');
        });
}

function setupParticipationListeners() {
    if (!window.db || window.participationListenerSetup) return;
    window.participationListenerSetup = true;
    window.firebaseOnSnapshot(
        window.firebaseCollection(window.db, PARTICIPATIONS_COLLECTION),
        async () => {
            await loadParticipations();
            renderParticipationPanel();
        }
    );
}

function initAdminPanelModule() {
    const partForm = document.getElementById('participation-form');
    if (partForm) partForm.addEventListener('submit', saveParticipation);
    const partCancel = document.getElementById('part-cancel-btn');
    if (partCancel) partCancel.addEventListener('click', resetParticipationForm);

    const annonceTitle = document.getElementById('annonce-title');
    if (annonceTitle) {
        annonceTitle.addEventListener('input', () => {
            annonceTitle.dataset.userEdited = '1';
        });
    }
    const btnRefreshAnnonce = document.getElementById('btn-refresh-annonce');
    if (btnRefreshAnnonce) {
        btnRefreshAnnonce.addEventListener('click', async () => {
            if (
                annonceLinesState.length > 0 &&
                !confirm(
                    'Actualiser depuis le stock ?\nL\'ordre enregistré est conservé pour les lignes existantes ; les nouvelles armes sont ajoutées à la fin.'
                )
            ) {
                return;
            }
            await refreshAnnoncePreview();
            showNotification('Lignes mises à jour depuis le stock', 'info');
        });
    }
    const btnSaveAnnonce = document.getElementById('btn-save-annonce-order');
    if (btnSaveAnnonce) btnSaveAnnonce.addEventListener('click', saveAnnonceOrder);
    const btnCopyAnnonce = document.getElementById('btn-copy-annonce');
    if (btnCopyAnnonce) btnCopyAnnonce.addEventListener('click', copyAnnonceToClipboard);
}

document.addEventListener('DOMContentLoaded', initAdminPanelModule);

window.loadParticipations = loadParticipations;
window.renderParticipationPanel = renderParticipationPanel;
window.editParticipation = editParticipation;
window.deleteParticipation = deleteParticipation;
window.loadAnnonceTab = loadAnnonceTab;
window.refreshAnnoncePreview = refreshAnnoncePreview;
window.setupParticipationListeners = setupParticipationListeners;
window.moveAnnonceLine = moveAnnonceLine;
window.saveAnnonceOrder = saveAnnonceOrder;
