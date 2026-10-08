import http.server
import sys
from functools import partial

class COOPHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.mjs': 'text/javascript', '.wasm': 'application/wasm'}
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8006
    handler = partial(COOPHandler, directory="web")
    print(f"Starting server with Cross-Origin Isolation at http://localhost:{port}/ ...")
    http.server.test(HandlerClass=handler, port=port)
