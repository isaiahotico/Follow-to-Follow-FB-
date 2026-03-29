
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

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

// --- State Variables ---
let userID = localStorage.getItem('fb_user_id');
let userData = {};
let timerInterval;
let timeLeft = 30;
let taskStartTime = 0;
let currentTaskLink = '';

// --- Initialization ---
async function init() {
    if (!userID) {
        userID = 'U' + Math.floor(Math.random() * 900000 + 100000);
        localStorage.setItem('fb_user_id', userID);
        
        // Referral check
        const urlParams = new URLSearchParams(window.location.search);
        const refBy = urlParams.get('ref') || 'system';

        await set(ref(db, 'users/' + userID), {
            id: userID,
            balance: 0,
            referrals: 0,
            refEarnings: 0,
            referredBy: refBy,
            links: []
        });

        if(refBy !== 'system') {
            const refSnap = await get(ref(db, 'users/' + refBy));
            if(refSnap.exists()) {
                update(ref(db, 'users/' + refBy), {
                    referrals: (refSnap.val().referrals || 0) + 1
                });
            }
        }
    }

    // Listen for real-time user data
    onValue(ref(db, 'users/' + userID), (snapshot) => {
        userData = snapshot.val();
        updateUI();
    });

    generateColors();
    updateTime();
    setupChat();
    setInterval(updateTime, 1000);
}

// --- UI Logic ---
function updateUI() {
    document.getElementById('display-id').innerText = userID;
    document.getElementById('stat-balance').innerText = (userData.balance || 0).toFixed(5) + ' USDT';
    document.getElementById('user-balance-top').innerText = (userData.balance || 0).toFixed(5) + ' USDT';
    document.getElementById('stat-refs').innerText = userData.referrals || 0;
    document.getElementById('ref-link').innerText = `https://isaiahotico.github.io/Follow-to-Follow-FB-/?ref=${userID}`;

    // Update Profile Links
    const list = document.getElementById('user-links-list');
    list.innerHTML = '';
    if(userData.links) {
        userData.links.forEach(l => {
            list.innerHTML += `
                <div class="bg-slate-800 p-3 rounded border-l-4 border-blue-500 flex justify-between">
                    <span class="truncate w-1/2">${l.url}</span>
                    <span class="text-blue-400 font-bold">${l.hits} left</span>
                </div>`;
        });
    }
}

window.showSection = (id) => {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden-section'));
    document.getElementById(id).classList.remove('hidden-section');
};

// --- Link Registration ---
window.registerLink = async () => {
    const url = document.getElementById('fb-link-input').value;
    if(!url.includes('facebook.com')) return alert('Invalid Facebook Link');

    const linkCount = (userData.links || []).length;
    let cost = 0;
    
    if(linkCount >= 1) {
        cost = 0.02;
        if(userData.balance < cost) return alert('Insufficient Balance. Need 0.02 USDT');
    }

    const newLink = { url: url, hits: 100 };
    const updatedLinks = [...(userData.links || []), newLink];

    await update(ref(db, 'users/' + userID), {
        balance: (userData.balance || 0) - cost,
        links: updatedLinks
    });

    // Add to global pool for tasks
    push(ref(db, 'global_tasks'), {
        url: url,
        owner: userID
    });

    document.getElementById('fb-link-input').value = '';
    alert('Link Registered Successfully!');
};

// --- Task System ---
window.startTask = async () => {
    const snapshot = await get(ref(db, 'global_tasks'));
    if(!snapshot.exists()) return alert('No tasks available right now!');
    
    const tasks = Object.values(snapshot.val());
    const randomTask = tasks[Math.floor(Math.random() * tasks.length)];
    
    currentTaskLink = randomTask.url;
    window.open(currentTaskLink, '_blank');
    
    // Show Timer Overlay
    document.getElementById('timer-overlay').style.display = 'flex';
    document.getElementById('timer-msg').classList.add('hidden');
    
    timeLeft = 30;
    taskStartTime = Date.now();
    
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer-display').innerText = timeLeft;
        document.getElementById('timer-bar').style.width = (timeLeft/30*100) + '%';
        
        if(timeLeft <= 0) {
            finishTask();
        }
    }, 1000);
};

async function finishTask() {
    clearInterval(timerInterval);
    document.getElementById('timer-overlay').style.display = 'none';
    
    const elapsed = (Date.now() - taskStartTime) / 1000;
    
    if(elapsed < 30) {
        document.getElementById('timer-overlay').style.display = 'flex';
        document.getElementById('timer-msg').classList.remove('hidden');
        timeLeft = 30; // Reset
        return;
    }

    const reward = 0.00015;
    const refBonus = reward * 0.20;

    // Reward User
    await update(ref(db, 'users/' + userID), {
        balance: (userData.balance || 0) + reward
    });

    // Reward Sponsor
    if(userData.referredBy && userData.referredBy !== 'system') {
        const sponsorSnap = await get(ref(db, 'users/' + userData.referredBy));
        if(sponsorSnap.exists()) {
            update(ref(db, 'users/' + userData.referredBy), {
                balance: (sponsorSnap.val().balance || 0) + refBonus,
                refEarnings: (sponsorSnap.val().refEarnings || 0) + refBonus
            });
        }
    }

    alert('Task Completed! 0.00015 USDT added.');
}

// --- Deposit Logic ---
window.submitDeposit = () => {
    const amt = document.getElementById('dep-amount').value;
    const refNum = document.getElementById('dep-ref').value;
    const method = document.getElementById('dep-method').value;

    if(amt < 1) return alert('Minimum deposit 1 USDT');

    push(ref(db, 'deposits'), {
        userId: userID,
        amount: parseFloat(amt),
        ref: refNum,
        method: method,
        status: 'pending',
        date: new Date().toLocaleString()
    });

    alert('Request Submitted! Wait for admin approval.');
};

// --- Admin Logic ---
window.checkAdmin = () => {
    const pass = document.getElementById('admin-pass').value;
    if(pass === 'Propetas12') {
        showSection('admin-panel');
        loadAdminDeposits();
    } else {
        alert('Wrong Password');
    }
};

function loadAdminDeposits() {
    onValue(ref(db, 'deposits'), (snap) => {
        const div = document.getElementById('admin-deposit-list');
        div.innerHTML = '';
        snap.forEach(child => {
            const dep = child.val();
            if(dep.status === 'pending') {
                div.innerHTML += `
                    <div class="bg-slate-800 p-4 rounded border border-red-500">
                        <p>User: ${dep.userId} | Amt: ${dep.amount} USDT</p>
                        <p>Ref: ${dep.ref} (${dep.method})</p>
                        <button onclick="approveDep('${child.key}', '${dep.userId}', ${dep.amount})" class="bg-green-600 px-4 py-1 rounded mt-2">Approve</button>
                    </div>`;
            }
        });
    });
}

window.approveDep = async (key, uId, amount) => {
    const uSnap = await get(ref(db, 'users/' + uId));
    if(uSnap.exists()) {
        await update(ref(db, 'users/' + uId), {
            balance: (uSnap.val().balance || 0) + amount
        });
        await update(ref(db, 'deposits/' + key), { status: 'approved' });
        alert('Approved!');
    }
};

// --- Chat Logic ---
function setupChat() {
    onValue(ref(db, 'chat'), (snap) => {
        const box = document.getElementById('chat-box');
        box.innerHTML = '';
        snap.forEach(c => {
            const msg = c.val();
            box.innerHTML += `<div class="bg-slate-700 p-2 rounded">
                <span class="text-blue-400 text-xs font-bold">${msg.user}:</span> 
                <span class="text-sm">${msg.text}</span>
            </div>`;
        });
        box.scrollTop = box.scrollHeight;
    });
}

window.sendMessage = () => {
    const text = document.getElementById('chat-input').value;
    if(!text) return;
    push(ref(db, 'chat'), { user: userID, text: text });
    document.getElementById('chat-input').value = '';
};

// --- Theme / Utils ---
function generateColors() {
    const palette = document.getElementById('color-palette');
    for(let i=0; i<100; i++) {
        const color = `hsl(${i * 3.6}, 70%, 20%)`;
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.backgroundColor = color;
        dot.onclick = () => document.getElementById('main-body').style.backgroundColor = color;
        palette.appendChild(dot);
    }
}

function updateTime() {
    const now = new Date();
    document.getElementById('footer-time').innerText = now.toLocaleString();
    document.getElementById('year').innerText = now.getFullYear();
}

// Start app
init();
