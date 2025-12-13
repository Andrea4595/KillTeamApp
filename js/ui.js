export function getText(data, lang) {
    if (typeof data === 'string') {
        return data;
    }
    if (data && typeof data === 'object') {
        return data[lang] || data['en'] || ''; // Fallback to English, then empty string
    }
    return '';
}


export function showToast(msg) {
    const el = document.getElementById('toast-msg');
    if (!el) return;
    el.innerText = msg;
    el.classList.add('show');
    setTimeout(() => {
        el.classList.remove('show');
    }, 2000);
}

export function switchTab(tabId, e, containerId = 'team-left') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    container.querySelectorAll('.tab-content').forEach(con => con.classList.remove('active'));
    
    if (e && e.target) {
        e.target.classList.add('active');
    }
    const tab = container.querySelector(`#tab-${tabId}`);
    if (tab) {
        tab.classList.add('active');
    }
}


export function updateTeamUI(teamData, lang) {
    if (!teamData) return;
    // This is for the roster screen only now. Game screen colors are handled per-container.
    document.documentElement.style.setProperty('--primary-color', teamData.color);

    const rulesEl = document.getElementById('team-rules-text');
    if (rulesEl) {
        rulesEl.innerHTML = getText(teamData.rulesText, lang) || '';
    }
}

export function openEquipModal(teamData, myRoster, addEquipHandler, lang) {
    const list = document.getElementById('equip-modal-list');
    list.innerHTML = '';

    if (!teamData.equipments || teamData.equipments.length === 0) {
        list.innerHTML = '<p>장비가 없습니다.</p>';
        return;
    }
    
    const equipUsageCounts = myRoster.reduce((counts, op) => {
        if (op.assignedEquipments) {
            op.assignedEquipments.forEach(eq => {
                counts[eq.id] = (counts[eq.id] || 0) + 1;
            });
        }
        return counts;
    }, {});
    
    const totalEquipCount = Object.values(equipUsageCounts).reduce((a, b) => a + b, 0);
    const isTeamFull = totalEquipCount >= 4;

    teamData.equipments.forEach(eq => {
        const limit = eq.limit !== undefined ? eq.limit : 99;
        const currentCount = equipUsageCounts[eq.id] || 0;
        const isLimitReached = currentCount >= limit;
        const isDisabled = isTeamFull || isLimitReached;

        let reason = "";
        if (isLimitReached) reason = `(제한 도달: ${limit}/${limit})`;
        else if (isTeamFull && !isLimitReached) reason = "(장비 한도 4개 초과)";

        const btn = document.createElement('button');
        btn.innerHTML = `<span style="font-weight:bold; color:#e67e22;">${getText(eq.name, lang)}</span> <span style="font-size:0.8rem;">${reason}</span><br><span style="font-size:0.8rem; color:#aaa;">${getText(eq.desc, lang)}</span>`;
        btn.disabled = isDisabled;
        btn.onclick = () => addEquipHandler(eq);
        list.appendChild(btn);
    });

    document.getElementById('equip-modal-overlay').style.display = 'flex';
}


export function closeEquipModal() {
    document.getElementById('equip-modal-overlay').style.display = 'none';
}

export function updateRosterSelectDropdown(savedRosters, currentRosterId, lang, selectId = 'roster-select') {
    const select = document.getElementById(selectId);
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '';
    const newOption = document.createElement('option');
    newOption.value = 'new';
    newOption.text = lang === 'ko' ? '+ 새 로스터 만들기' : '+ New Roster';
    select.appendChild(newOption);

    savedRosters.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.text = r.name || (lang === 'ko' ? "(이름 없음)" : "(Unnamed)");
        select.appendChild(opt);
    });
    select.value = currentRosterId || 'new';
}


export function renderRosterList(roster, equipCount, lang) {
    const container = document.getElementById('my-roster-list');
    const countSpan = document.getElementById('roster-count');
    const equipSpan = document.getElementById('equip-count');

    if (!container) return;
    container.innerHTML = '';
    if (countSpan) countSpan.innerText = roster.length;
    if (equipSpan) equipSpan.innerText = equipCount;

    if (roster.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:#aaa; border: 2px dashed #555; border-radius:4px;">${lang === 'ko' ? '팀원이 없습니다.<br>추가 버튼을 눌러주세요.' : 'No operatives.<br>Please add one.'}</div>`;
        return;
    }
    roster.forEach((op, index) => {
        container.innerHTML += renderOpCard(op, 'roster', index, lang);
    });
}

function renderOpCard(op, mode, idx, lang) {
    const isGameMode = (mode === 'game');
    const isRosterMode = (mode === 'roster');

    const isDead = isGameMode && (op.currentW <= 0);
    const isInjured = isGameMode && !isDead && (op.currentW < op.stats.W / 2);

    let cardClass = 'op-card';
    if (isDead) cardClass += ' incapacitated';
    else if (isInjured) cardClass += ' injured';

    let displayM = op.stats.M;
    let injuredClass = isInjured ? 'stat-modified' : '';
    if (isInjured) {
        const moveVal = parseInt(op.stats.M.replace('"', ''));
        displayM = `${Math.max(0, moveVal - 2)}"`;
    }

    const abilitiesHtml = (op.abilities || []).map(a => `<div class="ability-item"><span class="ability-title">${getText(a.title, lang)}:</span><span class="ability-desc">${getText(a.desc, lang)}</span></div>`).join('');

    const weaponsHtml = op.weapons.map((w, wIdx) => {
        if (isGameMode && w.active === false) return '';
        const isActive = w.active !== false;
        let rowClass = 'weapon-row';
        if (isRosterMode) {
            rowClass += ' interactive';
            if (!isActive) rowClass += ' inactive';
        }
        let hitVal = w.hit;
        if (isInjured) {
            const baseHit = parseInt(w.hit.replace('+', ''));
            hitVal = `${baseHit + 1}+`;
        }
        const rangeBadgeClass = w.range === 'Ranged' ? 'range-ranged' : 'range-melee';
        const rangeBadgeText = w.range === 'Ranged' ? 'R' : 'M';
        const rulesHtml = (w.rules && w.rules.length > 0) ? `<div class="weapon-rules">${w.rules.map(r => `<span class="rule-tag">${getText(r, lang)}</span>`).join(', ')}</div>` : '';

        return `
            <div class="${rowClass}" data-index="${wIdx}">
                <div class="weapon-main">
                    <div style="display:flex; align-items:center;">
                        <span class="weapon-range-badge ${rangeBadgeClass}">${rangeBadgeText}</span>
                        <span class="weapon-name">${getText(w.name, lang)}</span>
                    </div>
                    <span class="weapon-stats">
                        A:${w.A}&nbsp; Hit:<span class="${injuredClass}">${hitVal}</span>&nbsp; D:${w.dmg}
                    </span>
                </div>
                ${rulesHtml}
            </div>`;
    }).join('');
    
    const tipHtml = isRosterMode ? `<div class="weapon-tip" style="font-size: 0.75rem; color: #888; text-align: center; margin-top: 5px;">${lang === 'ko' ? '💡 무기를 클릭하여 활성/비활성 상태를 변경하세요.' : '💡 Click a weapon to toggle its active state.'}</div>` : '';

    let woundsArea = '';
    if (isGameMode) {
        let btnsHtml = '';
        for (let i = 1; i <= op.stats.W; i++) {
            let stateClass = 'inactive';
            if (i <= op.currentW) {
                stateClass = (i <= op.startOfTurnW) ? 'active' : 'recovered';
            } else if (i <= op.startOfTurnW) {
                stateClass = 'damaged';
            }
            btnsHtml += `<div class="hp-btn ${stateClass}">${i}</div>`;
        }
        woundsArea = `<div class="wounds-container"><div class="wounds-label"><span>${lang === 'ko' ? '체력' : 'Wounds'}</span><span style="color:white; font-weight:bold;">${op.currentW} / ${op.stats.W}</span></div><div class="hp-grid">${btnsHtml}</div></div>`;
    }

    const equipSection = (op.assignedEquipments && op.assignedEquipments.length > 0) ?
        `<div class="card-equip-section">${op.assignedEquipments.map((e, eIdx) => `
            <div class="card-equip-item ${e.isUsed ? 'used' : ''} ${isGameMode ? 'interactive' : ''}" data-index="${eIdx}">
                <div>
                    <span class="equip-name">${getText(e.name, lang)}</span>
                    <div class="equip-desc-small">${getText(e.desc, lang)}</div>
                </div>
                ${isRosterMode ? `<button class="rm-btn" style="background:transparent; border:none; color:red; cursor:pointer;">✖</button>` : ''}
            </div>`).join('')}
        </div>` : '';

    let actionArea = '';
    if (mode === 'modal') {
        actionArea = `<button class="btn btn-primary btn-small add-op-to-roster">${lang === 'ko' ? '➕ 팀에 추가' : '➕ Add to Team'}</button>`;
    } else if (mode === 'roster') {
        actionArea = `
            <div style="display:flex; justify-content:space-between; margin-top:10px;">
                <button class="btn-equip btn-secondary btn-small">${lang === 'ko' ? '➕ 장비 추가' : '➕ Add Equipment'}</button>
                <button class="btn btn-danger btn-small">${lang === 'ko' ? '🗑️ 제거' : '🗑️ Remove'}</button>
            </div>`;
    }

    return `
        <div class="${cardClass}" data-index="${idx}">
            <div class="op-header">
                <h3>${getText(op.name, lang)}</h3>
                <span class="op-role">${getText(op.role, lang)}</span>
            </div>
            <table class="stat-table">
                <thead><tr><th>M</th><th>APL</th><th>DF</th><th>SV</th><th>W</th></tr></thead>
                <tbody><tr><td class="${injuredClass}">${displayM}</td><td>${op.stats.APL}</td><td>${op.stats.D}</td><td>${op.stats.S}</td><td>${op.stats.W}</td></tr></tbody>
            </table>
            ${abilitiesHtml}
            <div style="margin: 5px 0;">${weaponsHtml}${tipHtml}</div>
            ${equipSection}
            ${woundsArea}
            ${actionArea}
        </div>`;
}


export function openAddModal(teamData, addOpHandler, lang) {
    const list = document.getElementById('modal-op-list');
    list.innerHTML = '';

    if (!teamData || !teamData.operatives) {
        console.error("No team data or operatives to show in modal.");
        return; 
    }

    teamData.operatives.forEach((op, index) => {
        const cardEl = document.createElement('div');
        cardEl.innerHTML = renderOpCard(op, 'modal', index, lang);
        cardEl.querySelector('.add-op-to-roster').addEventListener('click', () => {
            addOpHandler(op);
            closeAddModal();
        });
        list.appendChild(cardEl);
    });
    document.getElementById('modal-overlay').style.display = 'flex';
}


export function closeAddModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

export function openInfoModal(team, lang) {
    if (!team) return;
    document.getElementById('info-faction-rules').innerHTML = (team.factionRules || []).map(r =>
        `<div class="ploy-card"><div class="ploy-header"><span class="ploy-name">${getText((r.title || r.name), lang)}</span></div><div class="ploy-desc">${getText(r.desc, lang)}</div></div>`
    ).join('');
    document.getElementById('info-strat-ploys').innerHTML = (team.ploys.strategy || []).map(p =>
        `<div class="ploy-card strat"><div class="ploy-header"><span class="ploy-name">${getText(p.name, lang)}</span><span class="ploy-cost">${p.cost}</span></div><div class="ploy-desc">${getText(p.desc, lang)}</div></div>`
    ).join('');
    document.getElementById('info-fire-ploys').innerHTML = (team.ploys.firefight || []).map(p =>
        `<div class="ploy-card fire"><div class="ploy-header"><span class="ploy-name">${getText(p.name, lang)}</span><span class="ploy-cost">${p.cost}</span></div><div class="ploy-desc">${getText(p.desc, lang)}</div></div>`
    ).join('');
    document.getElementById('info-modal-overlay').style.display = 'flex';
}

export function closeInfoModal() {
    document.getElementById('info-modal-overlay').style.display = 'none';
}

export function displayCoopPlaceholder(lang, savedRosters) {
    const container = document.getElementById('team-right');
    if (!container) return;

    container.innerHTML = `
        <div id="team-right-placeholder">
            <h3 style="margin:0;">${lang === 'ko' ? '두 번째 팀' : 'Second Team'}</h3>
            <p style="margin:0; font-size:0.9rem; color:#aaa;">${lang === 'ko' ? '저장된 로스터를 불러와주세요.' : 'Load a saved roster.'}</p>
            <select id="coop-roster-select" class="roster-select"></select>
            <button id="btn-activate-coop" class="btn btn-primary">${lang === 'ko' ? '🚀 활성화' : '🚀 Activate'}</button>
        </div>
    `;
    updateRosterSelectDropdown(savedRosters, null, lang, 'coop-roster-select');
}


export function renderGameEquipment(teamData, lang, containerId = 'team-left') {
    const container = document.getElementById(containerId).querySelector('.game-equipment-list');
    if (!container || !teamData) return;
    container.innerHTML = (teamData.equipments || []).map(e => `
        <div class="ploy-card">
            <div class="ploy-header"><span class="ploy-name">${getText(e.name, lang)}</span><span class="ploy-cost">${e.cost}</span></div>
            <div class="ploy-desc">${getText(e.desc, lang)}</div>
        </div>
    `).join('');
}

export function renderGameInfo(teamData, spendCPHandler, lang, containerId = 'team-left') {
    const container = document.getElementById(containerId);
    if (!container || !teamData) return;

    const teamTitleElement = container.querySelector('.team-title');
    if (teamTitleElement) {
        teamTitleElement.innerText = ui.getText(teamData.name, lang);
    }

    const fpBox = container.querySelector('.resource-box[data-type="fp"]');
    if (fpBox) {
        if (teamData.resourceConfig) {
            fpBox.style.display = 'flex';
            fpBox.style.borderColor = 'var(--primary-color)';
            fpBox.querySelector('.resource-label').innerText = getText(teamData.resourceConfig.name, lang);
            fpBox.querySelector('.resource-val').style.color = 'var(--primary-color)';
        } else {
            fpBox.style.display = 'none';
        }
    }

    const rList = container.querySelector('.game-faction-rules');
    if (rList) rList.innerHTML = (teamData.factionRules || []).map(r =>
        `<div class="ploy-card"><div class="ploy-header"><span class="ploy-name">${getText((r.title || r.name), lang)}</span></div><div class="ploy-desc">${getText(r.desc, lang)}</div></div>`
    ).join('');

    const sList = container.querySelector('.game-strat-ploys');
    if (sList) {
        sList.innerHTML = ''; // Clear previous
        (teamData.ploys.strategy || []).forEach(p => {
            const ployEl = document.createElement('div');
            ployEl.className = 'ploy-card strat';
            ployEl.innerHTML = `<div class="ploy-header"><span class="ploy-name">${getText(p.name, lang)}</span><span class="ploy-cost">${p.cost}</span></div><div class="ploy-desc">${getText(p.desc, lang)}</div>`;
            const button = document.createElement('button');
            button.className = 'btn-outline';
            button.style.cssText = 'margin-top:5px; width:100%; font-size:0.8rem;';
            button.innerText = lang === 'ko' ? '사용 (CP 소모)' : 'Use (Spend CP)';
            button.onclick = () => spendCPHandler(containerId);
            ployEl.appendChild(button);
            sList.appendChild(ployEl);
        });
    }

    const fList = container.querySelector('.game-fire-ploys');
    if (fList) {
        fList.innerHTML = ''; // Clear previous
        (teamData.ploys.firefight || []).forEach(p => {
            const ployEl = document.createElement('div');
            ployEl.className = 'ploy-card fire';
            ployEl.innerHTML = `<div class="ploy-header"><span class="ploy-name">${getText(p.name, lang)}</span><span class="ploy-cost">${p.cost}</span></div><div class="ploy-desc">${getText(p.desc, lang)}</div>`;
            const button = document.createElement('button');
            button.className = 'btn-outline';
            button.style.cssText = 'margin-top:5px; width:100%; font-size:0.8rem;';
            button.innerText = lang === 'ko' ? '사용 (CP 소모)' : 'Use (Spend CP)';
            button.onclick = () => spendCPHandler(containerId);
            ployEl.appendChild(button);
            fList.appendChild(ployEl);
        });
    }
}


export function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${name}`);
    if (target) target.classList.add('active');
}

export function updateResourceDisplay(globalState) {
    if (globalState) document.getElementById('tp-val').innerText = globalState.currentTP;
}

export function updateTeamResourceDisplay(teamState, containerId) {
    if (!teamState) return;
    const container = document.getElementById(containerId);
    if (!container) return;

    const vpElement = container.querySelector('.resource-val[data-type="vp"]');
    if (vpElement) vpElement.innerText = teamState.vp;
    
    const cpElement = container.querySelector('.resource-val[data-type="cp"]');
    if (cpElement) cpElement.innerText = teamState.cp;
    
    const fpElement = container.querySelector('.resource-val[data-type="fp"]');
    if (fpElement) fpElement.innerText = teamState.fp;
}


export function renderGameScreen(gameState, lang, containerId = 'team-left') {
    const container = document.getElementById(containerId).querySelector('.game-op-list');
    if (!container) return;
    
    container.innerHTML = '';
    if (!gameState || !gameState.operatives) return;

    gameState.operatives.forEach((op, idx) => {
        container.innerHTML += renderOpCard(op, 'game', idx, lang);
    });
}


export function populateTeamSelect(availableKillTeams, lang) {
    const select = document.getElementById('team-select');
    if (!select) return;
    select.innerHTML = '';
    availableKillTeams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.id;
        option.text = getText(team.name, lang);
        select.appendChild(option);
    });
}

export function renderSearchResults(results, lang) {
    const container = document.getElementById('rule-search-results');
    if (!container) return;

    container.innerHTML = ''; 

    if (results.length === 0) {
        return;
    }

    results.forEach(rule => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        
        const borderColor = rule.teamColor || 'var(--primary-color)';
        item.style.borderLeftColor = borderColor;

        const typeText = getText(rule.type, lang);

        item.innerHTML = `
            <div class="search-result-header">
                <div class="key">${getText(rule.key, lang)}</div>
                <span class="search-result-type" style="background-color: ${borderColor}">${typeText}</span>
            </div>
            <div class="desc">${getText(rule.desc, lang)}</div>
        `;
        container.appendChild(item);
    });
}