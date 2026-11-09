// Firebase 專案設定
// 專案 ID: my-to-do-list-1d256

// 預設設定（已填入專案 API Key）
export const defaultFirebaseConfig = {
  apiKey: "AIzaSyDDpqJBOYWsLfmxZImO5LSyckjkDI-B9Wg",
  authDomain: "my-to-do-list-1d256.firebaseapp.com",
  projectId: "my-to-do-list-1d256",
  storageBucket: "my-to-do-list-1d256.appspot.com",
  messagingSenderId: "",
  appId: ""
};

// 支援從瀏覽器 localStorage 讀取自訂設定，無需重新編輯程式碼
export function getFirebaseConfig() {
  const saved = localStorage.getItem("firebase_config_my_to_do_list");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.projectId) {
        // 若 localStorage 內無有效 apiKey，則繼承預設的金鑰
        if (!parsed.apiKey || parsed.apiKey === "AIzaSy_YOUR_API_KEY_HERE") {
          parsed.apiKey = defaultFirebaseConfig.apiKey;
        }
        return parsed;
      }
    } catch (e) {
      console.warn("解析 localStorage Firebase 設定失敗，改用預設設定", e);
    }
  }
  return defaultFirebaseConfig;
}

export function saveFirebaseConfig(config) {
  localStorage.setItem("firebase_config_my_to_do_list", JSON.stringify(config));
}
