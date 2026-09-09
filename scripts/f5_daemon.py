#!/usr/bin/env python3
"""F5-TTS control stub.

Honest status only: ping answers when this script can run. It does not
synthesize audio. Real F5 inference is out of scope for this package until a
supported external runtime is documented and wired.
"""
import sys
import json


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--ping':
        print(json.dumps({"ok": True, "status": "ready", "synthesize": False}))
        sys.exit(0)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            cmd = req.get("cmd")
            if cmd == "ping":
                print(json.dumps({"ok": True, "status": "pong", "synthesize": False}))
            elif cmd == "synthesize":
                print(json.dumps({
                    "ok": False,
                    "error": "F5 synthesis is not bundled; use Edge/Piper/eSpeak offline providers",
                }))
            else:
                print(json.dumps({"ok": False, "error": f"unknown cmd: {cmd}"}))
            sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            sys.stdout.flush()


if __name__ == "__main__":
    main()
