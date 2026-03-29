
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, push, update, remove } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBwpa8mA83JAv2A2Dj0rh5VHwodyv5N3dg",
    authDomain: "freegcash-ads.firebaseapp.com",
    databaseURL: "https://freegcash-ads-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "freegcash-ads",
    storageBucket: "freegcash-ads.firebasestorage.app",
    messagingSenderId: "608086825364",
    appId: "1:608086825364:web:3a8e628d231b52c6171781",
    measurementId: "G-Z64B87ELGP"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let userID = localStorage.getItem('fb_user_id');
let userData = {};
let timerInterval;
let timeLeft = 30;
let currentTaskKey = '';
let currentTaskData = null;

// --- Initialize ---
async function init() {
    if (!userID) {
        userID = 'U' + Math.floor(100000 + Math.random() * 900000);
        localStorage.setItem('fb_user_id', userID);
        const urlParams = new URLSearchParams(window.location.search);
        const refBy = urlParams.get('ref') || 'system';
        await set(ref(db, 'users/' + userID), {
            id: userID, balance: 0, referrals: 0, refEarnings: 0, 
            referredBy: refBy, links: {}, completed_tasks: {}
        });
        if(refBy !== 'system') {
            const rSnap = await get(ref(db, 'users/' + refBy));
            if(rSnap.exists()) update(ref(db, 'users/' + refBy), { referrals: (rSnap.val().referrals || 0) + 1 });
        }
    }
    onValue(ref(db, 'users/' + userID), (snap) => {
        userData = snap.val() || {};
        updateUI();
    });
    generateColors(550);
    setupChat();
    setInterval(updateTime, 1000);
    loadBanners();
    setInterval(loadBanners, 30000); // Auto reload banners every 30s
}

function updateUI() {
    document.getElementById('display-id-top').innerText = 'ID: ' + userID;
    const bal = (userData.balance || 0).toFixed(5);
    document.getElementById('stat-balance').innerText = bal;
    document.getElementById('user-balance-top').innerText = bal;
    document.getElementById('stat-refs').innerText = userData.referrals || 0;
    document.getElementById('stat-ref-earn').innerText = (userData.refEarnings || 0).toFixed(4);
    document.getElementById('ref-link').innerText = `https://isaiahotico.github.io/Follow-to-Follow-FB-/?ref=${userID}`;

    const list = document.getElementById('user-links-list');
    list.innerHTML = '';
    if(userData.links) {
        Object.keys(userData.links).forEach(k => {
            const l = userData.links[k];
            list.innerHTML += `<div class="bg-slate-800 p-3 rounded-xl border-l-4 border-blue-600 flex justify-between items-center text-xs">
                <span class="truncate w-32">${l.url}</span>
                <span class="font-bold text-blue-400">${l.hits} Left</span>
            </div>`;
        });
    }
}

// --- Task System ---
window.startTask = async () => {
    const tasksSnap = await get(ref(db, 'global_tasks'));
    if(!tasksSnap.exists()) return alert('No tasks!');
    const all = tasksSnap.val();
    const completed = userData.completed_tasks || {};
    const valid = Object.keys(all).filter(k => all[k].owner !== userID && !completed[k]);

    if(valid.length === 0) return alert('No tasks left for you!');
    currentTaskKey = valid[Math.floor(Math.random() * valid.length)];
    currentTaskData = all[currentTaskKey];

    window.open(currentTaskData.url, '_blank');
    document.getElementById('timer-overlay').style.display = 'flex';
    document.getElementById('timer-msg').classList.add('hidden');
    
    timeLeft = 30;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer-display').innerText = timeLeft;
        if(timeLeft <= 0) {
            clearInterval(timerInterval);
            finishTask();
        }
    }, 1000);
};

async function finishTask() {
    document.getElementById('success-sound').play();
    document.getElementById('timer-overlay').style.display = 'none';
    
    const updates = {};
    updates[`users/${userID}/balance`] = (userData.balance || 0) + 0.00015;
    updates[`users/${userID}/completed_tasks/${currentTaskKey}`] = true;

    // Reduce hits
    const newHits = currentTaskData.hits - 1;
    if(newHits <= 0) {
        updates[`global_tasks/${currentTaskKey}`] = null;
    } else {
        updates[`global_tasks/${currentTaskKey}/hits`] = newHits;
        updates[`users/${currentTaskData.owner}/links/${currentTaskData.linkRefKey}/hits`] = newHits;
    }

    // Referral 20%
    if(userData.referredBy && userData.referredBy !== 'system') {
        const sponsorSnap = await get(ref(db, 'users/' + userData.referredBy));
        if(sponsorSnap.exists()) {
            updates[`users/${userData.referredBy}/balance`] = (sponsorSnap.val().balance || 0) + (0.00015 * 0.2);
            updates[`users/${userData.referredBy}/refEarnings`] = (sponsorSnap.val().refEarnings || 0) + (0.00015 * 0.2);
        }
    }
    await update(ref(db), updates);
    alert('Task Finished!');
}

// --- Register Links ---
window.registerLink = async () => {
    const url = document.getElementById('fb-link-input').value;
    if(!url.includes('facebook.com')) return alert('Must be FB Link');
    const count = userData.links ? Object.keys(userData.links).length : 0;
    const cost = count >= 1 ? 0.02 : 0;
    if(userData.balance < cost) return alert('Insufficent Balance');

    const linkRef = push(ref(db, `users/${userID}/links`));
    const data = { url, hits: 100, owner: userID, linkRefKey: linkRef.key };
    const updates = {};
    updates[`users/${userID}/links/${linkRef.key}`] = data;
    updates[`users/${userID}/balance`] = (userData.balance || 0) - cost;
    const globalRef = push(ref(db, 'global_tasks'));
    updates[`global_tasks/${globalRef.key}`] = data;
    await update(ref(db), updates);
    alert('Link Registered!');
};

// --- Admin Section ---
window.checkAdmin = () => {
    if(document.getElementById('admin-pass').value === 'Propetas12') {
        showSection('admin-panel');
        loadAdmin();
    } else alert('Wrong Password');
};

function loadAdmin() {
    // Manage Deposits
    onValue(ref(db, 'deposits'), (snap) => {
        const list = document.getElementById('admin-deposit-list');
        list.innerHTML = '';
        snap.forEach(d => {
            if(d.val().status === 'pending') {
                list.innerHTML += `<div class="bg-slate-800 p-3 rounded-lg text-xs flex justify-between items-center">
                    <div>${d.val().userId} - ${d.val().amount} USDT<br><span class="text-slate-500">${d.val().ref}</span></div>
                    <div class="flex gap-2">
                        <button onclick="approveDep('${d.key}', '${d.val().userId}', ${d.val().amount})" class="bg-green-600 px-3 py-1 rounded">Approve</button>
                        <button onclick="denyDep('${d.key}')" class="bg-red-600 px-3 py-1 rounded">Deny</button>
                    </div>
                </div>`;
            }
        });
    });

    // Manage Links
    onValue(ref(db, 'global_tasks'), (snap) => {
        const list = document.getElementById('admin-links-list');
        list.innerHTML = '';
        snap.forEach(l => {
            list.innerHTML += `<div class="bg-slate-800 p-2 rounded-lg text-[10px] flex justify-between items-center">
                <span class="truncate w-40">${l.val().url}</span>
                <button onclick="deleteLink('${l.key}')" class="text-red-500 font-bold px-2">DELETE</button>
            </div>`;
        });
    });
}

window.approveDep = async (key, uId, amt) => {
    const uSnap = await get(ref(db, 'users/' + uId));
    if(uSnap.exists()) {
        await update(ref(db, 'users/' + uId), { balance: (uSnap.val().balance || 0) + amt });
        await update(ref(db, 'deposits/' + key), { status: 'approved' });
        alert('Approved!');
    }
};

window.denyDep = async (key) => {
    if(confirm('Deny this deposit?')) {
        await update(ref(db, 'deposits/' + key), { status: 'denied' });
        alert('Denied');
    }
};

window.deleteLink = async (key) => {
    if(confirm('Delete this link from global tasks?')) {
        await remove(ref(db, 'global_tasks/' + key));
        alert('Deleted');
    }
};

// --- Banners ---
function loadBanners() {
    const area = document.getElementById('banners-area');
    area.innerHTML = '';
    for(let i=0; i<7; i++) {
        const card = document.createElement('div');
        card.className = 'banner-card';
        // Unique key per card to force re-render
        const key = 'fe70943384c0314737bd62c05e3d520a'; 
        card.innerHTML = `<iframe src="about:blank" style="width:160px;height:300px;border:none;"></iframe>`;
        // In a real scenario, you'd re-inject the script or a fresh iframe
        // Since it's a static script, clearing and re-appending is the way
        area.appendChild(card);
    }
    console.log('Banners Reloaded at ' + new Date().toLocaleTimeString());
}

// --- Utils ---
window.showSection = (id) => {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden-section'));
    document.getElementById(id).classList.remove('hidden-section');
};

function generateColors(num) {
    const pal = document.getElementById('color-palette');
    for(let i=0; i<num; i++) {
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        const color = `hsl(${i * (360/num)}, 60%, 20%)`;
        dot.style.backgroundColor = color;
        dot.onclick = () => document.getElementById('main-body').style.backgroundColor = color;
        pal.appendChild(dot);
    }
}

window.toggleColors = () => document.getElementById('color-palette-container').classList.toggle('hidden');

function updateTime() {
    document.getElementById('footer-time').innerText = new Date().toLocaleString() + ' | FB-BOOST-APP';
}

function setupChat() {
    onValue(ref(db, 'chat'), (snap) => {
        const box = document.getElementById('chat-box');
        box.innerHTML = '';
        if(snap.exists()){
            Object.values(snap.val()).slice(-20).forEach(m => {
                box.innerHTML += `<div><b class="text-blue-400">${m.user.slice(0,5)}:</b> ${m.text}</div>`;
            });
        }
        box.scrollTop = box.scrollHeight;
    });
}

window.sendMessage = () => {
    const text = document.getElementById('chat-input').value;
    if(text) {
        push(ref(db, 'chat'), { user: userID, text });
        document.getElementById('chat-input').value = '';
    }
};

window.submitDeposit = () => {
    const amt = parseFloat(document.getElementById('dep-amount').value);
    const refNum = document.getElementById('dep-ref').value;
    const method = document.getElementById('dep-method').value;
    if(amt < 1) return alert('Min 1 USDT');
    push(ref(db, 'deposits'), { userId: userID, amount: amt, ref: refNum, method, status: 'pending' });
    alert('Submitted!');
};

init();
