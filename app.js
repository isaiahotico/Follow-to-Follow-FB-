
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, get, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
const auth = getAuth(app);

let currentUser = null;
let userData = null;
let taskActive = false;
let timerValue = 30;
let timerInterval;

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        setupUser();
    } else {
        signInAnonymously(auth);
    }
});

async function setupUser() {
    const userRef = ref(db, 'users/' + currentUser.uid);
    const snapshot = await get(userRef);
    
    const urlParams = new URLSearchParams(window.location.search);
    const refId = urlParams.get('ref');

    if (!snapshot.exists()) {
        // Updated to Random ID (Numeric only)
        const randomID = Math.floor(10000000 + Math.random() * 90000000); 
        userData = {
            profileId: randomID,
            balance: 0,
            totalEarned: 0,
            linksCount: 0,
            referredBy: refId || null,
            bgColor: 'bg-slate-900',
            uid: currentUser.uid,
            refCount: 0,
            refEarnings: 0
        };
        await set(userRef, userData);
    } else {
        userData = snapshot.val();
    }

    document.getElementById('display-id').innerText = `ID: ${userData.profileId}`;
    document.getElementById('ref-link').value = `https://isaiahotico.github.io/Follow-to-Follow-FB-/?ref=${currentUser.uid}`;
    changeBg(userData.bgColor);
    
    startListeners();
}

function startListeners() {
    onValue(ref(db, 'users/' + currentUser.uid), (snap) => {
        const d = snap.val();
        document.getElementById('user-balance').innerText = `$${d.balance.toFixed(5)}`;
        document.getElementById('ref-count').innerText = `${d.refCount || 0} Invites`;
        document.getElementById('ref-earnings').innerText = `$${(d.refEarnings || 0).toFixed(4)} Total Earned`;
    });

    onValue(ref(db, 'chats'), (snap) => {
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML = '';
        snap.forEach((child) => {
            const m = child.val();
            chatBox.innerHTML += `<div><span class="text-blue-500 font-bold">${m.id}:</span> ${m.msg}</div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    onValue(ref(db, 'tasks'), (snap) => {
        const container = document.getElementById('links-container');
        container.innerHTML = '';
        snap.forEach((child) => {
            const t = child.val();
            if (t.owner === currentUser.uid) {
                container.innerHTML += `
                    <div class="bg-black/40 p-3 rounded-xl border border-white/5">
                        <div class="flex justify-between text-[10px] mb-1">
                            <span class="text-blue-400 font-bold uppercase truncate w-2/3">${t.desc || 'No Description'}</span>
                            <span class="text-green-400">${t.clicks}/${t.target}</span>
                        </div>
                        <div class="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                            <div class="bg-blue-500 h-full" style="width: ${(t.clicks/t.target)*100}%"></div>
                        </div>
                    </div>`;
            }
        });
    });
}

// Tasks with Anti-Cheat
window.startTask = async function() {
    const tasksSnap = await get(ref(db, 'tasks'));
    const pool = [];
    tasksSnap.forEach(t => {
        const task = t.val();
        if (task.clicks < task.target && task.owner !== currentUser.uid) {
            pool.push({id: t.key, ...task});
        }
    });

    if (pool.length === 0) return alert("No links available! Add your own or wait for others.");

    const randomTask = pool[Math.floor(Math.random() * pool.length)];
    
    taskActive = true;
    timerValue = 30;
    document.getElementById('timer-overlay').classList.remove('hidden');
    window.open(randomTask.link, '_blank');

    timerInterval = setInterval(() => {
        timerValue--;
        document.getElementById('timer-display').innerText = timerValue;

        if (timerValue <= 0) {
            clearInterval(timerInterval);
            finishTask(randomTask.id);
        }
    }, 1000);

    // If user returns to tab early
    window.onfocus = () => {
        if (taskActive && timerValue > 0) {
            clearInterval(timerInterval);
            taskActive = false;
            document.getElementById('timer-overlay').classList.add('hidden');
            alert("TASK FAILED: You returned too early. Please stay for 30 seconds.");
        }
    };
};

async function finishTask(taskId) {
    taskActive = false;
    document.getElementById('timer-overlay').classList.add('hidden');
    
    const reward = 0.00015;
    const bonus = reward * 0.20;
    const updates = {};

    updates[`users/${currentUser.uid}/balance`] = increment(reward);
    updates[`users/${currentUser.uid}/totalEarned`] = increment(reward);
    updates[`tasks/${taskId}/clicks`] = increment(1);

    if (userData.referredBy) {
        updates[`users/${userData.referredBy}/balance`] = increment(bonus);
        updates[`users/${userData.referredBy}/refEarnings`] = increment(bonus);
        updates[`users/${userData.referredBy}/refCount`] = increment(1);
    }

    await update(ref(db), updates);
}

// Link Registration with Description
window.registerLink = async function() {
    const link = document.getElementById('fb-link-input').value;
    const desc = document.getElementById('fb-desc-input').value;

    if (!link.includes('facebook.com')) return alert("Invalid Facebook URL");
    if (!desc) return alert("Please add a short description");

    const snap = await get(ref(db, 'users/' + currentUser.uid));
    const u = snap.val();

    let cost = 0;
    if (u.linksCount >= 1) {
        cost = 0.02;
        if (u.balance < cost) return alert("Insufficient balance! Need $0.02 USDT");
    }

    const taskRef = push(ref(db, 'tasks'));
    await set(taskRef, {
        link,
        desc,
        owner: currentUser.uid,
        target: 100,
        clicks: 0,
        timestamp: Date.now()
    });

    await update(ref(db, 'users/' + currentUser.uid), {
        balance: increment(-cost),
        linksCount: increment(1)
    });

    document.getElementById('fb-link-input').value = '';
    document.getElementById('fb-desc-input').value = '';
    alert("Task Registered!");
};

// Deposits
window.submitDeposit = function() {
    const amount = document.getElementById('dep-amount').value;
    const refNum = document.getElementById('dep-ref').value;
    const method = document.getElementById('dep-method').value;

    if (!amount || !refNum) return alert("Fill all fields");

    push(ref(db, 'deposits'), {
        uid: currentUser.uid,
        id: userData.profileId,
        amount: parseFloat(amount),
        refNum,
        method,
        status: 'pending'
    });
    alert("Deposit request sent for manual approval.");
};

// Community Chat
window.sendChat = function() {
    const msg = document.getElementById('chat-input').value;
    if (!msg) return;
    push(ref(db, 'chats'), {
        id: userData.profileId,
        msg: msg,
        time: Date.now()
    });
    document.getElementById('chat-input').value = '';
};

// Admin Section
window.authAdmin = function() {
    if (document.getElementById('admin-pass').value === "Propetas12") {
        document.getElementById('admin-content').classList.remove('hidden');
        onValue(ref(db, 'deposits'), (snap) => {
            const cont = document.getElementById('pending-deposits');
            cont.innerHTML = '';
            snap.forEach(child => {
                const d = child.val();
                if (d.status === 'pending') {
                    cont.innerHTML += `
                        <div class="bg-black/40 p-2 rounded border border-red-500/20">
                            <p>ID: ${d.id} | $${d.amount} (${d.method})</p>
                            <p class="text-blue-400">REF: ${d.refNum}</p>
                            <button onclick="approveDep('${child.key}', '${d.uid}', ${d.amount})" class="bg-green-600 px-3 py-1 rounded mt-2">APPROVE</button>
                        </div>`;
                }
            });
        });
    }
};

window.approveDep = async function(key, uid, amt) {
    await update(ref(db, `users/${uid}`), { balance: increment(amt) });
    await update(ref(db, `deposits/${key}`), { status: 'approved' });
};

// Utilities
window.changeBg = (cls) => {
    document.getElementById('body-bg').className = `${cls} text-white min-h-screen transition-all duration-700`;
    update(ref(db, 'users/' + currentUser.uid), { bgColor: cls });
};

window.toggleSection = (id) => document.getElementById(id).classList.toggle('hidden');

window.copyRef = () => {
    const input = document.getElementById("ref-link");
    input.select();
    document.execCommand("copy");
    alert("Referral link copied!");
};

setInterval(() => {
    document.getElementById('footer-time').innerText = new Date().toLocaleString();
}, 1000);
