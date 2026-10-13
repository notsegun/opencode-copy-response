#!/usr/bin/env python3
"""Fixture sessions for scripts/e2e.sh.

Builds payloads that mimic /api/experimental/session/{id}/export and imports
them through /api/experimental/session/import, so a real opencode tui shows a
real session with representative markdown. No model is ever called.
"""
import json
import subprocess
import sys

PART_1 = """# copy response check

a **bold** word, an *italic* one, and `inline code`.

- first item
  - nested item with a [link](https://opencode.ai/v2/docs/build/plugins/cli)
  - nested item with `code`
- second item

> a blockquote line
> and its continuation

| command | what it copies |
| --- | --- |
| `/copy` | the latest assistant response |
| `/copy-transcript` | the whole session transcript |"""

PART_2 = """```ts
const fence = "\u0060\u0060\u0060" // inner backticks stay literal
export function hello(name: string): string {
  return `hello ${name}`
}
```

1. ordered
2. list

done."""

OLDER = "an older answer that must never be copied once the newer one exists"


def session(sid: str, tag: str, title: str, work: str, parts: list[str], textless_last: bool = False) -> dict:
    messages = [
        {"id": f"msg_e2e_{tag}_user", "time": {"created": 1700000000000}, "text": "fixture question", "type": "user"},
        {
            "id": f"msg_e2e_{tag}_old",
            "time": {"created": 1700000001000, "streamed": 1700000001500, "completed": 1700000002000},
            "type": "assistant",
            "agent": "build",
            "model": {"id": "fixture", "providerID": "fixture"},
            "content": [{"type": "text", "text": OLDER}] if parts else [{"type": "reasoning", "text": "no text"}],
            "finish": "stop",
        },
        {
            "id": f"msg_e2e_{tag}_new",
            "time": {"created": 1700000002000, "streamed": 1700000002500, "completed": 1700000003000},
            "type": "assistant",
            "agent": "build",
            "model": {"id": "fixture", "providerID": "fixture"},
            "content": [{"type": "text", "text": text} for text in parts] or [{"type": "reasoning", "text": "none"}],
            "finish": "stop",
        },
    ]
    if textless_last:
        messages.append(
            {
                "id": f"msg_e2e_{tag}_last",
                "time": {"created": 1700000003000, "streamed": 1700000003500, "completed": 1700000004000},
                "type": "assistant",
                "agent": "build",
                "model": {"id": "fixture", "providerID": "fixture"},
                "content": [{"type": "reasoning", "text": "running tools"}],
                "finish": "unknown",
            }
        )
    else:
        messages.append({"id": f"msg_e2e_{tag}_idle", "time": {"created": 1700000004000}, "type": "idle", "outcome": "succeeded"})
    info = {
        "id": sid,
        "projectID": "0" * 40,
        "model": {"id": "fixture", "providerID": "fixture"},
        "cost": 0,
        "tokens": {"input": 0, "output": 0, "reasoning": 0, "cache": {"read": 0, "write": 0}},
        "outcome": "succeeded",
        "time": {"created": 1700000000000, "updated": 1700000005000},
        "title": title,
        "location": {"directory": work},
    }
    return {"info": info, "messages": messages}


def main() -> None:
    work = sys.argv[1]
    out = sys.argv[2]
    expected = sys.argv[3]
    payloads = {
        "response": session("ses_e2e0000000000000000000001", "response", "e2e response", work, [PART_1, PART_2]),
        "textless": session("ses_e2e0000000000000000000002", "textless", "e2e textless", work, [PART_1], textless_last=True),
        "blank": session("ses_e2e0000000000000000000003", "blank", "e2e blank", work, []),
    }
    with open(expected, "w") as fh:
        fh.write(PART_1 + "\n" + PART_2)
    for name, payload in payloads.items():
        payload["location"] = {"directory": work}
        with open(f"{out}/{name}.json", "w") as fh:
            json.dump(payload, fh)
        result = subprocess.run(
            ["opencode", "api", "post", "/api/experimental/session/import", "-d", json.dumps(payload)],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=work,
        )
        if result.returncode != 0 or '"data"' not in result.stdout:
            print(f"import failed for {name}: {result.stdout}{result.stderr}", file=sys.stderr)
            sys.exit(1)
        print(f"imported {name}: {payload['info']['id']}")
    print("expected clipboard bytes:", len((PART_1 + "\n" + PART_2).encode()))


if __name__ == "__main__":
    main()
