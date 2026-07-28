let selectedBots = new Set();

// fetch list of bots and render table
async function refreshBots() {
    const auth = document.getElementById('auth-input').value; // your password input field
    if (!auth) return;

    const res = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth })
    });

    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('bot-table-body');
    tbody.innerHTML = '';

    data.bots.forEach(bot => {
        const isChecked = selectedBots.has(bot.username);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <input type="checkbox" value="${bot.username}" ${isChecked ? 'checked' : ''} onchange="toggleBot('${bot.username}', this.checked)">
            </td>
            <td>${bot.username}</td>
            <td>${bot.time}</td>
        `;
        tbody.appendChild(tr);
    });
}

function toggleBot(username, isChecked) {
    if (isChecked) {
        selectedBots.add(username);
    } else {
        selectedBots.delete(username);
    }
}

function selectAllBots(checkAll) {
    const checkboxes = document.querySelectorAll('#bot-table-body input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = checkAll;
        toggleBot(cb.value, checkAll);
    });
}

// send chat/raid command to selected bots (or all if none checked)
async function sendAction(actionType, payloadData) {
    const auth = document.getElementById('auth-input').value;
    const targets = selectedBots.size > 0 ? Array.from(selectedBots) : null;

    await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            auth,
            action: actionType,
            payload: payloadData,
            targets: targets
        })
    });
}

// auto refresh every 2s
setInterval(refreshBots, 2000);
