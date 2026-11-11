#!/usr/bin/env python3
"""Adds the 17 children's drawn creatures as GLOBAL community creatures, the same way the 8 B2 creatures (Tidepool etc.)
were added on Sep 21: creature_submissions rows (student_id = the superadmin, student_name 'Class of Happiness', country
PT, status approved, visibility_scope global), 4 stage PNGs + 4 200px thumbnails per creature in the 'creature-images'
bucket, then the real POST /creatures/global-approve/{id}.

Dry run by default: it reads and validates everything and prints the plan, and writes nothing.
  python3 upload_creatures.py                       dry run, summary of all 17
  python3 upload_creatures.py --only "Lucky Ducky"  dry run, the exact row + object names for one creature
  python3 upload_creatures.py --apply               upload the files, insert the rows, write the result file
  python3 upload_creatures.py --approve             global-approve the rows of the latest result file (temporary
                                                    superadmin session, deleted afterwards)
  python3 upload_creatures.py --rollback FILE       delete the rows and storage objects listed in a result file

Images are uploaded byte-for-byte as they are on disk (no resize, no re-encode), including the supplied thumbnails.
Object names: creatures/<uploader>_stage<N>_<8hex>.png and creatures/<uploader>_stage<N>_<8hex>_thumb.png (the
8 hex digits are derived from name+stage, so the dry run and the real run use identical names).
Nothing else is touched: existing creatures, rows and objects are never updated or overwritten (upsert off).
"""
import argparse, glob, hashlib, io, json, os, sys, time, uuid, urllib.error, urllib.request
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ROOT = os.path.expanduser("~/Desktop/COH Creatures 1024/Creatures")
DATA = os.path.join(HERE, "creatures_17.json")
BUCKET = "creature-images"
UPLOADER = "user_f8551df6e129"            # the superadmin; every existing live creature is stored under it
COUNTRY = "PT"
LANGS = ("ar", "de", "es", "fr", "hi", "it", "pt", "ru", "zh")
COLOURS = ("blue", "green", "yellow", "red")
PROD_API = "https://class-of-happiness-production.up.railway.app/api"
MAX_BYTES = 8 * 1024 * 1024               # the upload endpoint's own cap
# The words 'zone' and 'regulation' must not appear in any language (hard fail).
BANNED = ("zone", "zona", "regulation", "régulation", "regulación", "regulação", "regulacao", "regulierung", "regolazione",
          "регуляц", "зона", "зоны", "зоне", "调节", "调控", "区域", "विनियमन", "नियमन", "क्षेत्र", "منطقة", "تنظيم")


def load_env():
    env = {}
    for line in open(os.path.join(REPO, "backend", ".env")):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
BASE = ENV["SUPABASE_URL"].rstrip("/")
KEY = ENV["SUPABASE_SERVICE_KEY"]


def http(method, url, body=None, headers=None, timeout=90):
    h = {"apikey": KEY, "Authorization": "Bearer " + KEY}
    h.update(headers or {})
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def rest(method, path, obj=None, prefer=None):
    h = {"Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    st, data = http(method, f"{BASE}/rest/v1/{path}", None if obj is None else json.dumps(obj).encode(), h)
    if st >= 300:
        raise RuntimeError(f"{method} {path} -> {st} {data[:300]!r}")
    return json.loads(data) if data else None


def public_url(path):
    return f"{BASE}/storage/v1/object/public/{BUCKET}/{path}"


def folder_name(name):
    return name.replace(" ", "-")


def obj_path(name, stage):
    return f"creatures/{UPLOADER}_stage{stage}_{hashlib.sha256(f'{name}|{stage}'.encode()).hexdigest()[:8]}.png"


def thumb_path(p):
    return p.rsplit(".", 1)[0] + "_thumb.png"


def local_files(name, stage):
    f = folder_name(name)
    d = os.path.join(ROOT, f)
    return os.path.join(d, f"{f}-stage{stage}.png"), os.path.join(d, f"{f}-stage{stage}_thumb.png")


def inspect_png(path, want_size=None, max_side=None):
    """Problems (list of strings) for one PNG file; [] when fine."""
    from PIL import Image
    if not os.path.isfile(path):
        return ["missing"]
    problems = []
    b = open(path, "rb").read()
    if not b.startswith(b"\x89PNG\r\n\x1a\n"):
        return ["not a PNG"]
    if len(b) > MAX_BYTES:
        problems.append("over 8 MB")
    im = Image.open(io.BytesIO(b))
    if getattr(im, "n_frames", 1) > 1:
        problems.append("animated")
    if want_size and im.size != want_size:
        problems.append(f"size {im.size[0]}x{im.size[1]}, expected {want_size[0]}x{want_size[1]}")
    if max_side and max(im.size) > max_side:
        problems.append(f"longest side {max(im.size)} > {max_side}")
    rgba = im.convert("RGBA")
    if rgba.getchannel("A").getextrema()[0] != 0:
        problems.append("no transparent pixels")
    return problems


def load_data():
    d = json.load(open(DATA))
    return d["creatures"], d.get("translations", {})


def check_text(creatures, translations):
    """(errors, missing_langs) - banned words anywhere, colours, duplicate names, name left untranslated."""
    errs = []
    names = [c["name"].lower() for c in creatures]
    if len(set(names)) != len(names):
        errs.append("duplicate creature names in creatures_17.json")
    for c in creatures:
        if c["colour"] not in COLOURS:
            errs.append(f"{c['name']}: bad colour {c['colour']!r}")
        texts = {"en": c["en"], **{l: (translations.get(c["name"], {}) or {}).get(l, "") for l in LANGS}}
        for lang, t in texts.items():
            low = t.lower()
            for w in BANNED:
                if w in low:
                    errs.append(f"{c['name']} [{lang}]: contains banned word {w!r}")
            if t and c["name"].lower() not in low:
                errs.append(f"{c['name']} [{lang}]: creature name not found in the text (names stay untranslated)")
        if len(c["en"]) > 200:
            errs.append(f"{c['name']}: English description over 200 characters")
    missing = sorted({c["name"] for c in creatures for l in LANGS if not (translations.get(c["name"], {}) or {}).get(l)})
    return errs, missing


def submission_code(name):
    """creature_submissions.submission_code is varchar(8) (the B2 codes are 8 characters): name upper-cased, no spaces, cut to 8."""
    return name.upper().replace(" ", "")[:8]


def build_row(c, translations, urls):
    code = submission_code(c["name"])
    row = {
        "student_id": UPLOADER,
        "student_name": "Class of Happiness",
        "year_group": "",
        "school_name": "",
        "country": COUNTRY,
        "emotion_colour": c["colour"],
        "creature_name": c["name"],
        "description": c["en"],
        "stage1_url": urls[0], "stage2_url": urls[1], "stage3_url": urls[2], "stage4_url": urls[3],
        "submission_code": code,
        "status": "approved",
        "visibility_scope": "global",
    }
    for l in LANGS:
        t = (translations.get(c["name"], {}) or {}).get(l)
        if t:
            row[f"description_{l}"] = t
    return row


def plan(creatures, translations):
    out = []
    for c in creatures:
        paths = [obj_path(c["name"], s) for s in (1, 2, 3, 4)]
        files = []
        for s in (1, 2, 3, 4):
            img, th = local_files(c["name"], s)
            files.append({"stage": s, "image": img, "thumb": th, "object": paths[s - 1], "thumb_object": thumb_path(paths[s - 1]),
                          "image_problems": inspect_png(img, (1024, 1024)), "thumb_problems": inspect_png(th, None, 200)})
        out.append({"c": c, "files": files, "row": build_row(c, translations, [public_url(p) for p in paths])})
    return out


def existing_state(creatures):
    rows = rest("GET", "creature_submissions?select=id,creature_name,status,submission_code") or []
    have = {r["creature_name"].strip().lower(): r for r in rows}
    clash = [c["name"] for c in creatures if c["name"].lower() in have]
    codes = [submission_code(c["name"]) for c in creatures]
    taken = {(r.get("submission_code") or "").upper() for r in rows} | \
            {(r.get("code") or "").upper() for r in (rest("GET", "submission_codes?select=code") or [])}
    clash += [f"code {k} (in use)" for k in codes if k in taken]
    clash += [f"code {k} (duplicated in this batch)" for k in sorted({k for k in codes if codes.count(k) > 1})]
    return rows, clash


def object_exists(path):
    st, _ = http("HEAD", public_url(path))
    return st == 200


def report(items, clash, errs, missing_langs):
    n_files = sum(len(i["files"]) * 2 for i in items)
    bad = [(i["c"]["name"], f["stage"], k, p) for i in items for f in i["files"]
           for k, ps in (("image", f["image_problems"]), ("thumb", f["thumb_problems"])) for p in ps]
    print(f"Source folder: {ROOT}  ({'found' if os.path.isdir(ROOT) else 'NOT FOUND'})")
    print(f"{'#':>2} {'name':<12} {'colour':<7} files  object (stage 1)")
    for n, i in enumerate(items, 1):
        probs = sum(len(f["image_problems"]) + len(f["thumb_problems"]) for f in i["files"])
        ok = 8 - sum(1 for f in i["files"] for k in ("image_problems", "thumb_problems") if f[k])
        print(f"{n:>2} {i['c']['name']:<12} {i['c']['colour']:<7} {ok}/8   {i['files'][0]['object']}")
    print(f"\nFiles expected: {n_files}; with a problem: {len(bad)}")
    for b in bad[:12]:
        print("   ", b)
    if len(bad) > 12:
        print(f"    ... and {len(bad) - 12} more")
    print(f"Names already in creature_submissions: {clash or 'none'}")
    print(f"Text errors: {errs or 'none'}")
    print(f"Creatures still missing translations: {len(missing_langs)} of {len(items)}")
    return bad


def do_apply(items, translations):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    result_path = os.path.join(HERE, f"creatures_17_result_{stamp}.json")
    result = {"uploaded": [], "rows": []}
    save = lambda: json.dump(result, open(result_path, "w"), indent=1)
    try:
        for i in items:
            for f in i["files"]:
                for local, remote in ((f["image"], f["object"]), (f["thumb"], f["thumb_object"])):
                    b = open(local, "rb").read()
                    st, data = http("POST", f"{BASE}/storage/v1/object/{BUCKET}/{remote}", b,
                                    {"Content-Type": "image/png", "x-upsert": "false", "cache-control": "max-age=3600"})
                    if st >= 300:
                        raise RuntimeError(f"upload {remote} -> {st} {data[:200]!r}")
                    result["uploaded"].append(remote)
                    save()
        for i in items:
            created = rest("POST", "creature_submissions", i["row"], prefer="return=representation")
            result["rows"].append({"id": created[0]["id"], "name": i["c"]["name"]})
            save()
    except Exception as e:
        print(f"\nSTOPPED: {e}\nNothing further was written. Partial result: {result_path}\nUndo with: --rollback {result_path}")
        save()
        sys.exit(1)
    print(f"\nUploaded {len(result['uploaded'])} files, inserted {len(result['rows'])} rows.\nResult file: {result_path}")
    # byte-for-byte verification of what is now served
    bad = 0
    for i in items:
        for f in i["files"]:
            for local, remote in ((f["image"], f["object"]), (f["thumb"], f["thumb_object"])):
                st, data = http("GET", public_url(remote))
                if st != 200 or data != open(local, "rb").read():
                    bad += 1
                    print("  MISMATCH", remote, st)
    print("Served bytes identical to the source files." if not bad else f"{bad} served files differ!")
    for r in result["rows"]:
        print(f"  {r['id']}  {r['name']}")


def latest_result():
    files = sorted(glob.glob(os.path.join(HERE, "creatures_17_result_*.json")))
    if not files:
        sys.exit("No result file found - run --apply first.")
    return files[-1]


def do_approve(result_file):
    result = json.load(open(result_file))
    token = "test_" + uuid.uuid4().hex
    rest("POST", "user_sessions", {"session_token": token, "user_id": UPLOADER,
                                   "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()})
    try:
        for r in result["rows"]:
            body = json.dumps({"action": "approve", "visibility_scope": "global"}).encode()
            st, data = http("POST", f"{PROD_API}/creatures/global-approve/{r['id']}", body,
                            {"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
            print(f"  {r['name']:<12} {st} {data[:120]!r}")
            if st != 200:
                print("  stopped on the first failure.")
                break
    finally:
        http("DELETE", f"{BASE}/rest/v1/user_sessions?session_token=eq.{token}")
        print("Temporary superadmin session deleted.")


def do_rollback(result_file):
    result = json.load(open(result_file))
    for r in result.get("rows", []):
        rest("DELETE", f"creature_submissions?id=eq.{r['id']}")
    objs = result.get("uploaded", [])
    for k in range(0, len(objs), 50):
        st, data = http("DELETE", f"{BASE}/storage/v1/object/{BUCKET}", json.dumps({"prefixes": objs[k:k + 50]}).encode(),
                        {"Content-Type": "application/json"})
        if st >= 300:
            print("storage delete problem", st, data[:200])
    print(f"Removed {len(result.get('rows', []))} rows and {len(objs)} storage objects.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--approve", action="store_true")
    ap.add_argument("--rollback")
    a = ap.parse_args()
    if a.rollback:
        return do_rollback(a.rollback)
    if a.approve:
        return do_approve(latest_result())
    creatures, translations = load_data()
    errs, missing_langs = check_text(creatures, translations)
    items = plan(creatures, translations)
    _, clash = existing_state(creatures)
    if a.only:
        items_view = [i for i in items if i["c"]["name"].lower() == a.only.lower()]
        if not items_view:
            sys.exit(f"No such creature: {a.only}")
        i = items_view[0]
        print(json.dumps({"row_to_insert (descriptions in other languages are added after review)": i["row"]}, indent=2, ensure_ascii=False))
        print("\nstorage objects (bucket creature-images):")
        for f in i["files"]:
            print(f"  stage {f['stage']}: {f['object']}   thumb: {f['thumb_object']}")
            print(f"           from {f['image']}\n           and  {f['thumb']}")
    bad = report(items, clash, errs, missing_langs)
    if not a.apply:
        print("\nDRY RUN - nothing was written.")
        return
    if bad or clash or errs or missing_langs:
        sys.exit("\nNot applying: fix the problems above first (files, name clashes, text, translations).")
    taken = [f["object"] for i in items for f in i["files"] if object_exists(f["object"])]
    if taken:
        sys.exit(f"\nNot applying: {len(taken)} storage objects already exist, e.g. {taken[0]}")
    do_apply(items, translations)


if __name__ == "__main__":
    main()
