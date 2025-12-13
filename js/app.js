import * as ui from './ui.js';

// --- State Management ---
let catalog = {};
let savedRosters = [];
let currentLang = 'ko';
let rules = [];
let unifiedSearchIndex = [];
let isSummaryMode = false;

// Roster Builder State
let currentRosterId = null;
let currentTeamId = null; 
let myRoster = [];

// Game State
let globalGameState = { currentTP: 1 };
let gameState = null;       // For the left team
let coopGameState = null;   // For the right team
let currentOpForEquip = null;

const STORAGE_KEY = 'kt_roster_library';

// --- Core App Logic ---

async function init() {
    try {
        const [manifestResponse, universalRulesResponse, rulesResponse] = await Promise.all([
            fetch('data/killTeam/index.json'),
            fetch('data/killTeam/Universal.json'),
            fetch('data/rules.json')
        ]);

        if (!manifestResponse.ok) throw new Error(`Failed to load index.json: ${manifestResponse.status}`);
        if (!universalRulesResponse.ok) throw new Error(`Failed to load Universal.json: ${universalRulesResponse.status}`);
        if (!rulesResponse.ok) throw new Error(`Failed to load rules.json: ${rulesResponse.status}`);
        
        const teamFilePaths = await manifestResponse.json();
        const universalRules = await universalRulesResponse.json();
        rules = await rulesResponse.json();
        
        await Promise.all(teamFilePaths.map(async (filePath) => {
            try {
                const teamResponse = await fetch(`data/killTeam/${filePath}`);
                if (!teamResponse.ok) throw new Error(`Failed to load ${filePath}`);
                const teamData = await teamResponse.json();
                teamData.ploys.strategy = (teamData.ploys.strategy || []).concat(universalRules.ploys.strategy || []);
                teamData.ploys.firefight = (teamData.ploys.firefight || []).concat(universalRules.ploys.firefight || []);
                teamData.equipments = (teamData.equipments || []).concat(universalRules.equipments || []);
                catalog[teamData.id] = teamData;
            } catch (error) {
                console.error(`Could not load data for ${filePath}:`, error);
            }
        }));
    } catch (error) {
        console.error("Could not load Kill Team manifest:", error);
        return;
    }

    buildSearchIndex(); // Build index with common rules initially

    const availableTeams = Object.values(catalog);
    ui.populateTeamSelect(availableTeams, currentLang);
    loadLibrary();
    
    let initialTeamId = null;
    let lastUsedRoster = null;
    if (savedRosters.length > 0) {
        lastUsedRoster = savedRosters.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        initialTeamId = lastUsedRoster.teamId;
    } else if (availableTeams.length > 0) {
        initialTeamId = availableTeams[0].id;
    }

    if (initialTeamId) {
        currentTeamId = initialTeamId;
        document.getElementById('team-select').value = currentTeamId;
        
        if (savedRosters.length > 0 && lastUsedRoster) {
            await loadRosterById(lastUsedRoster.id);
        } else {
            resetToNewRoster();
        }
    } else {
        console.error("No Kill Teams could be loaded.");
    }
    
    setupEventListeners();
    setLanguage(currentLang); // Call once to set initial language and rerender
}

function setLanguage(lang) {
    currentLang = lang;
    document.getElementById('lang-ko').classList.toggle('btn-secondary', lang === 'ko');
    document.getElementById('lang-ko').classList.toggle('btn-outline', lang !== 'ko');
    document.getElementById('lang-en').classList.toggle('btn-secondary', lang === 'en');
    document.getElementById('lang-en').classList.toggle('btn-outline', lang !== 'en');
    
    rerenderUI();
}

function toggleSummaryMode() {
    const btn = document.getElementById('btn-summary-toggle');
    isSummaryMode = !isSummaryMode;
    btn.classList.toggle('active', isSummaryMode);
    if(isSummaryMode) {
        btn.classList.remove('btn-secondary');
    } else {
        btn.classList.add('btn-secondary');
    }
    ui.setSummaryMode(isSummaryMode);
    rerenderUI();
}

function rerenderUI() {
    ui.populateTeamSelect(Object.values(catalog), currentLang);
    if(currentTeamId) document.getElementById('team-select').value = currentTeamId;
    
    if(catalog[currentTeamId]) {
        ui.updateTeamUI(catalog[currentTeamId], currentLang);
        ui.renderRosterList(myRoster, getTeamEquipCount(), currentLang);

        if(document.getElementById('screen-game').classList.contains('active')) {
            if (gameState) {
                const teamData = catalog[gameState.teamId];
                document.getElementById('team-left').style.setProperty('--primary-color', teamData.color);
                ui.renderGameInfo(teamData, spendCP, currentLang, 'team-left');
                ui.renderGameEquipment(teamData, currentLang, 'team-left');
                ui.renderGameScreen(gameState, currentLang, 'team-left');
                ui.updateTeamResourceDisplay(gameState, 'team-left');
            }
            if (coopGameState) {
                const teamData = catalog[coopGameState.teamId];
                document.getElementById('team-right').style.setProperty('--primary-color', teamData.color);
                ui.renderGameInfo(teamData, spendCP, currentLang, 'team-right');
                ui.renderGameEquipment(teamData, currentLang, 'team-right');
                ui.renderGameScreen(coopGameState, currentLang, 'team-right');
                ui.updateTeamResourceDisplay(coopGameState, 'team-right');
            }
        }
    }
    ui.updateRosterSelectDropdown(savedRosters, currentRosterId, currentLang);
}

function setupEventListeners() {
    document.getElementById('lang-ko').addEventListener('click', () => setLanguage('ko'));
    document.getElementById('lang-en').addEventListener('click', () => setLanguage('en'));
    document.getElementById('btn-summary-toggle').addEventListener('click', toggleSummaryMode);

    document.getElementById('roster-select').addEventListener('change', (e) => switchRoster(e.target.value));
    document.getElementById('roster-name').addEventListener('input', autoSave);
    document.getElementById('team-select').addEventListener('change', () => changeTeam(true));
    document.querySelector('.roster-manager .btn-danger').addEventListener('click', deleteCurrentRoster);
    document.querySelector('#screen-roster .btn-info').addEventListener('click', () => ui.openInfoModal(catalog[currentTeamId], currentLang));
    document.getElementById('btn-add-op').addEventListener('click', () => ui.openAddModal(catalog[currentTeamId], addOp, currentLang));
    document.querySelector('#screen-roster .btn-primary').addEventListener('click', startGame);

    document.getElementById('btn-exit-game').addEventListener('click', exitGame);
    document.getElementById('btn-add-team').addEventListener('click', activateCoopMode);

    const topBar = document.querySelector('.top-bar');
    topBar.querySelector('.tp-tracker .res-btn:first-of-type').addEventListener('click', () => updateTP(-1));
    topBar.querySelector('.tp-tracker .res-btn:last-of-type').addEventListener('click', () => updateTP(1));
    topBar.querySelector('.tp-tracker .btn-primary').addEventListener('click', endTurn);
    
    document.getElementById('team-left').addEventListener('click', handleTeamContainerEvents);
    document.getElementById('team-right').addEventListener('click', handleTeamContainerEvents);

    document.querySelector('#modal-overlay .btn-danger').addEventListener('click', ui.closeAddModal);
    document.querySelector('#equip-modal-overlay .btn-danger').addEventListener('click', ui.closeEquipModal);
    document.querySelector('#info-modal-overlay .btn-danger').addEventListener('click', ui.closeInfoModal);
    document.getElementById('my-roster-list').addEventListener('click', handleRosterListClick);

    const ruleSearchInput = document.getElementById('rule-search-input');
    ruleSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        if (searchTerm.length > 1) {
            const results = unifiedSearchIndex.filter(rule => 
                ui.getText(rule.key, 'en').toLowerCase().includes(searchTerm) || 
                ui.getText(rule.key, 'ko').toLowerCase().includes(searchTerm) ||
                ui.getText(rule.desc, 'ko').toLowerCase().includes(searchTerm)
            );
            ui.renderSearchResults(results, currentLang);
        } else {
            ui.renderSearchResults([], currentLang);
        }
    });

    document.getElementById('btn-clear-search').addEventListener('click', () => {
        ruleSearchInput.value = '';
        ui.renderSearchResults([], currentLang);
    });
}

function handleTeamContainerEvents(event) {
    const teamContainer = event.currentTarget;
    const containerId = teamContainer.id;
    const target = event.target;
    
    const tabButton = target.closest('.tab-btn');
    if (tabButton) {
        const tabName = tabButton.dataset.tab;
        if (tabName) {
            ui.switchTab(tabName, event, containerId);
        }
    } else if (target.closest('.op-card')) {
        handleGameOpListClick(event);
    } else if (target.closest('.res-btn')) {
        const type = target.dataset.type;
        const mod = parseInt(target.dataset.mod);
        updateTeamResource(containerId, type, mod);
    }
}

function handleRosterListClick(event) {
    const target = event.target;
    const opCard = target.closest('.op-card');
    if (!opCard) return;

    const opIndex = parseInt(opCard.dataset.index);

    if (target.closest('.btn-equip')) {
        currentOpForEquip = opIndex;
        ui.openEquipModal(catalog[currentTeamId], myRoster, addEquipToOp, currentLang);
    } else if (target.closest('.btn-danger')) {
        removeOp(opIndex);
    } else if (target.closest('.weapon-row')) {
        const weaponIndex = parseInt(target.closest('.weapon-row').dataset.index);
        toggleWeapon(opIndex, weaponIndex);
    } else if (target.closest('.card-equip-item .rm-btn')) {
        const equipIndex = parseInt(target.closest('.card-equip-item').dataset.index);
        removeEquipFromOp(opIndex, equipIndex);
    }
}

function handleGameOpListClick(event) {
    const target = event.target;
    const opCard = target.closest('.op-card');
    if (!opCard) return;

    const opIndex = parseInt(opCard.dataset.index);
    const containerId = opCard.closest('.team-container').id;
    const activeGameState = containerId === 'team-left' ? gameState : coopGameState;
    
    if (!activeGameState) return;

    if (target.closest('.hp-btn')) {
        const woundValue = parseInt(target.closest('.hp-btn').innerText);
        setWounds(activeGameState, opIndex, woundValue);
        ui.renderGameScreen(activeGameState, currentLang, containerId);
    } else if (target.closest('.card-equip-item')) {
        const equipIndex = parseInt(target.closest('.card-equip-item').dataset.index);
        toggleEquipUsed(activeGameState, opIndex, equipIndex);
        ui.renderGameScreen(activeGameState, currentLang, containerId);
    }
}

function changeTeam(shouldSave = true) {
    const select = document.getElementById('team-select');
    if (!select) return;
    currentTeamId = select.value;

    buildSearchIndex(currentTeamId); // Rebuild index for the new team

    ui.updateTeamUI(catalog[currentTeamId], currentLang);
    myRoster = [];
    ui.renderRosterList(myRoster, getTeamEquipCount(), currentLang);
    if (shouldSave) autoSave();
}

function addEquipToOp(equipData) {
    if (currentOpForEquip === null) return;
    const op = myRoster[currentOpForEquip];
    if (!op.assignedEquipments) op.assignedEquipments = [];
    
    const newEquip = JSON.parse(JSON.stringify(equipData));
    newEquip.isUsed = false;
    
    op.assignedEquipments.push(newEquip);
    ui.closeEquipModal();
    ui.renderRosterList(myRoster, getTeamEquipCount(), currentLang);
    autoSave();
}

function removeEquipFromOp(opIdx, eqIdx) {
    myRoster[opIdx].assignedEquipments.splice(eqIdx, 1);
    ui.renderRosterList(myRoster, getTeamEquipCount(), currentLang);
    autoSave();
}

function getTeamEquipCount() {
    return myRoster.reduce((count, op) => count + (op.assignedEquipments ? op.assignedEquipments.length : 0), 0);
}

function toggleEquipUsed(activeGameState, opIdx, eqIdx) {
    const op = activeGameState.operatives[opIdx];
    if (op && op.assignedEquipments && op.assignedEquipments[eqIdx]) {
        op.assignedEquipments[eqIdx].isUsed = !op.assignedEquipments[eqIdx].isUsed;
    }
}

async function switchRoster(value) {
    if (value === 'new') {
        resetToNewRoster();
    } else {
        await loadRosterById(value);
    }
}

function resetToNewRoster() {
    currentRosterId = null;
    document.getElementById('roster-name').value = "새 로스터";
    myRoster = [];
    currentTeamId = Object.keys(catalog)[0];
    document.getElementById('team-select').value = currentTeamId;
    
    buildSearchIndex(currentTeamId); // Build index for the new team

    ui.updateTeamUI(catalog[currentTeamId], currentLang);
    ui.renderRosterList(myRoster, getTeamEquipCount(), currentLang);
    ui.updateRosterSelectDropdown(savedRosters, currentRosterId, currentLang, 'roster-select');
}

async function loadRosterById(id) {
    const found = savedRosters.find(r => r.id === id);
    if (!found) return;

    currentRosterId = found.id;
    currentTeamId = found.teamId;

    buildSearchIndex(currentTeamId); // Rebuild index for the loaded team

    const teamData = catalog[currentTeamId];
    if (!teamData) {
        ui.showToast(`Error: Data for team ${currentTeamId} is missing.`);
        return;
    }
    
    myRoster = found.roster.map(savedOp => {
        const fullOpData = teamData.operatives.find(op => op.id === savedOp.opId);
        if (!fullOpData) return null;
        const hydratedOp = JSON.parse(JSON.stringify(fullOpData));
        if (savedOp.disabledWeapons && savedOp.disabledWeapons.length > 0) {
            hydratedOp.weapons.forEach(w => {
                if (savedOp.disabledWeapons.includes(w.name.en)) w.active = false;
            });
        }
        hydratedOp.assignedEquipments = savedOp.equipments || [];
        return hydratedOp;
    }).filter(Boolean);

    document.getElementById('roster-name').value = found.name;
    document.getElementById('team-select').value = currentTeamId;
    
    ui.updateTeamUI(catalog[currentTeamId], currentLang);
    ui.renderRosterList(myRoster, getTeamEquipCount(), currentLang);
    ui.updateRosterSelectDropdown(savedRosters, currentRosterId, currentLang, 'roster-select');
}

function autoSave() {
    const name = document.getElementById('roster-name').value || "Unknown";
    const minimalRoster = myRoster.map(op => ({
        opId: op.id,
        disabledWeapons: op.weapons.filter(w => w.active === false).map(w => w.name.en),
        equipments: op.assignedEquipments || []
    }));

    const rosterData = { id: currentRosterId, name, teamId: currentTeamId, roster: minimalRoster, updatedAt: new Date().getTime() };

    if (!currentRosterId) {
        rosterData.id = 'roster_' + new Date().getTime();
        currentRosterId = rosterData.id;
        savedRosters.push(rosterData);
    } else {
        const idx = savedRosters.findIndex(r => r.id === currentRosterId);
        if (idx >= 0) savedRosters[idx] = rosterData;
        else savedRosters.push(rosterData);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRosters));
    ui.updateRosterSelectDropdown(savedRosters, currentRosterId, currentLang, 'roster-select');
    ui.showToast("자동 저장됨");
}

function deleteCurrentRoster() {
    if (!currentRosterId) return;
    savedRosters = savedRosters.filter(r => r.id !== currentRosterId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRosters));
    resetToNewRoster();
    ui.showToast("삭제됨");
}

function loadLibrary() {
    const json = localStorage.getItem(STORAGE_KEY);
    savedRosters = json ? JSON.parse(json) : [];
}

function toggleWeapon(opIdx, wIdx) {
    const weapon = myRoster[opIdx].weapons[wIdx];
    weapon.active = weapon.active === undefined ? false : !weapon.active;
    ui.renderRosterList(myRoster, getTeamEquipCount(), currentLang);
    autoSave();
}

function addOp(opData) {
    const newOp = JSON.parse(JSON.stringify(opData));
    newOp.weapons.forEach(w => w.active = true);
    newOp.assignedEquipments = [];
    myRoster.push(newOp);
    ui.renderRosterList(myRoster, getTeamEquipCount(), currentLang);
    autoSave();
}

function removeOp(index) {
    myRoster.splice(index, 1);
    ui.renderRosterList(myRoster, getTeamEquipCount(), currentLang);
    autoSave();
}


// --- Search Index Builder ---
function buildSearchIndex(...teamIds) {
    unifiedSearchIndex = [];

    // 1. Add global rules
    rules.forEach(rule => {
        unifiedSearchIndex.push({
            key: { en: rule.key, ko: rule.key },
            desc: rule.desc,
            type: { en: 'Common Rule', ko: '공통 규칙' }
        });
    });

    // 2. Add team-specific rules
    teamIds.forEach(teamId => {
        if (!teamId || !catalog[teamId]) {
            return;
        }
        const team = catalog[teamId];
        const teamColor = team.color;

        // Faction Rules
        (team.factionRules || []).forEach(r => unifiedSearchIndex.push({ key: (r.title || r.name), desc: r.desc, type: { en: 'Faction Rule', ko: '팩션 룰' }, teamColor }));
        
        // Ploys
        [...(team.ploys.strategy || []), ...(team.ploys.firefight || [])].forEach(p => unifiedSearchIndex.push({ key: p.name, desc: p.desc, type: { en: 'Ploy', ko: '계략' }, teamColor }));
        
        // Equipments
        (team.equipments || []).forEach(e => unifiedSearchIndex.push({ key: e.name, desc: e.desc, type: { en: 'Equipment', ko: '장비' }, teamColor }));

        // Operatives and their abilities
        (team.operatives || []).forEach(op => {
            const opName = op.name || op.title;
            unifiedSearchIndex.push({ key: opName, desc: { en: `Operative from ${ui.getText(team.name, 'en')}`, ko: `${ui.getText(team.name, 'ko')}의 오퍼레이티브`}, type: { en: 'Operative', ko: '오퍼레이티브' }, teamColor });
            (op.abilities || []).forEach(a => {
                const abilityName = a.name || a.title;
                unifiedSearchIndex.push({ key: abilityName, desc: a.desc, type: { en: 'Ability', ko: '능력' }, teamColor });
            });
        });
    });
}


// --- Game Logic ---

function startGame() {
    if (myRoster.length === 0) {
        ui.showToast("팀원을 최소 1명 이상 추가해주세요!");
        return;
    }
    const teamData = catalog[currentTeamId];
    
    globalGameState = { currentTP: 1 };
    gameState = {
        name: document.getElementById('roster-name').value,
        teamId: currentTeamId,
        vp: 0, cp: 2,
        fp: teamData.resourceConfig ? teamData.resourceConfig.start : 0,
        operatives: JSON.parse(JSON.stringify(myRoster.filter(op => op.stats.W > 0)))
    };
    gameState.operatives.forEach(op => { op.currentW = op.stats.W; op.startOfTurnW = op.stats.W; });

    buildSearchIndex(currentTeamId);

    document.getElementById('team-left').style.setProperty('--primary-color', teamData.color);
    document.querySelector('#team-left .team-title').innerText = gameState.name;
    ui.renderGameInfo(teamData, spendCP, currentLang, 'team-left');
    ui.renderGameEquipment(teamData, currentLang, 'team-left');
    ui.updateResourceDisplay(globalGameState);
    ui.updateTeamResourceDisplay(gameState, 'team-left');
    ui.renderGameScreen(gameState, currentLang, 'team-left');
    
    ui.showScreen('game');
    const firstTabBtn = document.querySelector('#team-left .tab-btn');
    if (firstTabBtn) ui.switchTab('ops', { target: firstTabBtn }, 'team-left');
}

function exitGame() {
    document.getElementById('screen-game').classList.remove('coop-mode');
    document.querySelector('.container').classList.remove('coop-view');
    document.getElementById('btn-add-team').style.display = 'block';
    document.getElementById('team-right').innerHTML = '';
    gameState = null;
    coopGameState = null;
    buildSearchIndex(); // Rebuild with only common rules
    ui.showScreen('roster');
}

function activateCoopMode() {
    document.getElementById('screen-game').classList.add('coop-mode');
    document.querySelector('.container').classList.add('coop-view');
    this.style.display = 'none';

    ui.displayCoopPlaceholder(currentLang, savedRosters);
    document.getElementById('btn-activate-coop').addEventListener('click', loadCoopTeam);
}

function loadCoopTeam() {
    const rosterId = document.getElementById('coop-roster-select').value;
    if (rosterId === 'new' || !rosterId) {
        ui.showToast("저장된 로스터를 선택하세요.");
        return;
    }
    const found = savedRosters.find(r => r.id === rosterId);
    if (!found) return;

    const teamData = catalog[found.teamId];
    if (!teamData) {
        ui.showToast(`Error: Data for team ${found.teamId} is missing.`);
        return;
    }

    const coopRoster = found.roster.map(savedOp => {
        const fullOpData = teamData.operatives.find(op => op.id === savedOp.opId);
        if (!fullOpData) return null;
        const hydratedOp = JSON.parse(JSON.stringify(fullOpData));
        if (savedOp.disabledWeapons && savedOp.disabledWeapons.length > 0) {
            hydratedOp.weapons.forEach(w => {
                if (savedOp.disabledWeapons.includes(w.name.en)) w.active = false;
            });
        }
        hydratedOp.assignedEquipments = savedOp.equipments || [];
        return hydratedOp;
    }).filter(Boolean);

    coopGameState = {
        name: found.name,
        teamId: found.teamId,
        vp: 0, cp: 2,
        fp: teamData.resourceConfig ? teamData.resourceConfig.start : 0,
        operatives: JSON.parse(JSON.stringify(coopRoster.filter(op => op.stats.W > 0)))
    };
    coopGameState.operatives.forEach(op => { op.currentW = op.stats.W; op.startOfTurnW = op.stats.W; });

    buildSearchIndex(gameState.teamId, coopGameState.teamId);

    document.getElementById('team-right').style.setProperty('--primary-color', teamData.color);
    document.getElementById('team-right').innerHTML = `
        <div class="sticky-header">
            <h3 class="team-title" style="margin-bottom: 10px; text-align: center;"></h3>
            <div class="resource-grid">
                <div class="resource-box"><span class="resource-label">VP (승점)</span><span class="resource-val" data-type="vp">0</span><div class="res-btn-group"><button class="res-btn" data-type="vp" data-mod="-1">-</button><button class="res-btn" data-type="vp" data-mod="1">+</button></div></div>
                <div class="resource-box"><span class="resource-label">CP (커맨드)</span><span class="resource-val" data-type="cp">2</span><div class="res-btn-group"><button class="res-btn" data-type="vp" data-mod="-1">-</button><button class="res-btn" data-type="vp" data-mod="1">+</button></div></div>
                <div class="resource-box" data-type="fp" style="display: none;"><span class="resource-label" data-type="fp-name">FP</span><span class="resource-val" data-type="fp">0</span><div class="res-btn-group"><button class="res-btn" data-type="fp" data-mod="-1">-</button><button class="res-btn" data-type="fp" data-mod="1">+</button></div></div>
            </div>
        </div>
        <div class="tab-nav">
            <button class="tab-btn active" data-tab="ops">오퍼레이티브</button>
            <button class="tab-btn" data-tab="ploys">규칙 & 계략</button>
            <button class="tab-btn" data-tab="equip">장비 도감</button>
        </div>
        <div id="tab-ops" class="tab-content active"><div class="game-op-list"></div></div>
        <div id="tab-ploys" class="tab-content"><h3 style="margin-top:0;">📜 팩션 규칙</h3><div class="game-faction-rules"></div><h3>⚡ 전략 계략</h3><div class="game-strat-ploys"></div><h3>🔥 교전 계략</h3><div class="game-fire-ploys"></div></div>
        <div id="tab-equip" class="tab-content"><h3 style="margin-top:0;">🎒 장비 도감</h3><div class="game-equipment-list"></div></div>`;

    document.querySelector('#team-right .team-title').innerText = coopGameState.name;
    ui.renderGameInfo(teamData, spendCP, currentLang, 'team-right');
    ui.renderGameEquipment(teamData, currentLang, 'team-right');
    ui.updateTeamResourceDisplay(coopGameState, 'team-right');
    ui.renderGameScreen(coopGameState, currentLang, 'team-right');
    
    const firstTabBtn = document.querySelector('#team-right .tab-btn');
    if (firstTabBtn) ui.switchTab('ops', { target: firstTabBtn }, 'team-right');
}

function spendCP(containerId) {
    const activeGameState = containerId === 'team-left' ? gameState : coopGameState;
    if (activeGameState.cp > 0) {
        activeGameState.cp--;
        ui.updateTeamResourceDisplay(activeGameState, containerId);
        ui.showToast("CP를 소모했습니다.");
    } else {
        ui.showToast("CP가 부족합니다!");
    }
}

function updateTeamResource(containerId, type, val) {
    const activeGameState = containerId === 'team-left' ? gameState : coopGameState;
    if (!activeGameState) return;

    activeGameState[type] += val;
    if (activeGameState[type] < 0) activeGameState[type] = 0;
    if (type === 'fp') {
        const conf = catalog[activeGameState.teamId].resourceConfig;
        if (conf && activeGameState.fp > conf.max) activeGameState.fp = conf.max;
    }
    ui.updateTeamResourceDisplay(activeGameState, containerId);
}

function updateTP(val) {
    if (!gameState) return;
    globalGameState.currentTP += val;
    if (globalGameState.currentTP < 1) globalGameState.currentTP = 1;
    
    finalizeWoundStates(gameState);
    if(coopGameState) finalizeWoundStates(coopGameState);
    
    ui.updateResourceDisplay(globalGameState);
    ui.renderGameScreen(gameState, currentLang, 'team-left');
    if(coopGameState) ui.renderGameScreen(coopGameState, currentLang, 'team-right');
}

function endTurn() {
    if (!gameState) return;
    globalGameState.currentTP += 1;
    
    if(gameState) gameState.cp += 1;
    if(coopGameState) coopGameState.cp += 1;
    
    finalizeWoundStates(gameState);
    if(coopGameState) finalizeWoundStates(coopGameState);

    ui.updateResourceDisplay(globalGameState);
    if(gameState) ui.updateTeamResourceDisplay(gameState, 'team-left');
    if(coopGameState) ui.updateTeamResourceDisplay(coopGameState, 'team-right');

    if(gameState) ui.renderGameScreen(gameState, currentLang, 'team-left');
    if(coopGameState) ui.renderGameScreen(coopGameState, currentLang, 'team-right');
    ui.showToast("턴이 종료되었습니다. (양 팀 CP+1, TP+1)");
}

function finalizeWoundStates(activeGameState) {
    if (!activeGameState) return;
    activeGameState.operatives.forEach(op => {
        op.startOfTurnW = op.currentW;
    });
}

function setWounds(activeGameState, opIdx, val) {
    if (!activeGameState) return;
    const op = activeGameState.operatives[opIdx];
    if (op.currentW === val) {
        op.currentW = val - 1;
    } else {
        op.currentW = val;
    }
}

document.addEventListener('DOMContentLoaded', init);
