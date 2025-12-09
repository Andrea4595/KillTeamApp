import * as ui from './ui.js';

// State variables
let availableKillTeams = []; // New state variable
let catalog = {};
let savedRosters = [];
let currentRosterId = null;
let currentTeamId = null; // Will be set after manifest load or from saved roster
let currentLang = 'ko';
let myRoster = [];
let gameState = { vp: 0, cp: 2, fp: 0, currentTP: 1, operatives: [] };
let currentOpForEquip = null;

const STORAGE_KEY = 'kt_roster_library';

// --- Core App Logic ---

async function init() {
    try {
        const response = await fetch('data/killTeam/index.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        availableKillTeams = await response.json();
    } catch (error) {
        console.error("Could not load Kill Team manifest:", error);
        // Handle the error
        return;
    }

    ui.populateTeamSelect(availableKillTeams, currentLang); // Pass availableKillTeams to UI
    loadLibrary();
    
    // Determine the initial Kill Team to load
    let initialTeamId = null;
    let lastUsedRoster = null;
    if (savedRosters.length > 0) {
        lastUsedRoster = savedRosters.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        initialTeamId = lastUsedRoster.teamId;
    } else if (availableKillTeams.length > 0) {
        initialTeamId = availableKillTeams[0].id;
    }

    if (initialTeamId) {
        // Set currentTeamId and load the specific Kill Team data
        document.getElementById('team-select').value = initialTeamId;
        await changeTeam(false); // Load team data, but don't auto-save yet
        
        if (savedRosters.length > 0 && lastUsedRoster) {
            loadRosterById(lastUsedRoster.id);
        } else {
            resetToNewRoster();
        }

    } else {
        resetToNewRoster(); // No teams available or saved rosters
    }
    
    setupEventListeners();
    setLanguage(currentLang); // Set initial button styles
}

function setLanguage(lang) {
    currentLang = lang;
    // Update button styles
    document.getElementById('lang-ko').classList.toggle('btn-secondary', lang === 'ko');
    document.getElementById('lang-ko').classList.toggle('btn-outline', lang !== 'ko');
    document.getElementById('lang-en').classList.toggle('btn-secondary', lang === 'en');
    document.getElementById('lang-en').classList.toggle('btn-outline', lang !== 'en');
    
    rerenderUI();
}

function rerenderUI() {
    // This function will re-render all visible text-based components
    ui.populateTeamSelect(availableKillTeams, currentLang);
    document.getElementById('team-select').value = currentTeamId; // re-select current team
    
    if(catalog[currentTeamId]) {
        ui.updateTeamUI(catalog[currentTeamId]);
        ui.renderRosterList(myRoster, getTeamEquipCount(), handleRosterListClick, currentLang);
        // If game is active, re-render game screen too
        const gameScreen = document.getElementById('screen-game');
        if(gameScreen.classList.contains('active')) {
            ui.renderGameInfo(catalog[currentTeamId], spendCP, currentLang);
            ui.renderGameEquipment(catalog[currentTeamId], currentLang);
            ui.renderGameScreen(gameState, handleGameOpListClick, currentLang);
        }
    }
    ui.updateRosterSelectDropdown(savedRosters, currentRosterId, currentLang);
}


function setupEventListeners() {
    // Language Switcher
    document.getElementById('lang-ko').addEventListener('click', () => setLanguage('ko'));
    document.getElementById('lang-en').addEventListener('click', () => setLanguage('en'));

    // Roster Screen
    document.getElementById('roster-select').addEventListener('change', (e) => switchRoster(e.target.value));
    document.getElementById('roster-name').addEventListener('input', autoSave);
    document.getElementById('team-select').addEventListener('change', () => changeTeam(true));
    document.querySelector('.roster-manager .btn-danger').addEventListener('click', deleteCurrentRoster);
    document.querySelector('#screen-roster .btn-info').addEventListener('click', () => ui.openInfoModal(catalog[currentTeamId], currentLang));
    document.getElementById('btn-add-op').addEventListener('click', () => ui.openAddModal(catalog[currentTeamId], addOp, currentLang));
    document.querySelector('#screen-roster .btn-primary').addEventListener('click', startGame);

    // Game Screen
    document.getElementById('btn-exit-game').addEventListener('click', () => ui.showScreen('roster'));
    document.querySelector('.tp-tracker .res-btn:first-of-type').addEventListener('click', () => updateTP(-1));
    document.querySelector('.tp-tracker .res-btn:last-of-type').addEventListener('click', () => updateTP(1));
    document.querySelector('.tp-tracker .btn-primary').addEventListener('click', endTurn);

    // Resource buttons
    const resourceGrid = document.getElementById('resource-grid');
    resourceGrid.querySelector('.resource-box:nth-child(1) .res-btn:first-of-type').addEventListener('click', () => updateResource('vp', -1));
    resourceGrid.querySelector('.resource-box:nth-child(1) .res-btn:last-of-type').addEventListener('click', () => updateResource('vp', 1));
    resourceGrid.querySelector('.resource-box:nth-child(2) .res-btn:first-of-type').addEventListener('click', () => updateResource('cp', -1));
    resourceGrid.querySelector('.resource-box:nth-child(2) .res-btn:last-of-type').addEventListener('click', () => updateResource('cp', 1));
    resourceGrid.querySelector('#faction-res-box .res-btn:first-of-type').addEventListener('click', () => updateResource('fp', -1));
    resourceGrid.querySelector('#faction-res-box .res-btn:last-of-type').addEventListener('click', () => updateResource('fp', 1));
    
    // Tabs
    const tabNav = document.querySelector('.tab-nav');
    tabNav.querySelector('button:nth-child(1)').addEventListener('click', (e) => ui.switchTab('ops', e));
    tabNav.querySelector('button:nth-child(2)').addEventListener('click', (e) => ui.switchTab('ploys', e));
    tabNav.querySelector('button:nth-child(3)').addEventListener('click', (e) => ui.switchTab('equip', e));

    // Modals
    document.querySelector('#modal-overlay .btn-danger').addEventListener('click', ui.closeAddModal);
    document.querySelector('#equip-modal-overlay .btn-danger').addEventListener('click', ui.closeEquipModal);
    document.querySelector('#info-modal-overlay .btn-danger').addEventListener('click', ui.closeInfoModal);

    // Event Delegation for dynamic content
    document.getElementById('my-roster-list').addEventListener('click', handleRosterListClick);
    document.getElementById('game-op-list').addEventListener('click', handleGameOpListClick);
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

    if (target.closest('.hp-btn')) {
        const woundValue = parseInt(target.closest('.hp-btn').innerText);
        setWounds(opIndex, woundValue);
    } else if (target.closest('.card-equip-item')) {
        const equipIndex = parseInt(target.closest('.card-equip-item').dataset.index);
        toggleEquipUsed(opIndex, equipIndex);
    }
}

// --- Data & State Management ---

async function changeTeam(shouldSave = true) {
    const select = document.getElementById('team-select');
    if (!select) return;
    currentTeamId = select.value;

    const selectedTeamManifest = availableKillTeams.find(team => team.id === currentTeamId);
    if (selectedTeamManifest) {
        try {
            const response = await fetch(`data/killTeam/${selectedTeamManifest.file_path}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const teamData = await response.json();
            catalog[currentTeamId] = teamData; // Populate the catalog with the fetched data
        } catch (error) {
            console.error(`Could not load data for ${currentTeamId}:`, error);
            ui.showToast(`Error loading data for ${currentTeamId}.`);
            return;
        }
    } else {
        // Handle case where team manifest is not found
        console.error(`Manifest for team ${currentTeamId} not found.`);
        ui.showToast(`Error: Team ${currentTeamId} data not found.`);
        return;
    }

    ui.updateTeamUI(catalog[currentTeamId]);
    myRoster = [];
    ui.renderRosterList(myRoster, getTeamEquipCount(), handleRosterListClick, currentLang);
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
    ui.renderRosterList(myRoster, getTeamEquipCount(), handleRosterListClick, currentLang);
    autoSave();
}

function removeEquipFromOp(opIdx, eqIdx) {
    myRoster[opIdx].assignedEquipments.splice(eqIdx, 1);
    ui.renderRosterList(myRoster, getTeamEquipCount(), handleRosterListClick, currentLang);
    autoSave();
}

function getTeamEquipCount() {
    return myRoster.reduce((count, op) => count + (op.assignedEquipments ? op.assignedEquipments.length : 0), 0);
}

function toggleEquipUsed(opIdx, eqIdx) {
    const op = gameState.operatives[opIdx];
    if (op && op.assignedEquipments && op.assignedEquipments[eqIdx]) {
        op.assignedEquipments[eqIdx].isUsed = !op.assignedEquipments[eqIdx].isUsed;
        ui.renderGameScreen(gameState, handleGameOpListClick, currentLang);
    }
}

function switchRoster(value) {
    if (value === 'new') {
        resetToNewRoster();
    } else {
        loadRosterById(value);
    }
}

function resetToNewRoster() {
    currentRosterId = null;
    document.getElementById('roster-name').value = "새 로스터";
    myRoster = [];
    currentTeamId = Object.keys(catalog)[0];
    document.getElementById('team-select').value = currentTeamId;
    
    ui.updateTeamUI(catalog[currentTeamId]);
    ui.renderRosterList(myRoster, getTeamEquipCount(), handleRosterListClick, currentLang);
    ui.updateRosterSelectDropdown(savedRosters, currentRosterId, currentLang);
}

function loadRosterById(id) {
    const found = savedRosters.find(r => r.id === id);
    if (!found) return;

    currentRosterId = found.id;
    document.getElementById('roster-name').value = found.name;
    myRoster = JSON.parse(JSON.stringify(found.roster));
    
    if (catalog[found.teamId]) {
        currentTeamId = found.teamId;
        document.getElementById('team-select').value = currentTeamId;
        ui.updateTeamUI(catalog[currentTeamId]);
    }
    
    ui.renderRosterList(myRoster, getTeamEquipCount(), handleRosterListClick, currentLang);
    ui.updateRosterSelectDropdown(savedRosters, currentRosterId, currentLang);
}

function autoSave() {
    const name = document.getElementById('roster-name').value || "Unknown";
    const rosterData = { 
        id: currentRosterId, 
        name: name, 
        teamId: currentTeamId, 
        roster: myRoster, 
        updatedAt: new Date().getTime() 
    };

    if (!currentRosterId) {
        rosterData.id = 'roster_' + new Date().getTime();
        currentRosterId = rosterData.id;
        savedRosters.push(rosterData);
    } else {
        const idx = savedRosters.findIndex(r => r.id === currentRosterId);
        if (idx >= 0) {
            savedRosters[idx] = rosterData;
        } else {
            savedRosters.push(rosterData);
        }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRosters));
    ui.updateRosterSelectDropdown(savedRosters, currentRosterId, currentLang);
    ui.showToast("자동 저장됨");
}

function deleteCurrentRoster() {
    if (!currentRosterId) {
        ui.showToast("저장되지 않은 로스터입니다.");
        return;
    }
    savedRosters = savedRosters.filter(r => r.id !== currentRosterId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRosters));
    resetToNewRoster();
    ui.showToast("삭제됨");
}

function loadLibrary() {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json) {
        try {
            savedRosters = JSON.parse(json);
        } catch (e) {
            savedRosters = [];
        }
    }
}

function toggleWeapon(opIdx, wIdx) {
    const weapon = myRoster[opIdx].weapons[wIdx];
    weapon.active = weapon.active === undefined ? false : !weapon.active;
    ui.renderRosterList(myRoster, getTeamEquipCount(), handleRosterListClick, currentLang);
    autoSave();
}

function addOp(opData) {
    const newOp = JSON.parse(JSON.stringify(opData));
    newOp.weapons.forEach(w => w.active = true);
    newOp.assignedEquipments = [];
    myRoster.push(newOp);
    ui.renderRosterList(myRoster, getTeamEquipCount(), handleRosterListClick, currentLang);
    autoSave();
}

function removeOp(index) {
    myRoster.splice(index, 1);
    ui.renderRosterList(myRoster, getTeamEquipCount(), handleRosterListClick, currentLang);
    autoSave();
}

// --- Game Logic ---

function startGame() {
    if (myRoster.length === 0) {
        ui.showToast("팀원을 최소 1명 이상 추가해주세요!");
        return;
    }
    const teamData = catalog[currentTeamId];

    gameState.vp = 0;
    gameState.cp = 2;
    gameState.fp = teamData.resourceConfig ? teamData.resourceConfig.start : 0;
    gameState.currentTP = 1;
    gameState.operatives = JSON.parse(JSON.stringify(myRoster.filter(op => op.stats.W > 0))); // filter out expendable
    gameState.operatives.forEach(op => {
        op.currentW = op.stats.W;
        op.startOfTurnW = op.stats.W;
    });

    ui.renderGameInfo(teamData, spendCP, currentLang);
    ui.renderGameEquipment(teamData, currentLang);
    ui.updateResourceDisplay(gameState);
    ui.renderGameScreen(gameState, handleGameOpListClick, currentLang);
    
    const gameTitle = document.getElementById('roster-name').value;
    document.getElementById('game-title').innerText = gameTitle;
    
    ui.showScreen('game');
    const firstTabBtn = document.querySelector('.tab-btn');
    if (firstTabBtn) ui.switchTab('ops', { target: firstTabBtn });
}

function spendCP() {
    if (gameState.cp > 0) {
        updateResource('cp', -1);
        ui.showToast("CP를 소모했습니다.");
    } else {
        ui.showToast("CP가 부족합니다!");
    }
}

function updateResource(type, val) {
    gameState[type] += val;
    if (gameState[type] < 0) gameState[type] = 0;
    if (type === 'fp') {
        const conf = catalog[currentTeamId].resourceConfig;
        if (conf && gameState.fp > conf.max) gameState.fp = conf.max;
    }
    ui.updateResourceDisplay(gameState);
}

function updateTP(val) {
    gameState.currentTP += val;
    if (gameState.currentTP < 1) gameState.currentTP = 1;
    finalizeWoundStates();
    ui.updateResourceDisplay(gameState);
    ui.renderGameScreen(gameState, handleGameOpListClick, currentLang);
}

function endTurn() {
    gameState.cp += 1;
    gameState.currentTP += 1;
    finalizeWoundStates();
    ui.updateResourceDisplay(gameState);
    ui.renderGameScreen(gameState, handleGameOpListClick, currentLang);
    ui.showToast("턴이 종료되었습니다. (CP+1, TP+1)");
}

function finalizeWoundStates() {
    gameState.operatives.forEach(op => {
        op.startOfTurnW = op.currentW;
    });
}

function setWounds(opIdx, val) {
    const op = gameState.operatives[opIdx];
    if (op.currentW === val) {
        op.currentW = val - 1;
    } else {
        op.currentW = val;
    }
    ui.renderGameScreen(gameState, handleGameOpListClick, currentLang);
}


// Start the app
document.addEventListener('DOMContentLoaded', init);
