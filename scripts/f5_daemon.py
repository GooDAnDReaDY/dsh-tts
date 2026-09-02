#!/usr/bin/env python3
import sys
import json

def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--ping':
        print(json.dumps({"ok": True, "status": "ready"}))
        sys.exit(0)

    # Read line-delimited JSON commands from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            cmd = req.get("cmd")
            if cmd == "ping":
                print(json.dumps({"ok": True, "status": "pong"}))
                sys.stdout.flush()
            elif cmd == "synthesize":
                text = req.get("text", "")
                print(json.dumps({"ok": True, "samples": len(text) * 800, "sampleRate": 24000}))
                sys.stdout.flush()
            else:
                print(json.dumps({"ok": False, "error": f"unknown cmd: {cmd}"}))
                sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
