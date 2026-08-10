#!/usr/bin/env python3
"""Thu tiếng cho từng bài bằng edge-tts (giọng Microsoft Neural, miễn phí).

Chạy sau tools/extract.js:
    python3 tools/tts.py

- Đọc audio/texts.json
- Bài nào đã thu rồi và chữ không đổi thì bỏ qua
- Bài mới hoặc bài vừa sửa chữ thì thu lại
- Xoá file thừa của bài đã gỡ
- Ghi audio/manifest.json cho nghe.js dùng
"""
import asyncio
import json
import os
import sys
import time

import edge_tts

VOICE = os.environ.get("TTS_VOICE", "vi-VN-NamMinhNeural")
RATE = os.environ.get("TTS_RATE", "+0%")
PITCH = os.environ.get("TTS_PITCH", "+0Hz")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "audio")
TEXTS = os.path.join(AUDIO, "texts.json")
MANIFEST = os.path.join(AUDIO, "manifest.json")

RETRIES = 4
PAUSE = 1.0          # nghỉ giữa hai bài, cho đỡ bị chặn


async def make_one(item, path):
    """Thu một bài, thử lại vài lần nếu mạng trục trặc."""
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            tmp = path + ".part"
            comm = edge_tts.Communicate(item["text"], VOICE, rate=RATE, pitch=PITCH)
            await comm.save(tmp)
            if os.path.getsize(tmp) < 1024:
                raise RuntimeError("file thu ra quá nhỏ")
            os.replace(tmp, path)
            return True
        except Exception as e:                       # noqa: BLE001
            last = e
            wait = 2 ** attempt
            print(f"    lần {attempt} hỏng ({e}); chờ {wait}s rồi thử lại", flush=True)
            try:
                os.remove(path + ".part")
            except OSError:
                pass
            await asyncio.sleep(wait)
    print(f"    BỎ QUA: {last}", flush=True)
    return False


async def main():
    if not os.path.exists(TEXTS):
        print("Chưa có audio/texts.json — chạy node tools/extract.js trước", file=sys.stderr)
        return 1

    with open(TEXTS, encoding="utf-8") as f:
        items = json.load(f)

    old = {}
    if os.path.exists(MANIFEST):
        try:
            with open(MANIFEST, encoding="utf-8") as f:
                old = json.load(f).get("bai", {})
        except (OSError, ValueError):
            old = {}

    os.makedirs(AUDIO, exist_ok=True)

    manifest = {}
    made = skipped = failed = 0

    for i, item in enumerate(items, 1):
        name = item["id"] + ".mp3"
        path = os.path.join(AUDIO, name)
        prev = old.get(item["id"])

        if prev and prev.get("h") == item["hash"] and os.path.exists(path):
            manifest[item["id"]] = prev
            skipped += 1
            continue

        print(f"[{i}/{len(items)}] thu: {item['title'][:60]} ({item['chars']} ký tự)", flush=True)
        ok = await make_one(item, path)
        if ok:
            manifest[item["id"]] = {"h": item["hash"], "f": name, "b": os.path.getsize(path)}
            made += 1
        else:
            failed += 1
            if prev and os.path.exists(path):        # giữ bản cũ còn hơn không có
                manifest[item["id"]] = prev
        await asyncio.sleep(PAUSE)

    # dọn file của bài đã gỡ
    keep = {v["f"] for v in manifest.values()}
    removed = 0
    for fn in os.listdir(AUDIO):
        if fn.endswith(".mp3") and fn not in keep:
            os.remove(os.path.join(AUDIO, fn))
            removed += 1

    total = sum(v.get("b", 0) for v in manifest.values())
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({"giong": VOICE, "bai": manifest}, f, ensure_ascii=False, indent=1)

    print(f"\nThu mới {made} · giữ nguyên {skipped} · hỏng {failed} · xoá {removed}")
    print(f"Tổng {len(manifest)} file, {total/1024/1024:.1f} MB, giọng {VOICE}")
    return 1 if (failed and not made) else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
