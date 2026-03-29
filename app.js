
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

// Initialize App
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
    
    // Referral Check
    const urlParams = new URLSearchParams(window.location.search);
    const refId = urlParams.get('ref');

    if (!snapshot.exists()) {
        const randomName = "User_" + Math.floor(1000 + Math.random() * 9000);
        userData = {
            name: randomName,
            balance: 0,
            totalEarned: 0,
            linksCount: 0,
            referredBy: refId || null,
            bgColor: 'bg-slate-900',
            uid: currentUser.uid
        };
        await set(userRef, userData);
    } else {
        userData = snapshot.val();
    }

    // Update UI
    document.getElementById('display-name').innerText = userData.name;
    document.getElementById('ref-link').value = `https://isaiahotico.github.io/Follow-to-Follow-FB-/?ref=${currentUser.uid}`;
    changeBg(userData.bgColor);
    
    // Listeners
    listenToData();
}

function listenToData() {
    // Balance and Stats
    onValue(ref(db, 'users/' + currentUser.uid), (snap) => {
        const d = snap.val();
        document.getElementById('user-balance').innerText = `$${d.balance.toFixed(5)}`;
        document.getElementById('ref-count').innerText = `${d.refCount || 0} Users ($${(d.refEarnings || 0).toFixed(4)})`;
    });

    // Chat
    onValue(ref(db, 'chats'), (snap) => {
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML = '';
        snap.forEach((child) => {
            const m = child.val();
            chatBox.innerHTML += `<div><span class="text-blue-400 font-bold">${m.name}:</span> ${m.msg}</div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    }, { onlyOnce: false });

    // My Links
    onValue(ref(db, 'tasks'), (snap) => {
        const container = document.getElementById('links-container');
        container.innerHTML = '';
        snap.forEach((child) => {
            const t = child.val();
            if (t.owner === currentUser.uid) {
                container.innerHTML += `
                    <div class="bg-slate-700 p-2 rounded flex justify-between">
                        <span class="truncate w-1/2">${t.link}</span>
                        <span class="text-green-400">${t.clicks}/${t.target} visits</span>
                    </div>`;
            }
        });
    });
}

// Task Logic
window.startTask = async function() {
    const tasksSnap = await get(ref(db, 'tasks'));
    const allTasks = [];
    tasksSnap.forEach(t => {
        const task = t.val();
        if (task.clicks < task.target && task.owner !== currentUser.uid) {
            allTasks.push({id: t.key, ...task});
        }
    });

    if (allTasks.length === 0) {
        alert("No tasks available right now!");
        return;
    }

    const randomTask = allTasks[Math.floor(Math.random() * allTasks.length)];
    
    taskActive = true;
    timerValue = 30;
    document.getElementById('timer-overlay').classList.remove('hidden');
    
    // Open FB Link
    window.open(randomTask.link, '_blank');

    timerInterval = setInterval(() => {
        timerValue--;
        document.getElementById('timer-circle').innerText = timerValue;

        if (timerValue <= 0) {
            clearInterval(timerInterval);
            completeTask(randomTask.id);
        }
    }, 1000);

    // Anti-cheat: detection when user returns to tab
    window.onfocus = () => {
        if (taskActive && timerValue > 0) {
            clearInterval(timerInterval);
            taskActive = false;
            document.getElementById('timer-overlay').classList.add('hidden');
            alert("Task Failed! Please stay on the Facebook page for the full 30 seconds.");
        }
    };
};

async function completeTask(taskId) {
    taskActive = false;
    document.getElementById('timer-overlay').classList.add('hidden');
    
    // Update Reward
    const reward = 0.00015;
    const refBonus = reward * 0.20;

    const updates = {};
    updates[`users/${currentUser.uid}/balance`] = increment(reward);
    updates[`users/${currentUser.uid}/totalEarned`] = increment(reward);
    updates[`tasks/${taskId}/clicks`] = increment(1);

    // Referral Bonus
    if (userData.referredBy) {
        updates[`users/${userData.referredBy}/balance`] = increment(refBonus);
        updates[`users/${userData.referredBy}/refEarnings`] = increment(refBonus);
    }

    await update(ref(db), updates);
    alert("Task Completed! $0.00015 added to your balance.");
}

// Link Registration
window.registerLink = async function() {
    const link = document.getElementById('fb-link-input').value;
    if (!link.includes('facebook.com')) return alert("Enter a valid FB link");

    const userRef = ref(db, 'users/' + currentUser.uid);
    const snap = await get(userRef);
    const u = snap.val();

    let target = 100;
    if (u.linksCount > 0) {
        if (u.balance < 0.02) return alert("Insufficient balance! Need $0.02 USDT");
        await update(userRef, { balance: increment(-0.02) });
    }

    const newTaskRef = push(ref(db, 'tasks'));
    await set(newTaskRef, {
        link: link,
        owner: currentUser.uid,
        target: target,
        clicks: 0,
        timestamp: Date.now()
    });

    await update(userRef, { linksCount: increment(1) });
    alert("Link registered successfully!");
};

// Deposits
window.submitDeposit = function() {
    const amount = document.getElementById('dep-amount').value;
    const refNum = document.getElementById('dep-ref').value;
    const method = document.getElementById('dep-method').value;

    if (!amount || !refNum) return alert("Fill all fields");

    const depRef = push(ref(db, 'deposits'));
    set(depRef, {
        uid: currentUser.uid,
        userName: userData.name,
        amount: parseFloat(amount),
        refNum: refNum,
        method: method,
        status: 'pending'
    });
    alert("Deposit request submitted!");
};

// Chat
window.sendChat = function() {
    const msg = document.getElementById('chat-input').value;
    if (!msg) return;
    push(ref(db, 'chats'), {
        name: userData.name,
        msg: msg,
        time: Date.now()
    });
    document.getElementById('chat-input').value = '';
};

// UI Customization
window.changeBg = function(colorClass) {
    document.getElementById('body-bg').className = `${colorClass} text-white min-h-screen transition-colors duration-500`;
    update(ref(db, 'users/' + currentUser.uid), { bgColor: colorClass });
};

// Admin Logic
window.authAdmin = function() {
    const pass = document.getElementById('admin-pass').value;
    if (pass === "Propetas12") {
        document.getElementById('admin-content').classList.remove('hidden');
        loadAdminData();
    } else {
        alert("Wrong Password");
    }
};

function loadAdminData() {
    onValue(ref(db, 'deposits'), (snap) => {
        const cont = document.getElementById('pending-deposits');
        cont.innerHTML = '';
        snap.forEach(child => {
            const d = child.val();
            if (d.status === 'pending') {
                cont.innerHTML += `
                    <div class="bg-slate-900 p-2 rounded">
                        <p>${d.userName} - $${d.amount} (${d.method})</p>
                        <p class="text-blue-400">${d.refNum}</p>
                        <button onclick="approveDep('${child.key}', '${d.uid}', ${d.amount})" class="bg-green-600 px-2 py-1 rounded mt-1">Approve</button>
                    </div>`;
            }
        });
    });
}

window.approveDep = async function(depId, uid, amount) {
    await update(ref(db, `users/${uid}`), { balance: increment(amount) });
    await update(ref(db, `deposits/${depId}`), { status: 'approved' });
    alert("Approved!");
};

// Footer Time
setInterval(() => {
    const now = new Date();
    document.getElementById('footer-time').innerText = now.toLocaleString();
}, 1000);

window.copyRef = () => {
    const copyText = document.getElementById("ref-link");
    copyText.select();
    document.execCommand("copy");
    alert("Link Copied!");
};
