# MyToDoList - 多人協作待辦清單應用程式

專為 Firebase 專案 `my-to-do-list-1d256` 打造的現代化多人即時協作待辦清單網頁應用程式。

---

## ✨ 核心特色

1. **Google 帳號快速登入**：支援 Firebase Authentication Google 登入與個人大頭貼/名稱同步。
2. **即時多人協作**：透過 Cloud Firestore 的 `onSnapshot` 即時同步技術，清單成員之間變更待辦狀態零時差即時反映。
3. **多人專案清單管理**：
   - 可建立多組協作清單（例如：產品衝刺、家庭採購、專案進度）。
   - 清楚區分清單建立者（擁有者）與成員角色。
4. **雙軌邀請機制**：
   - **專屬 6 碼邀請碼**：一鍵產生與複製，隊友輸入代碼立即加入。
   - **Google Email 邀請**：直接輸入隊友 Gmail 即可將其納入成員名單。
5. **完整待辦功能**：
   - 任務優先度標記（🔥 高 / 中 / 低）。
   - 到期日與過期醒目提醒（今天到期、已過期 X 天）。
   - 任務指派：可直接將任務指派給特定清單成員。
   - 狀態篩選（全部、進行中、已完成、指派給我）與即時關鍵字搜尋。
   - 詳細操作紀錄（顯示建立者與勾選完成者）。

---

## 🚀 快速啟動

在終端機中執行以下任一指令即可在本地啟動伺服器：

```bash
cd /Users/lele180/.gemini/antigravity/scratch/MyToDoList

# 方式一：使用啟動腳本
./start.sh

# 方式二：直接透過 Python 啟動
python3 serve.py
```

伺服器將在 `http://localhost:3000` 啟動並自動為您開啟瀏覽器。

---

## 🛠️ Firebase Console 設定步驟指南

本專案已為您預先配置專案 ID：`my-to-do-list-1d256`。首次使用請前往 [Firebase Console](https://console.firebase.google.com/) 確認以下設定：

### 1. 取得 API Key 與 Web 應用程式設定
1. 前往 Firebase Console 進入 `my-to-do-list-1d256` 專案。
2. 點選左上角 ⚙️ **專案設定**（Project Settings）。
3. 在「一般」標籤頁下方「您的應用程式」，如果尚未建立 Web 應用程式，請點擊 `</>` (Web) 新增一個，名稱可取為 `MyToDoList`。
4. 複製其中的 `firebaseConfig` 物件內容。
5. 您可以：
   - 在網頁右上角點擊 ⚙️ **設定** 按鈕，直接貼入 API Key 及相關參數後點擊儲存；或者
   - 直接編輯本專案的 `firebase-config.js` 檔案，填入您的 `apiKey` 與 `appId`。

### 2. 啟用 Google 登入
1. 在 Firebase Console 左側選單點選 **Authentication**。
2. 進入「登入方式 (Sign-in method)」標籤。
3. 新增提供者選擇 **Google**，勾選「啟用」，設定專案支援的電子郵件後儲存。
4. 在「設定 (Settings)」>「已授權網域 (Authorized domains)」中，確認已包含 `localhost`。

### 3. 設定 Firestore 資料庫與安全性規則
1. 在 Firebase Console 左側選單點選 **Firestore Database**。
2. 點擊「建立資料庫」，選擇離您最近的地點（如 `asia-east1` 台灣 或 `asia-east2` 香港）。
3. 進入「規則 (Rules)」標籤頁，將本專案目錄下的 `firestore.rules` 內容複製貼上並發布：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /lists/{listId} {
      allow read: if request.auth != null && (
        resource.data.ownerId == request.auth.uid ||
        resource.data.members.hasAny([request.auth.token.email]) ||
        resource == null
      );
      allow create: if request.auth != null;
      allow update: if request.auth != null && (
        resource.data.ownerId == request.auth.uid ||
        resource.data.members.hasAny([request.auth.token.email]) ||
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['members', 'memberDetails', 'updatedAt'])
      );
      allow delete: if request.auth != null && resource.data.ownerId == request.auth.uid;
      
      match /todos/{todoId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

---

## 📁 檔案架構

```
MyToDoList/
├── index.html          # 主頁面結構與 UI（基於 Tailwind CSS & Lucide Icons）
├── app.js              # 應用程式主要業務邏輯（Auth、Firestore 即時監聽與協作）
├── firebase-config.js  # Firebase 連線設定與本機儲存同步邏輯
├── firestore.rules     # 針對多人協作設計的 Firestore 安全性規則
├── serve.py            # 零依賴的 Python 本地開發伺服器
├── start.sh            # 一鍵啟動腳本
└── README.md           # 專案說明文件
```
