import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  setDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { getFirebaseConfig, saveFirebaseConfig, defaultFirebaseConfig } from "./firebase-config.js";

// ====== 狀態變數 ======
let app = null;
let auth = null;
let db = null;
let currentUser = null;

let currentLists = [];
let activeListId = null;
let currentTodos = [];
let currentFilter = "all"; // all, active, completed, assigned-me
let searchQuery = "";

let unsubscribeLists = null;
let unsubscribeTodos = null;

// ====== 輔助函數：Toast 通知 ======
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  const bg = type === "error" ? "bg-rose-600" : type === "success" ? "bg-emerald-600" : "bg-slate-800";
  toast.className = `${bg} text-white text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  });

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// 產生 6 碼大寫英數邀請碼
function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return { text: "今天到期", isOverdue: false, isToday: true };
  if (diffDays === 1) return { text: "明天到期", isOverdue: false, isToday: false };
  if (diffDays < 0) return { text: `已過期 ${Math.abs(diffDays)} 天`, isOverdue: true, isToday: false };
  return { text: `${target.getMonth() + 1}/${target.getDate()} 到期`, isOverdue: false, isToday: false };
}

// ====== 初始化 Firebase ======
function initFirebase() {
  const config = getFirebaseConfig();

  // 檢查是否仍為預設未填寫金鑰
  if (!config.apiKey || config.apiKey === "AIzaSy_YOUR_API_KEY_HERE") {
    console.warn("尚未設定有效的 Firebase API Key，開啟設定視窗。");
    openConfigModal();
    return false;
  }

  try {
    app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    return true;
  } catch (err) {
    console.error("Firebase 初始化失敗：", err);
    showToast("Firebase 連線初始化失敗，請檢查設定", "error");
    openConfigModal();
    return false;
  }
}

// ====== 認證邏輯 (Google Sign-In) ======
function setupAuthListeners() {
  if (!auth) return;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      document.getElementById("unauth-view").classList.add("hidden");
      document.getElementById("auth-view").classList.remove("hidden");

      // 更新使用者介面
      document.getElementById("user-avatar").src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "User")}&background=3b82f6&color=fff`;
      document.getElementById("user-display-name").textContent = user.displayName || "匿名使用者";
      document.getElementById("user-email").textContent = user.email || "";

      // 同步使用者資料至 Firestore users 集合
      try {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          displayName: user.displayName || "",
          email: user.email || "",
          photoURL: user.photoURL || "",
          lastSeen: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        console.warn("更新使用者資料失敗 (若尚未開放 Firestore 權限請先確認 Security Rules):", e);
      }

      // 監聽清單列表
      listenToUserLists(user.email);
    } else {
      currentUser = null;
      if (unsubscribeLists) unsubscribeLists();
      if (unsubscribeTodos) unsubscribeTodos();
      document.getElementById("unauth-view").classList.remove("hidden");
      document.getElementById("auth-view").classList.add("hidden");
    }
    lucide.createIcons();
  });
}

// Google 登入執行
async function handleGoogleLogin() {
  if (!auth) {
    if (!initFirebase()) return;
  }
  const provider = new GoogleAuthProvider();
  try {
    const errDiv = document.getElementById("login-error-msg");
    errDiv.classList.add("hidden");
    await signInWithPopup(auth, provider);
    showToast("登入成功！", "success");
  } catch (error) {
    console.error("Google 登入錯誤：", error);
    const errDiv = document.getElementById("login-error-msg");
    errDiv.textContent = `登入失敗：${error.message} (請確認 Firebase Console 中已啟用 Google 登入供應商與 Authorized Domain)`;
    errDiv.classList.remove("hidden");
  }
}

// 登出執行
async function handleSignOut() {
  try {
    await signOut(auth);
    showToast("已登出", "info");
  } catch (error) {
    console.error("登出失敗：", error);
  }
}

// ====== 清單 (List) 監聽與操作 ======
function listenToUserLists(userEmail) {
  if (!db || !userEmail) return;

  const listsQuery = query(
    collection(db, "lists"),
    where("members", "array-contains", userEmail)
  );

  unsubscribeLists = onSnapshot(listsQuery, async (snapshot) => {
    // 成功讀取，隱藏權限警告
    const permAlert = document.getElementById("firestore-permission-alert");
    if (permAlert) permAlert.classList.add("hidden");

    currentLists = [];
    snapshot.forEach((docSnap) => {
      currentLists.push({ id: docSnap.id, ...docSnap.data() });
    });

    // 如果沒有任何清單，自動建立預設的協作清單
    if (currentLists.length === 0) {
      await createInitialList();
      return;
    }

    // 檢查 activeListId 是否有效，若無則切換至第一個
    if (!activeListId || !currentLists.some((l) => l.id === activeListId)) {
      const savedListId = localStorage.getItem("my_todo_active_list");
      if (savedListId && currentLists.some((l) => l.id === savedListId)) {
        activeListId = savedListId;
      } else {
        activeListId = currentLists[0].id;
      }
    }

    renderListsNavigation();
    renderCurrentListHeader();
    listenToTodos(activeListId);
    lucide.createIcons();
  }, (error) => {
    console.error("監聽清單列表失敗：", error);
    const permAlert = document.getElementById("firestore-permission-alert");
    if (permAlert) permAlert.classList.remove("hidden");
    showToast("載入清單失敗，請確認 Firestore 規則已發布", "error");
  });
}

// 自動建立第一張協作清單
async function createInitialList() {
  try {
    const listRef = await addDoc(collection(db, "lists"), {
      name: "🚀 我的第一個協作專案",
      description: "歡迎使用！邀請其他人即可一同多人協作待辦事項。",
      ownerId: currentUser.uid,
      ownerEmail: currentUser.email,
      ownerName: currentUser.displayName || currentUser.email,
      inviteCode: generateInviteCode(),
      members: [currentUser.email],
      memberDetails: {
        [currentUser.email]: {
          name: currentUser.displayName || currentUser.email,
          photoURL: currentUser.photoURL || "",
          role: "owner"
        }
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // 加入範例待辦
    await addDoc(collection(db, "lists", listRef.id, "todos"), {
      title: "歡迎使用 MyToDoList！點擊右上方「邀請成員」分享給夥伴",
      description: "可以在上方指派任務給協作成員，並設定到期日與優先級。",
      completed: false,
      priority: "high",
      dueDate: new Date().toISOString().split("T")[0],
      assignedTo: {
        email: currentUser.email,
        name: currentUser.displayName || currentUser.email,
        photoURL: currentUser.photoURL || ""
      },
      createdBy: {
        uid: currentUser.uid,
        name: currentUser.displayName || "系統",
        email: currentUser.email,
        photoURL: currentUser.photoURL || ""
      },
      createdAt: serverTimestamp(),
      completedBy: null,
      completedAt: null
    });
  } catch (e) {
    console.error("建立預設清單失敗：", e);
    const permAlert = document.getElementById("firestore-permission-alert");
    if (permAlert) permAlert.classList.remove("hidden");
  }
}

// 建立新清單
async function handleCreateList(e) {
  e.preventDefault();
  const nameInput = document.getElementById("input-newlist-name");
  const descInput = document.getElementById("input-newlist-desc");
  const submitBtn = document.getElementById("btn-submit-create-list");
  const errorMsgDiv = document.getElementById("create-list-error-msg");
  
  if (errorMsgDiv) {
    errorMsgDiv.classList.add("hidden");
    errorMsgDiv.innerHTML = "";
  }

  const name = nameInput.value.trim();
  const description = descInput.value.trim();

  if (!name) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "建立中...";
  }

  try {
    const listRef = await addDoc(collection(db, "lists"), {
      name,
      description,
      ownerId: currentUser.uid,
      ownerEmail: currentUser.email,
      ownerName: currentUser.displayName || currentUser.email,
      inviteCode: generateInviteCode(),
      members: [currentUser.email],
      memberDetails: {
        [currentUser.email]: {
          name: currentUser.displayName || currentUser.email,
          photoURL: currentUser.photoURL || "",
          role: "owner"
        }
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    nameInput.value = "";
    descInput.value = "";
    closeModals();
    activeListId = listRef.id;
    localStorage.setItem("my_todo_active_list", activeListId);
    showToast(`成功建立清單「${name}」！`, "success");
  } catch (error) {
    console.error("建立清單失敗：", error);
    let userFriendlyMsg = `建立失敗：${error.message}`;
    if (error.code === "permission-denied" || error.message.includes("permission")) {
      userFriendlyMsg = `<b>⚠️ 權限不足 (PERMISSION_DENIED)</b><br>
        Firestore 資料庫目前拒絕寫入。請前往 Firebase Console > Firestore Database >「規則 (Rules)」，設定為允許登入使用者讀寫後發布。`;
    }
    if (errorMsgDiv) {
      errorMsgDiv.innerHTML = userFriendlyMsg;
      errorMsgDiv.classList.remove("hidden");
    }
    showToast("建立清單失敗：" + error.message, "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "建立清單";
    }
  }
}

// 透過邀請碼加入清單
async function handleJoinByCode(e) {
  e.preventDefault();
  const codeInput = document.getElementById("input-join-code");
  const code = codeInput.value.trim().toUpperCase();
  const errDiv = document.getElementById("join-error-msg");
  errDiv.classList.add("hidden");

  if (!code) return;

  try {
    const q = query(collection(db, "lists"), where("inviteCode", "==", code));
    const snap = await getDocs(q);

    if (snap.empty) {
      errDiv.textContent = "查無此邀請碼，請確認代碼是否正確。";
      errDiv.classList.remove("hidden");
      return;
    }

    const targetDoc = snap.docs[0];
    const data = targetDoc.data();

    // 檢查是否已加入
    if (data.members && data.members.includes(currentUser.email)) {
      errDiv.textContent = "你已經是該清單的成員囉！";
      errDiv.classList.remove("hidden");
      return;
    }

    // 加入 members 陣列
    const memberDetails = data.memberDetails || {};
    memberDetails[currentUser.email] = {
      name: currentUser.displayName || currentUser.email,
      photoURL: currentUser.photoURL || "",
      role: "member"
    };

    await updateDoc(doc(db, "lists", targetDoc.id), {
      members: arrayUnion(currentUser.email),
      memberDetails: memberDetails,
      updatedAt: serverTimestamp()
    });

    codeInput.value = "";
    closeModals();
    activeListId = targetDoc.id;
    localStorage.setItem("my_todo_active_list", activeListId);
    showToast(`已成功加入清單「${data.name}」！`, "success");
  } catch (err) {
    console.error("加入清單失敗：", err);
    errDiv.textContent = `加入失敗：${err.message}`;
    errDiv.classList.remove("hidden");
  }
}

// 透過 Email 邀請成員
async function handleInviteEmail(e) {
  e.preventDefault();
  const emailInput = document.getElementById("input-invite-email");
  const email = emailInput.value.trim().toLowerCase();
  if (!email || !activeListId) return;

  const currentList = currentLists.find((l) => l.id === activeListId);
  if (!currentList) return;

  if (currentList.members.includes(email)) {
    showToast("該 Email 已在成員名單中", "info");
    return;
  }

  try {
    const memberDetails = currentList.memberDetails || {};
    memberDetails[email] = {
      name: email.split("@")[0],
      photoURL: "",
      role: "member"
    };

    await updateDoc(doc(db, "lists", activeListId), {
      members: arrayUnion(email),
      memberDetails: memberDetails,
      updatedAt: serverTimestamp()
    });

    emailInput.value = "";
    showToast(`已成功邀請 ${email} 加入協作！`, "success");
    renderInviteModalContent();
  } catch (error) {
    console.error("邀請成員失敗：", error);
    showToast("邀請失敗：" + error.message, "error");
  }
}

// 刪除當前清單
async function handleDeleteCurrentList() {
  const currentList = currentLists.find((l) => l.id === activeListId);
  if (!currentList) return;

  if (currentList.ownerId !== currentUser.uid) {
    alert("只有清單建立者才能刪除此清單。");
    return;
  }

  if (!confirm(`確定要刪除「${currentList.name}」嗎？此操作無法還原。`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, "lists", activeListId));
    showToast("清單已刪除", "info");
    activeListId = null;
  } catch (e) {
    console.error("刪除清單失敗：", e);
    showToast("刪除失敗：" + e.message, "error");
  }
}

// ====== 待辦事項 (Todos) 監聽與操作 ======
function listenToTodos(listId) {
  if (unsubscribeTodos) {
    unsubscribeTodos();
    unsubscribeTodos = null;
  }
  if (!db || !listId) return;

  const todosQuery = query(
    collection(db, "lists", listId, "todos"),
    orderBy("createdAt", "desc")
  );

  unsubscribeTodos = onSnapshot(todosQuery, (snapshot) => {
    currentTodos = [];
    snapshot.forEach((docSnap) => {
      currentTodos.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderTodos();
  }, (error) => {
    console.error("載入待辦事項失敗：", error);
    showToast("無法同步待辦事項", "error");
  });
}

// 新增待辦事項
async function handleAddTodo(e) {
  e.preventDefault();
  if (!activeListId) {
    showToast("請先選擇或建立清單", "info");
    return;
  }

  const titleInput = document.getElementById("input-todo-title");
  const prioritySelect = document.getElementById("select-todo-priority");
  const dueInput = document.getElementById("input-todo-due");
  const assigneeSelect = document.getElementById("select-todo-assignee");

  const title = titleInput.value.trim();
  if (!title) return;

  const currentList = currentLists.find((l) => l.id === activeListId);
  let assignedMember = null;
  if (assigneeSelect.value && currentList && currentList.memberDetails) {
    const details = currentList.memberDetails[assigneeSelect.value];
    assignedMember = {
      email: assigneeSelect.value,
      name: details ? details.name : assigneeSelect.value,
      photoURL: details ? details.photoURL : ""
    };
  }

  try {
    await addDoc(collection(db, "lists", activeListId, "todos"), {
      title,
      description: "",
      completed: false,
      priority: prioritySelect.value,
      dueDate: dueInput.value || null,
      assignedTo: assignedMember,
      createdBy: {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email,
        email: currentUser.email,
        photoURL: currentUser.photoURL || ""
      },
      createdAt: serverTimestamp(),
      completedBy: null,
      completedAt: null
    });

    titleInput.value = "";
    dueInput.value = "";
    prioritySelect.value = "medium";
    assigneeSelect.value = "";
    showToast("待辦已新增！", "success");
  } catch (error) {
    console.error("新增待辦失敗：", error);
    showToast("新增失敗：" + error.message, "error");
  }
}

// 切換待辦完成狀態
async function toggleTodoCompleted(todoId, currentStatus) {
  if (!activeListId) return;

  try {
    const todoRef = doc(db, "lists", activeListId, "todos", todoId);
    const newStatus = !currentStatus;

    await updateDoc(todoRef, {
      completed: newStatus,
      completedAt: newStatus ? serverTimestamp() : null,
      completedBy: newStatus ? {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email,
        email: currentUser.email
      } : null
    });
  } catch (e) {
    console.error("更新待辦狀態失敗：", e);
    showToast("更新狀態失敗", "error");
  }
}

// 刪除待辦事項
async function deleteTodo(todoId) {
  if (!activeListId) return;
  if (!confirm("確定要刪除此待辦事項嗎？")) return;

  try {
    await deleteDoc(doc(db, "lists", activeListId, "todos", todoId));
    showToast("待辦事項已刪除", "info");
  } catch (e) {
    console.error("刪除待辦失敗：", e);
    showToast("刪除失敗", "error");
  }
}

// ====== 畫面渲染函數 ======

// 渲染左側邊欄清單列表
function renderListsNavigation() {
  const container = document.getElementById("lists-container");
  const countBadge = document.getElementById("lists-count-badge");
  countBadge.textContent = currentLists.length;

  if (currentLists.length === 0) {
    container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">目前沒有清單</div>`;
    return;
  }

  container.innerHTML = currentLists.map((list) => {
    const isActive = list.id === activeListId;
    const isOwner = list.ownerId === currentUser.uid;
    const memberCount = (list.members && list.members.length) || 1;

    return `
      <div 
        data-list-id="${list.id}"
        class="list-item-btn flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition ${
          isActive 
            ? 'bg-brand-50 text-brand-700 font-semibold shadow-xs' 
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }"
      >
        <div class="flex items-center gap-2.5 truncate">
          <i data-lucide="${isOwner ? 'folder' : 'users'}" class="w-4 h-4 flex-shrink-0 ${isActive ? 'text-brand-600' : 'text-slate-400'}"></i>
          <span class="truncate">${list.name}</span>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}">
            ${memberCount}人
          </span>
        </div>
      </div>
    `;
  }).join("");

  // 綁定點擊事件切換清單
  container.querySelectorAll(".list-item-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-list-id");
      if (id !== activeListId) {
        activeListId = id;
        localStorage.setItem("my_todo_active_list", id);
        renderListsNavigation();
        renderCurrentListHeader();
        listenToTodos(activeListId);
      }
    });
  });

  lucide.createIcons();
}

// 渲染當前清單標題、協作者頭像、指派下拉選單
function renderCurrentListHeader() {
  const currentList = currentLists.find((l) => l.id === activeListId);
  if (!currentList) return;

  document.getElementById("current-list-title").textContent = currentList.name;
  document.getElementById("current-list-desc").textContent = currentList.description || "即時多人協作清單";

  const isOwner = currentList.ownerId === currentUser.uid;
  const roleBadge = document.getElementById("current-list-role-badge");
  roleBadge.textContent = isOwner ? "擁有者" : "成員";
  roleBadge.className = isOwner 
    ? "text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
    : "text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200";

  // 渲染協作者頭像堆疊
  const stack = document.getElementById("collaborators-avatar-stack");
  const members = currentList.members || [];
  const memberDetails = currentList.memberDetails || {};

  stack.innerHTML = members.slice(0, 5).map((email) => {
    const details = memberDetails[email] || {};
    const photo = details.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(details.name || email)}&background=random&color=fff`;
    return `
      <img 
        src="${photo}" 
        title="${details.name || email} (${email})" 
        alt="${email}"
        class="inline-block h-7 w-7 rounded-full ring-2 ring-white object-cover shadow-xs"
      />
    `;
  }).join("");

  if (members.length > 5) {
    stack.innerHTML += `
      <div class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold ring-2 ring-white">
        +${members.length - 5}
      </div>
    `;
  }

  // 更新待辦事項新增表單中的「指派成員」選項
  const assigneeSelect = document.getElementById("select-todo-assignee");
  assigneeSelect.innerHTML = `<option value="">指派給: 無</option>` + members.map((email) => {
    const details = memberDetails[email] || {};
    const name = details.name || email.split("@")[0];
    const isMe = email === currentUser.email;
    return `<option value="${email}">${isMe ? '我 (' + name + ')' : name}</option>`;
  }).join("");
}

// 渲染待辦事項列表
function renderTodos() {
  const container = document.getElementById("todos-container");
  const emptyState = document.getElementById("todos-empty-state");

  // 根據篩選器與搜尋關鍵字過濾
  let filtered = currentTodos.filter((todo) => {
    if (currentFilter === "active" && todo.completed) return false;
    if (currentFilter === "completed" && !todo.completed) return false;
    if (currentFilter === "assigned-me") {
      if (!todo.assignedTo || todo.assignedTo.email !== currentUser.email) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (todo.title || "").toLowerCase().includes(q);
      const matchAssignee = todo.assignedTo && (todo.assignedTo.name || "").toLowerCase().includes(q);
      if (!matchTitle && !matchAssignee) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  container.innerHTML = filtered.map((todo) => {
    const dateInfo = formatDate(todo.dueDate);

    // 優先度標籤樣式
    let priorityBadge = "";
    if (todo.priority === "high") {
      priorityBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200 flex items-center gap-1">🔥 高</span>`;
    } else if (todo.priority === "medium") {
      priorityBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">中</span>`;
    } else {
      priorityBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">低</span>`;
    }

    // 到期日標籤樣式
    let dueBadge = "";
    if (dateInfo) {
      const color = dateInfo.isOverdue 
        ? "bg-rose-100 text-rose-700 font-semibold" 
        : dateInfo.isToday 
        ? "bg-amber-100 text-amber-800 font-semibold" 
        : "bg-slate-100 text-slate-600";
      dueBadge = `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${color}">
          <i data-lucide="calendar" class="w-3 h-3"></i>
          <span>${dateInfo.text}</span>
        </span>
      `;
    }

    // 指派人標籤
    let assigneeBadge = "";
    if (todo.assignedTo) {
      const isMe = todo.assignedTo.email === currentUser.email;
      assigneeBadge = `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${isMe ? 'bg-brand-50 text-brand-700 font-semibold' : 'bg-slate-100 text-slate-700'}">
          <i data-lucide="user" class="w-3 h-3"></i>
          <span>${isMe ? '我' : (todo.assignedTo.name || todo.assignedTo.email)}</span>
        </span>
      `;
    }

    // 建立/完成資訊
    let footerInfo = `由 ${todo.createdBy?.name || "成員"} 建立`;
    if (todo.completed && todo.completedBy) {
      footerInfo = `由 ${todo.completedBy.name || "成員"} 完成`;
    }

    return `
      <div class="todo-card bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-xs hover:border-slate-300 transition flex items-start gap-3 group animate-fade-in ${todo.completed ? 'bg-slate-50/70' : ''}">
        <!-- 完成勾選核取方塊 -->
        <button 
          data-action="toggle" 
          data-id="${todo.id}" 
          data-completed="${todo.completed}"
          class="mt-0.5 flex-shrink-0 w-5 h-5 rounded-lg border flex items-center justify-center transition ${
            todo.completed 
              ? 'bg-emerald-500 border-emerald-500 text-white' 
              : 'border-slate-300 hover:border-brand-500 text-transparent'
          }"
        >
          <i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>
        </button>

        <!-- 內容主體 -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-slate-800 break-words ${todo.completed ? 'todo-completed text-slate-400' : ''}">
            ${escapeHtml(todo.title)}
          </p>

          <!-- 標籤與屬性列 -->
          <div class="flex flex-wrap items-center gap-2 mt-2">
            ${priorityBadge}
            ${dueBadge}
            ${assigneeBadge}
            <span class="text-[11px] text-slate-400 ml-auto flex items-center gap-1">
              ${footerInfo}
            </span>
          </div>
        </div>

        <!-- 刪除動作按鈕 -->
        <button 
          data-action="delete" 
          data-id="${todo.id}"
          title="刪除待辦"
          class="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition flex-shrink-0"
        >
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  }).join("");

  // 綁定待辦項目的點擊監聽器
  container.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const completed = btn.getAttribute("data-completed") === "true";
      toggleTodoCompleted(id, completed);
    });
  });

  container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      deleteTodo(id);
    });
  });

  lucide.createIcons();
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ====== 彈跳視窗與模態對話框處理 ======
function openConfigModal() {
  const config = getFirebaseConfig();
  document.getElementById("cfg-apiKey").value = (config.apiKey && config.apiKey !== "AIzaSy_YOUR_API_KEY_HERE") ? config.apiKey : "";
  document.getElementById("cfg-projectId").value = config.projectId || "my-to-do-list-1d256";
  document.getElementById("cfg-authDomain").value = config.authDomain || "my-to-do-list-1d256.firebaseapp.com";
  document.getElementById("cfg-appId").value = config.appId || "";
  document.getElementById("cfg-storageBucket").value = config.storageBucket || "my-to-do-list-1d256.appspot.com";
  document.getElementById("modal-config").classList.remove("hidden");
  lucide.createIcons();
}

function renderInviteModalContent() {
  const currentList = currentLists.find((l) => l.id === activeListId);
  if (!currentList) return;

  document.getElementById("display-invite-code").textContent = currentList.inviteCode || "無";
  const members = currentList.members || [];
  const memberDetails = currentList.memberDetails || {};
  document.getElementById("modal-members-count").textContent = members.length;

  const listContainer = document.getElementById("modal-members-list");
  listContainer.innerHTML = members.map((email) => {
    const details = memberDetails[email] || {};
    const isOwner = currentList.ownerId === currentUser.uid && currentList.ownerEmail === email;
    return `
      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
        <div class="flex items-center gap-2 truncate">
          <div class="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-[10px]">
            ${(details.name || email).charAt(0).toUpperCase()}
          </div>
          <div class="truncate">
            <span class="font-medium text-slate-800">${details.name || email}</span>
            <span class="text-slate-400 text-[10px] block truncate">${email}</span>
          </div>
        </div>
        <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${isOwner ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}">
          ${isOwner ? '擁有者' : '成員'}
        </span>
      </div>
    `;
  }).join("");
}

function closeModals() {
  document.querySelectorAll(".fixed.inset-0").forEach((modal) => {
    modal.classList.add("hidden");
  });
}

// ====== 事件監聽初始化 ======
function bindEventListeners() {
  // 權限規則說明按鈕
  const guideBtn = document.getElementById("btn-show-rules-guide");
  if (guideBtn) {
    guideBtn.addEventListener("click", () => {
      alert("【Firestore 規則設定步驟】\n\n1. 前往 Firebase Console 進入「my-to-do-list-1d256」\n2. 點擊左側選單的「Firestore Database」\n3. 點選「規則 (Rules)」標籤頁\n4. 將規則改為：\n\nrules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if request.auth != null;\n    }\n  }\n}\n\n5. 點擊「發布 (Publish)」即可正常讀寫！");
    });
  }

  // 登入 & 登出
  document.getElementById("btn-google-login").addEventListener("click", handleGoogleLogin);
  document.getElementById("btn-sign-out").addEventListener("click", handleSignOut);

  // 設定彈窗
  document.getElementById("btn-open-config").addEventListener("click", openConfigModal);
  document.getElementById("btn-open-config-unauth").addEventListener("click", openConfigModal);
  document.getElementById("btn-save-config").addEventListener("click", () => {
    const newConfig = {
      apiKey: document.getElementById("cfg-apiKey").value.trim(),
      projectId: document.getElementById("cfg-projectId").value.trim() || "my-to-do-list-1d256",
      authDomain: document.getElementById("cfg-authDomain").value.trim() || "my-to-do-list-1d256.firebaseapp.com",
      appId: document.getElementById("cfg-appId").value.trim(),
      storageBucket: document.getElementById("cfg-storageBucket").value.trim() || "my-to-do-list-1d256.appspot.com"
    };
    saveFirebaseConfig(newConfig);
    showToast("設定已儲存！頁面即將重新整理...", "success");
    setTimeout(() => window.location.reload(), 800);
  });

  // 關閉 Modal
  document.querySelectorAll(".modal-close").forEach((btn) => {
    btn.addEventListener("click", closeModals);
  });

  // 建立清單彈窗與表單
  document.getElementById("btn-open-create-list").addEventListener("click", () => {
    document.getElementById("modal-create-list").classList.remove("hidden");
    document.getElementById("input-newlist-name").focus();
  });
  document.getElementById("form-create-list").addEventListener("submit", handleCreateList);

  // 加入清單彈窗與表單
  document.getElementById("btn-open-join-list").addEventListener("click", () => {
    document.getElementById("modal-join-list").classList.remove("hidden");
    document.getElementById("input-join-code").focus();
  });
  document.getElementById("form-join-list").addEventListener("submit", handleJoinByCode);

  // 邀請成員彈窗與表單
  document.getElementById("btn-open-invite").addEventListener("click", () => {
    renderInviteModalContent();
    document.getElementById("modal-invite").classList.remove("hidden");
  });
  document.getElementById("form-invite-email").addEventListener("submit", handleInviteEmail);
  document.getElementById("btn-copy-invite-code").addEventListener("click", () => {
    const code = document.getElementById("display-invite-code").textContent.trim();
    navigator.clipboard.writeText(code).then(() => {
      showToast(`已複製邀請碼：${code}`, "success");
    }).catch(() => {
      showToast("複製失敗，請手動選取", "error");
    });
  });

  // 刪除清單
  document.getElementById("btn-delete-list").addEventListener("click", handleDeleteCurrentList);

  // 新增待辦事項表單
  document.getElementById("form-add-todo").addEventListener("submit", handleAddTodo);

  // 篩選標籤
  document.querySelectorAll(".filter-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".filter-tab").forEach((t) => {
        t.className = "filter-tab px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 transition";
      });
      tab.className = "filter-tab px-3 py-1 rounded-md bg-white text-slate-800 shadow-sm font-semibold transition";
      currentFilter = tab.getAttribute("data-filter");
      renderTodos();
    });
  });

  // 關鍵字搜尋
  const searchInput = document.getElementById("input-search-todos");
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderTodos();
  });
}

// ====== 程式啟動入口 ======
window.addEventListener("DOMContentLoaded", () => {
  bindEventListeners();
  if (initFirebase()) {
    setupAuthListeners();
  }
  lucide.createIcons();
});
