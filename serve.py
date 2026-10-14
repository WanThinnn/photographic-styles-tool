import http.server
import sys
from functools import partial

class COOPHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.mjs': 'text/javascript', '.wasm': 'application/wasm'}
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        super().end_headers()

class DevelopmentServer(http.server.ThreadingHTTPServer):
    # The browser fetches the ES-module graph in a large burst, especially
    # through cloudflared. TCPServer's default backlog of five intermittently
    # refuses otherwise valid module requests on Windows.
    request_queue_size = 128
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8006
    host = "127.0.0.1"
    handler = partial(COOPHandler, directory="web")
    server = DevelopmentServer((host, port), handler)
    print(f"Starting server with Cross-Origin Isolation at http://{host}:{port}/ ...")
    print(f"Cloudflare quick tunnel: cloudflared tunnel --url http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
