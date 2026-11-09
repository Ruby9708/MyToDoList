#!/usr/bin/env python3
import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # 加上快取禁用以方便本地即時開發調試
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def run():
    os.chdir(DIRECTORY)
    # 嘗試綁定埠號，若被佔用則順延
    port = PORT
    httpd = None
    while port < PORT + 20:
        try:
            httpd = socketserver.TCPServer(("", port), Handler)
            break
        except OSError:
            port += 1

    if not httpd:
        print(f"錯誤：無法在埠號 {PORT} 至 {port} 啟動伺服器。")
        sys.exit(1)

    url = f"http://localhost:{port}"
    print("=" * 60)
    print("🚀 MyToDoList 本地伺服器已啟動！")
    print(f"🌐 請在瀏覽器開啟：{url}")
    print("📌 按下 Ctrl + C 可停止伺服器")
    print("=" * 60)

    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n伺服器已停止。")
        httpd.server_close()

if __name__ == "__main__":
    run()
