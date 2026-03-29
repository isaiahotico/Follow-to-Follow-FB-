
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

    generateColorPalettes();
    setupChat();
    setInterval(updateTime, 1000);
    loadBanners();
    setInterval(loadBanners, 30000); // 30s reload
}

function updateUI() {
    document.getElementById('display-id-top').innerText = 'UID: ' + userID;
    const b = (userData.balance || 0).toFixed(5);
    document.getElementById('stat-balance').innerText = b;
    document.getElementById('user-balance-top').innerText = b;
    document.getElementById('stat-refs').innerText = userData.referrals || 0;
    document.getElementById('stat-ref-earn').innerText = (userData.refEarnings || 0).toFixed(4);
    document.getElementById('ref-link').innerText = `https://isaiahotico.github.io/Follow-to-Follow-FB-/?ref=${userID}`;

    const list = document.getElementById('user-links-list');
    list.innerHTML = '';
    if(userData.links) {
        Object.keys(userData.links).forEach(k => {
            const l = userData.links[k];
            list.innerHTML += `<div class="glass p-4 rounded-2xl flex justify-between items-center text-xs">
                <div class="truncate w-1/2">
                    <p class="text-[8px] text-slate-500 font-bold uppercase">URL</p>
                    <p class="truncate text-blue-400 font-bold">${l.url}</p>
                </div>
                <div class="text-right">
                    <p class="text-[8px] text-slate-500 font-bold uppercase">HITS REMAINING</p>
                    <p class="text-lg font-black text-white">${l.hits}</p>
                </div>
            </div>`;
        });
    }
}

// --- Task System ---
window.startTask = async () => {
    const tasksSnap = await get(ref(db, 'global_tasks'));
    if(!tasksSnap.exists()) return alert('No tasks available!');
    const all = tasksSnap.val();
    const completed = userData.completed_tasks || {};
    const valid = Object.keys(all).filter(k => all[k].owner !== userID && !completed[k]);

    if(valid.length === 0) return alert('Tasks exhausted! Invite friends to add more links.');
    
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

    const newHits = currentTaskData.hits - 1;
    if(newHits <= 0) {
        updates[`global_tasks/${currentTaskKey}`] = null;
    } else {
        updates[`global_tasks/${currentTaskKey}/hits`] = newHits;
        updates[`users/${currentTaskData.owner}/links/${currentTaskData.linkRefKey}/hits`] = newHits;
    }

    if(userData.referredBy && userData.referredBy !== 'system') {
        const sponsorSnap = await get(ref(db, 'users/' + userData.referredBy));
        if(sponsorSnap.exists()) {
            updates[`users/${userData.referredBy}/balance`] = (sponsorSnap.val().balance || 0) + (0.00015 * 0.2);
            updates[`users/${userData.referredBy}/refEarnings`] = (sponsorSnap.val().refEarnings || 0) + (0.00015 * 0.2);
        }
    }
    await update(ref(db), updates);
    alert('SUCCESS: 0.00015 USDT Credited!');
}

window.registerLink = async () => {
    const url = document.getElementById('fb-link-input').value;
    if(!url.includes('facebook.com')) return alert('Please enter a valid Facebook link');
    
    const count = userData.links ? Object.keys(userData.links).length : 0;
    const cost = count >= 1 ? 0.02 : 0;
    if(userData.balance < cost) return alert('Balance too low. Minimum 0.02 USDT required.');

    const linkRef = push(ref(db, `users/${userID}/links`));
    const data = { url, hits: 100, owner: userID, linkRefKey: linkRef.key };
    const updates = {};
    updates[`users/${userID}/links/${linkRef.key}`] = data;
    updates[`users/${userID}/balance`] = (userData.balance || 0) - cost;
    const globalRef = push(ref(db, 'global_tasks'));
    updates[`global_tasks/${globalRef.key}`] = data;
    await update(ref(db), updates);
    document.getElementById('fb-link-input').value = '';
    alert('Boost Campaign Activated!');
};

// --- Banner Ad Fixed Loader ---
function loadBanners() {
    const area = document.getElementById('banners-area');
    area.innerHTML = '';
    const adKey = 'fe70943384c0314737bd62c05e3d520a';
    
    for(let i=0; i<4; i++) { // 4 Columns
        const slot = document.createElement('div');
        slot.className = 'ad-slot';
        const iframe = document.createElement('iframe');
        // Use srcdoc to safely inject script into iframe
        iframe.srcdoc = `
            <body style="margin:0;overflow:hidden;background:transparent;">
                <script type="text/javascript">
                    atOptions = { 'key' : '${adKey}', 'format' : 'iframe', 'height' : 300, 'width' : 160, 'params' : {} };
                </script>
                <script type="text/javascript" src="//www.highperformanceformat.com/${adKey}/invoke.js"></script>
            </body>
        `;
        slot.appendChild(iframe);
        area.appendChild(slot);
    }
}

// --- Color Palette Logic ---
function generateColorPalettes() {
    const pal = document.getElementById('color-palette');
    const specialPal = document.getElementById('special-palette');
    
    // Standard 500+ Spectrum
    for(let i=0; i<500; i++) {
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        const color = `hsl(${i * 0.72}, 50%, 15%)`;
        dot.style.backgroundColor = color;
        dot.onclick = () => document.getElementById('main-body').style.backgroundColor = color;
        pal.appendChild(dot);
    }

    // Yellow / Orange / Pink Families
    const specialRanges = [
        {h: 45, name: 'Yellow'}, {h: 25, name: 'Orange'}, {h: 320, name: 'Pink'},
        {h: 55, name: 'Gold'}, {h: 35, name: 'Sun'}, {h: 340, name: 'Rose'}
    ];
    specialRanges.forEach(range => {
        const dot = document.createElement('div');
        dot.className = 'color-dot w-8 h-8'; // Bigger for special ones
        const color = `hsl(${range.h}, 80%, 30%)`;
        dot.style.backgroundColor = color;
        dot.title = range.name;
        dot.onclick = () => document.getElementById('main-body').style.backgroundColor = color;
        specialPal.appendChild(dot);
    });
}

// --- Admin ---
window.checkAdmin = () => {
    if(document.getElementById('admin-pass').value === 'Propetas12') {
        showSection('admin-panel');
        loadAdmin();
    } else alert('Unauthorized Access');
};

function loadAdmin() {
    onValue(ref(db, 'deposits'), (snap) => {
        const list = document.getElementById('admin-deposit-list');
        list.innerHTML = '';
        snap.forEach(d => {
            if(d.val().status === 'pending') {
                list.innerHTML += `<div class="glass p-3 rounded-xl text-[10px] flex justify-between items-center">
                    <div>${d.val().userId}<br>${d.val().amount} USDT (${d.val().method})</div>
                    <div class="flex gap-1">
                        <button onclick="approveDep('${d.key}', '${d.val().userId}', ${d.val().amount})" class="bg-emerald-600 p-2 rounded">Approve</button>
                        <button onclick="denyDep('${d.key}')" class="bg-red-600 p-2 rounded">Deny</button>
                    </div>
                </div>`;
            }
        });
    });

    onValue(ref(db, 'global_tasks'), (snap) => {
        const list = document.getElementById('admin-links-list');
        list.innerHTML = '';
        snap.forEach(l => {
            list.innerHTML += `<div class="glass p-2 rounded-lg text-[9px] flex justify-between items-center">
                <span class="truncate w-32">${l.val().url}</span>
                <button onclick="deleteLink('${l.key}')" class="text-red-500 font-bold uppercase">Delete</button>
            </div>`;
        });
    });
}

window.approveDep = async (key, uId, amt) => {
    const uSnap = await get(ref(db, 'users/' + uId));
    if(uSnap.exists()) {
        await update(ref(db, 'users/' + uId), { balance: (uSnap.val().balance || 0) + amt });
        await update(ref(db, 'deposits/' + key), { status: 'approved' });
        alert('Deposit Authorized');
    }
};
window.denyDep = async (key) => { if(confirm('Deny?')) await update(ref(db, 'deposits/' + key), { status: 'denied' }); };
window.deleteLink = async (key) => { if(confirm('Remove link?')) await remove(ref(db, 'global_tasks/' + key)); };

// --- Misc ---
window.showSection = (id) => {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden-section'));
    document.getElementById(id).classList.remove('hidden-section');
};
window.toggleColors = () => document.getElementById('color-palette-container').classList.toggle('hidden');
function updateTime() { document.getElementById('footer-time').innerText = new Date().toLocaleString(); }
function setupChat() {
    onValue(ref(db, 'chat'), (snap) => {
        const box = document.getElementById('chat-box'); box.innerHTML = '';
        if(snap.exists()){
            Object.values(snap.val()).slice(-30).forEach(m => {
                box.innerHTML += `<div><b class="text-blue-400 mr-2">${m.user.slice(0,5)}:</b>${m.text}</div>`;
            });
        }
        box.scrollTop = box.scrollHeight;
    });
}
window.sendMessage = () => {
    const text = document.getElementById('chat-input').value;
    if(text) { push(ref(db, 'chat'), { user: userID, text }); document.getElementById('chat-input').value = ''; }
};
window.submitDeposit = () => {
    const amt = parseFloat(document.getElementById('dep-amount').value);
    const refNum = document.getElementById('dep-ref').value;
    if(amt < 1) return alert('Min 1 USDT');
    push(ref(db, 'deposits'), { userId: userID, amount: amt, ref: refNum, method: document.getElementById('dep-method').value, status: 'pending' });
    alert('Request Sent to Admin!');
};

init();
