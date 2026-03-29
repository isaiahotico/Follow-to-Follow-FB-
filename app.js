
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

// --- App State ---
let userID = localStorage.getItem('fb_user_id');
let userData = {};
let timerInterval;
let timeLeft = 30;
let currentTaskKey = ''; // Global task ID
let currentTaskData = null;

// --- Initialization ---
async function init() {
    if (!userID) {
        userID = 'U' + Math.floor(100000 + Math.random() * 900000);
        localStorage.setItem('fb_user_id', userID);
        
        const urlParams = new URLSearchParams(window.location.search);
        const refBy = urlParams.get('ref') || 'system';

        await set(ref(db, 'users/' + userID), {
            id: userID, balance: 0, referrals: 0, refEarnings: 0, 
            referredBy: refBy, links: [], completed_tasks: {}
        });

        if(refBy !== 'system') {
            const rSnap = await get(ref(db, 'users/' + refBy));
            if(rSnap.exists()) {
                update(ref(db, 'users/' + refBy), { referrals: (rSnap.val().referrals || 0) + 1 });
            }
        }
    }

    onValue(ref(db, 'users/' + userID), (snap) => {
        userData = snap.val() || {};
        updateUI();
    });

    generate450Colors();
    updateTime();
    setupChat();
    setInterval(updateTime, 1000);
}

function updateUI() {
    document.getElementById('display-id-top').innerText = 'ID: ' + userID;
    document.getElementById('stat-balance').innerText = (userData.balance || 0).toFixed(5) + ' USDT';
    document.getElementById('user-balance-top').innerText = (userData.balance || 0).toFixed(5) + ' USDT';
    document.getElementById('stat-refs').innerText = userData.referrals || 0;
    document.getElementById('stat-ref-earn').innerText = (userData.refEarnings || 0).toFixed(5);
    document.getElementById('ref-link').innerText = `https://isaiahotico.github.io/Follow-to-Follow-FB-/?ref=${userID}`;

    const list = document.getElementById('user-links-list');
    list.innerHTML = '';
    if(userData.links) {
        Object.keys(userData.links).forEach(key => {
            const l = userData.links[key];
            list.innerHTML += `
                <div class="bg-slate-800 p-4 rounded-xl border-l-4 border-blue-500 flex justify-between items-center shadow-lg">
                    <div class="truncate w-2/3">
                        <p class="text-[10px] text-slate-500 font-bold uppercase">Target Link</p>
                        <p class="text-xs text-blue-300 truncate">${l.url}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-slate-500 font-bold">REMAINING</p>
                        <p class="text-xl font-black text-white">${l.hits} <span class="text-[10px] text-slate-400">Hits</span></p>
                    </div>
                </div>`;
        });
    }
}

// --- Task Engine (Improved) ---
window.startTask = async () => {
    const tasksSnap = await get(ref(db, 'global_tasks'));
    if(!tasksSnap.exists()) return alert('No tasks available!');

    const allTasks = tasksSnap.val();
    const completed = userData.completed_tasks || {};
    
    // Filter: 1. Not own link, 2. Not already completed, 3. Has hits remaining
    const availableKeys = Object.keys(allTasks).filter(key => {
        return allTasks[key].owner !== userID && !completed[key] && allTasks[key].hits > 0;
    });

    if(availableKeys.length === 0) return alert('No new tasks for you! Check back later.');

    currentTaskKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    currentTaskData = allTasks[currentTaskKey];

    window.open(currentTaskData.url, '_blank');
    
    // UI Reset
    document.getElementById('timer-overlay').style.display = 'flex';
    document.getElementById('timer-msg').classList.add('hidden');
    timeLeft = 30;
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer-display').innerText = timeLeft;
        const offset = 377 - (377 * (30 - timeLeft) / 30);
        document.getElementById('timer-circle').style.strokeDashoffset = offset;

        if(timeLeft <= 0) {
            clearInterval(timerInterval);
            finishTask();
        }
    }, 1000);
};

async function finishTask() {
    // Play Success Sound
    document.getElementById('success-sound').play();
    document.getElementById('timer-overlay').style.display = 'none';

    const reward = 0.00015;
    const refBonus = reward * 0.20;

    // 1. Credit User Reward
    const newBalance = (userData.balance || 0) + reward;
    
    // 2. Mark task as completed for this user (Unique)
    const updates = {};
    updates[`users/${userID}/balance`] = newBalance;
    updates[`users/${userID}/completed_tasks/${currentTaskKey}`] = true;

    // 3. Reduce hits from Global Task
    const newHits = currentTaskData.hits - 1;
    if(newHits <= 0) {
        updates[`global_tasks/${currentTaskKey}`] = null; // Remove if done
    } else {
        updates[`global_tasks/${currentTaskKey}/hits`] = newHits;
    }

    // 4. Update the owner's link hit counter in their profile
    const ownerLinkRef = `users/${currentTaskData.owner}/links/${currentTaskData.linkRefKey}/hits`;
    const ownerSnap = await get(ref(db, ownerLinkRef));
    if(ownerSnap.exists()) {
        updates[ownerLinkRef] = ownerSnap.val() - 1;
    }

    // 5. Referral Bonus
    if(userData.referredBy && userData.referredBy !== 'system') {
        const sponsorSnap = await get(ref(db, 'users/' + userData.referredBy));
        if(sponsorSnap.exists()) {
            updates[`users/${userData.referredBy}/balance`] = (sponsorSnap.val().balance || 0) + refBonus;
            updates[`users/${userData.referredBy}/refEarnings`] = (sponsorSnap.val().refEarnings || 0) + refBonus;
        }
    }

    await update(ref(db), updates);
    alert('Task Success! 0.00015 USDT Earned.');
}

// --- Registration logic ---
window.registerLink = async () => {
    const url = document.getElementById('fb-link-input').value;
    if(!url.includes('facebook.com')) return alert('Valid FB link required');

    const linkCount = userData.links ? Object.keys(userData.links).length : 0;
    let cost = (linkCount >= 1) ? 0.02 : 0;

    if(userData.balance < cost) return alert('Insufficient Balance (Need 0.02 USDT)');

    // Generate unique key for the user link
    const linkRef = push(ref(db, `users/${userID}/links`));
    const linkData = { url: url, hits: 100, owner: userID, linkRefKey: linkRef.key };

    const updates = {};
    updates[`users/${userID}/links/${linkRef.key}`] = linkData;
    updates[`users/${userID}/balance`] = (userData.balance || 0) - cost;
    
    // Add to Global Tasks
    const globalRef = push(ref(db, 'global_tasks'));
    updates[`global_tasks/${globalRef.key}`] = linkData;

    await update(ref(db), updates);
    document.getElementById('fb-link-input').value = '';
    alert('Link Registered with 100 Pieces!');
};

// --- Color Palette (450+ Colors) ---
window.toggleColors = () => {
    const cont = document.getElementById('color-palette-container');
    const btn = document.getElementById('color-btn');
    cont.classList.toggle('hidden');
    btn.innerText = cont.classList.contains('hidden') ? 'Show Palette' : 'Hide Palette';
};

function generate450Colors() {
    const palette = document.getElementById('color-palette');
    for(let i=0; i<450; i++) {
        // Generate a wide range of colors using HSL
        const h = i * 0.8; 
        const s = 40 + (i % 60);
        const l = 10 + (i % 30);
        const color = `hsl(${h}, ${s}%, ${l}%)`;
        
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.backgroundColor = color;
        dot.onclick = () => {
            document.getElementById('main-body').style.backgroundColor = color;
        };
        palette.appendChild(dot);
    }
}

// --- Common Systems (Chat, Admin, Deposit, etc) ---
window.showSection = (id) => {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden-section'));
    document.getElementById(id).classList.remove('hidden-section');
};

window.sendMessage = () => {
    const text = document.getElementById('chat-input').value;
    if(!text) return;
    push(ref(db, 'chat'), { user: userID, text: text, time: Date.now() });
    document.getElementById('chat-input').value = '';
};

function setupChat() {
    onValue(ref(db, 'chat'), (snap) => {
        const box = document.getElementById('chat-box');
        box.innerHTML = '';
        const data = snap.val();
        if(data) {
            Object.values(data).slice(-30).forEach(m => {
                box.innerHTML += `<div class="bg-slate-700/50 p-2 rounded-lg border border-white/5">
                    <span class="text-blue-400 font-bold text-[10px] block">${m.user}</span>
                    <span class="text-sm">${m.text}</span>
                </div>`;
            });
        }
        box.scrollTop = box.scrollHeight;
    });
}

window.submitDeposit = () => {
    const amt = document.getElementById('dep-amount').value;
    const refNum = document.getElementById('dep-ref').value;
    const method = document.getElementById('dep-method').value;
    if(amt < 1) return alert('Min 1 USDT');
    push(ref(db, 'deposits'), { userId: userID, amount: parseFloat(amt), ref: refNum, method: method, status: 'pending' });
    alert('Deposit Request Sent!');
};

window.checkAdmin = () => {
    if(document.getElementById('admin-pass').value === 'Propetas12') {
        showSection('admin-panel');
        loadAdmin();
    } else alert('Access Denied');
};

function loadAdmin() {
    onValue(ref(db, 'deposits'), (snap) => {
        const list = document.getElementById('admin-deposit-list');
        list.innerHTML = '';
        snap.forEach(d => {
            const dep = d.val();
            if(dep.status === 'pending') {
                list.innerHTML += `<div class="bg-slate-800 p-4 rounded-xl border border-red-500">
                    <p>User: ${dep.userId} | Amt: ${dep.amount} USDT</p>
                    <p class="text-xs text-slate-400">Ref: ${dep.ref}</p>
                    <button onclick="approve('${d.key}', '${dep.userId}', ${dep.amount})" class="bg-green-600 px-4 py-1 rounded-lg mt-2 font-bold">APPROVE</button>
                </div>`;
            }
        });
    });
}

window.approve = async (key, uId, amt) => {
    const uSnap = await get(ref(db, 'users/' + uId));
    if(uSnap.exists()) {
        await update(ref(db, 'users/' + uId), { balance: (uSnap.val().balance || 0) + amt });
        await update(ref(db, 'deposits/' + key), { status: 'approved' });
        alert('Approved!');
    }
};

function updateTime() {
    const now = new Date();
    document.getElementById('footer-time').innerText = now.toLocaleString();
    document.getElementById('year').innerText = now.getFullYear();
}

function updateTimeOnce() {
    document.getElementById('year').innerText = new Date().getFullYear();
}

init();
