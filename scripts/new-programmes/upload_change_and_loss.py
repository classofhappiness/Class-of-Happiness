"""Upload the 25 "Change and Loss" PDFs as GLOBAL resources (Nov 2026). INSERT ONLY: nothing is updated or deleted.

Source: ONLY ~/Desktop/COH Redesign/Change-and-Loss/ (25 PDFs + COH-resource-guide-Change-and-Loss-rows.xlsx).
Never ~/Desktop/Change and Loss/ (third-party reference PDFs) - the script refuses any path outside the source folder.

Rules (agreed Nov 18):
  * topic = category = change_and_loss, content_type pdf, is_global true, school_admin_id null, is_active true,
    user_id = the superadmin (same as the Leader Online rows), no created_by. description = title.
  * order_index = the spreadsheet row number (1..25). ages 5-11. minutes from the sheet (activities only).
  * week_number from the sheet (-1 = Start here). Goal sheet and Award are week 6, Book swap-in guide week 4.
  * audience: Teachers -> teachers, Both -> both (checked against the allowed list BEFORE any write).
  * grouping = whole_class for the 18 activities, none for the other 7 rows.
  * use_when on the Week 5 activities = the family-letter sentence below.
  * titles are fixed in TITLES below (the spreadsheet's lower-case / hyphen-less titles are corrected on purpose).
  * COH-CL-W3-Goodbye-jar.pdf must hash to 00ec437f19ff0e79... (the final 5-page version) or the script stops.
Guards (any failure = stop, nothing written): exactly 25 PDFs in the folder and 25 sheet rows with the same filenames;
no existing change_and_loss row; no filename or title already used by ANY resource; every file opens, is <= 10 MB and has
the page count the sheet says; audience / grouping valid.
Per row: previews built in memory first (PDF pages 2-4 -> page_order 1-3; a 1-page PDF uses page 1), then insert the row,
then its previews, then the id goes into the results file. Stops at the first failure, retries nothing.
Dry run by default; --apply writes. Uses backend/.env.
"""
import base64, datetime, hashlib, io, json, os, sys, time, uuid
import fitz
import openpyxl
from dotenv import dotenv_values
from PIL import Image
from supabase import create_client

SRC = os.path.realpath(os.path.expanduser('~/Desktop/COH Redesign/Change-and-Loss')) + os.sep
XLSX = SRC + 'COH-resource-guide-Change-and-Loss-rows.xlsx'
TOPIC = 'change_and_loss'
OWNER = 'user_f8551df6e129'  # jono@classofhappiness.com (superadmin), same user_id the Leader Online rows carry
AGE_MIN, AGE_MAX = 5, 11
WIDTH, QUALITY = 600, 72
MAX_BYTES = 10 * 1024 * 1024
ALLOWED_AUDIENCES = ('teachers', 'parents', 'both')                  # same list as backend RESOURCE_AUDIENCES
AUDIENCE_MAP = {'teachers': 'teachers', 'teacher': 'teachers', 'both': 'both', 'parents': 'parents', 'parent': 'parents'}
GROUPING_CODES = ('individual', 'small_group', 'whole_class')        # same codes as backend RESOURCE_GROUPING_CODES
WEEK5_USE_WHEN = 'Run after the family letter has gone home. Children can pass at any time.'
GOODBYE_JAR = ('COH-CL-W3-Goodbye-jar.pdf', '00ec437f19ff0e79')
TITLES = {
    'COH-CL-Program-overview.pdf': 'Change and Loss: program overview',
    'COH-CL-Family-pack.pdf': 'Change and Loss: Family pack',
    'COH-CL-Weekly-feelings-pages.pdf': 'Change and Loss: weekly feelings pages',
    'COH-Class-Register-Change-and-Loss.pdf': 'Change and Loss: class register',
    'COH-CL-W1-Change-body-check.pdf': 'Change body check',
    'COH-CL-W1-Change-map.pdf': 'Change map',
    'COH-CL-W1-Feelings-fishing.pdf': 'Feelings fishing',
    'COH-CL-W2-My-first-day-plan.pdf': 'My first-day plan',
    'COH-CL-W2-New-place-kit.pdf': 'New-place kit',
    'COH-CL-W2-What-I-know-what-I-wonder.pdf': 'What I know, what I wonder',
    'COH-CL-W3-Goodbye-card.pdf': 'Goodbye card',
    'COH-CL-W3-Goodbye-jar.pdf': 'Goodbye jar',
    'COH-CL-W3-Staying-in-touch.pdf': 'Staying in touch',
    'COH-CL-W4-Book-swap-in-guide.pdf': 'Change and Loss: Book swap-in guide',
    'COH-CL-W4-Characters-and-change.pdf': 'Characters and change',
    'COH-CL-W4-Lend-a-blanket.pdf': 'Lend a blanket',
    'COH-CL-W4-What-helped.pdf': 'What helped?',
    'COH-CL-W5-Feelings-come-in-waves.pdf': 'Feelings come in waves',
    'COH-CL-W5-My-memory-box.pdf': 'My memory box',
    'COH-CL-W5-Plain-words-about-death.pdf': 'Plain words about death',
    'COH-CL-W6-Calm-body-toolkit.pdf': 'Calm-body toolkit',
    'COH-CL-Award.pdf': 'Change and Loss: award',
    'COH-CL-Goal-sheet.pdf': 'Change and Loss: goal sheet',
    'COH-CL-W6-My-supports-map.pdf': 'My supports map',
    'COH-CL-W6-Our-change-promises.pdf': 'Our change promises',
}
env = dotenv_values(os.path.join(os.path.dirname(__file__), '..', '..', 'backend', '.env'))
try:
    from supabase.lib.client_options import SyncClientOptions
    sb = create_client(env['SUPABASE_URL'], env['SUPABASE_SERVICE_KEY'], options=SyncClientOptions(postgrest_client_timeout=120))   # longer per-request timeout
except Exception:
    sb = create_client(env['SUPABASE_URL'], env['SUPABASE_SERVICE_KEY'])
apply = '--apply' in sys.argv
resume = '--resume' in sys.argv            # skip rows already in the database (after verifying them); insert only the rest
verify_only = '--verify-only' in sys.argv  # read only: verify the rows already in the database, then exit
PAUSE_SECONDS = 1


def stop(msg):
    sys.exit('STOPPING (nothing written): ' + msg)


def txt(v):
    v = str(v).strip() if v is not None else ''
    return v or None


def num(v):
    return int(float(v)) if txt(v) else None


def previews_for(path, resource_id):
    """Same rule as generate_previews.py: PDF pages 2-4 become page_order 1-3 (page 1 of a 1-page PDF if that is all there is)."""
    doc = fitz.open(path)
    out = []
    for n, i in enumerate([0] if len(doc) == 1 else range(1, min(4, len(doc))), start=1):
        z = WIDTH / doc[i].rect.width
        pix = doc[i].get_pixmap(matrix=fitz.Matrix(z, z))
        buf = io.BytesIO()
        Image.frombytes('RGB', (pix.width, pix.height), pix.samples).save(buf, format='JPEG', quality=QUALITY, optimize=True)
        out.append({'resource_id': resource_id, 'page_order': n, 'image': base64.b64encode(buf.getvalue()).decode()})
    return out


def preview_count(path):
    n = len(fitz.open(path))
    return 1 if n == 1 else min(3, n - 1)


# ---------------- pre-flight (read only) ----------------
if not os.path.isdir(SRC):
    stop(f'source folder missing: {SRC}')
folder_pdfs = sorted(f for f in os.listdir(SRC) if f.lower().endswith('.pdf'))
if len(folder_pdfs) != 25:
    stop(f'expected 25 PDFs in {SRC}, found {len(folder_pdfs)}')
ws = openpyxl.load_workbook(XLSX)['Change and Loss']
head = [c.value for c in ws[1]]
sheet = [dict(zip(head, v)) for v in ws.iter_rows(min_row=2, values_only=True) if txt(v[3])]
if len(sheet) != 25 or {txt(r['Filename']) for r in sheet} != set(folder_pdfs) or set(TITLES) != set(folder_pdfs):
    stop('the 25 spreadsheet rows, the 25 PDFs and the TITLES table do not list the same filenames')

existing = []
off = 0
while True:
    page = sb.table('resources').select('id,title,pdf_filename,topic,category').range(off, off + 999).execute().data
    existing += page
    off += 1000
    if len(page) < 1000:
        break
cl_existing = [r for r in existing if TOPIC in (r.get('topic'), r.get('category'))]
if cl_existing and not (resume or verify_only):
    stop(f'{TOPIC} rows already exist (use --resume to continue an interrupted upload)')
if cl_existing and not set(r['pdf_filename'] for r in cl_existing) <= set(folder_pdfs):
    stop('a change_and_loss row in the database has a filename that is not one of the 25 planned PDFs')
others = [r for r in existing if r not in cl_existing]
used_fn = {r['pdf_filename'] for r in others}
used_title = {r['title'] for r in others}

planned, errors = [], []
for n, r in enumerate(sheet, start=1):
    fn = txt(r['Filename'])
    path = os.path.realpath(SRC + fn)
    try:
        if not path.startswith(SRC):
            raise ValueError('path outside the source folder')
        if not os.path.isfile(path):
            raise ValueError('missing PDF')
        size = os.path.getsize(path)
        if size > MAX_BYTES:
            raise ValueError('over 10 MB')
        raw = open(path, 'rb').read()
        sha = hashlib.sha256(raw).hexdigest()
        if fn == GOODBYE_JAR[0] and not sha.startswith(GOODBYE_JAR[1]):
            raise ValueError(f'Goodbye jar hash {sha[:16]} is not the final version ({GOODBYE_JAR[1]}...)')
        pages = len(fitz.open(path))
        if txt(r['Pages']) and pages != num(r['Pages']):
            raise ValueError(f'sheet says {r["Pages"]} pages, the PDF has {pages}')
        kind = txt(r['Document type'])
        is_activity = kind == 'Activity'
        week = num(r['Week (-1 = Start here)'])
        aud = AUDIENCE_MAP.get((txt(r['Audience']) or '').lower())
        if aud not in ALLOWED_AUDIENCES:
            raise ValueError(f'audience {r["Audience"]!r} not allowed')
        grouping = 'whole_class' if is_activity else None
        if grouping and grouping not in GROUPING_CODES:
            raise ValueError('grouping not allowed')
        if is_activity and num(r['Minutes']) is None:
            raise ValueError('activity without minutes')
        title = TITLES[fn]
        if fn in used_fn:
            raise ValueError('pdf_filename already used by an existing resource')
        if title in used_title:
            raise ValueError('title already used by an existing resource')
        data = dict(title=title, description=title, content_type='pdf', pdf_filename=fn, category=TOPIC, topic=TOPIC,
                    target_audience=aud, is_global=True, is_active=True, school_admin_id=None, user_id=OWNER,
                    week_number=week, order_index=n, age_min=AGE_MIN, age_max=AGE_MAX, duration_minutes=num(r['Minutes']),
                    grouping=grouping, use_when=WEEK5_USE_WHEN if (is_activity and week == 5) else None)
        planned.append(dict(path=path, sha=sha, size=size, pages=pages, previews=preview_count(path), data=data))
    except Exception as e:
        errors.append(f'#{n} {fn}: {e}')
if len({p['data']['pdf_filename'] for p in planned}) != len(planned) or len({p['data']['title'] for p in planned}) != len(planned):
    errors.append('duplicate filename or title inside the 25 rows')
if errors:
    stop('\n  ' + '\n  '.join(errors))

have = {r['pdf_filename'] for r in cl_existing}
todo = [p for p in planned if p['data']['pdf_filename'] not in have]


def verify_existing():
    """Read back every change_and_loss row already stored and compare it with the plan. Returns a list of mismatches."""
    bad = []
    by_fn = {p['data']['pdf_filename']: p for p in planned}
    for r in cl_existing:
        fn = r['pdf_filename']
        row = sb.table('resources').select('*').eq('id', r['id']).execute().data[0]
        p = by_fn[fn]
        exp = p['data']
        for k in ('title', 'description', 'content_type', 'pdf_filename', 'category', 'topic', 'target_audience', 'is_global', 'is_active',
                  'school_admin_id', 'user_id', 'week_number', 'order_index', 'age_min', 'age_max', 'duration_minutes', 'grouping', 'use_when'):
            if row.get(k) != exp[k]:
                bad.append(f'{fn}: {k} is {row.get(k)!r}, plan says {exp[k]!r}')
        c = row.get('content') or ''
        try:
            stored = hashlib.sha256(base64.b64decode(c.split(',', 1)[1])).hexdigest() if c.startswith('data:application/pdf;base64,') else None
        except Exception:
            stored = None
        if stored != p['sha']:
            bad.append(f'{fn}: stored PDF sha256 {str(stored)[:16]} does not match the source file {p["sha"][:16]}')
        n = len(sb.table('resource_previews').select('page_order').eq('resource_id', r['id']).execute().data or [])
        if n != p['previews']:
            bad.append(f'{fn}: {n} previews stored, plan says {p["previews"]}')
        print(f"  verified #{row['order_index']:>2} {row['title'][:36]:36} wk={row['week_number']} {row['target_audience']:8} grp={row['grouping']} "
              f"ages={row['age_min']}-{row['age_max']} active={row['is_active']} previews={n} sha={'ok' if stored == p['sha'] else 'MISMATCH'} use_when={'Y' if row['use_when'] else '-'}")
    return bad


print(f'source: {SRC}')
print(f'existing resources: {len(existing)} (none touched) | existing {TOPIC}: {len(cl_existing)} | to insert: {len(todo)} | previews to build: {sum(p["previews"] for p in todo)}')
if cl_existing:
    print(f'verifying the {len(cl_existing)} rows already in the database:')
    problems = verify_existing()
    if problems:
        stop('verification of the existing rows FAILED:\n  ' + '\n  '.join(problems))
    print('  all existing rows match the plan (fields, stored PDF sha256 and preview count)')
if verify_only:
    sys.exit(0)
for p in todo:
    d = p['data']
    print(f"  #{d['order_index']:>2} wk={d['week_number']:>2} {d['target_audience']:8} {d['title'][:40]:40} {d['pdf_filename']:40} "
          f"{d['age_min']}-{d['age_max']} {str(d['duration_minutes'] or '-'):>2}min {str(d['grouping'] or '-'):11} prev={p['previews']} "
          f"{p['size'] // 1024:>3}KB sha={p['sha'][:12]}{' use_when=Y' if d['use_when'] else ''}")
if not apply:
    print('(dry run - nothing written)')
    sys.exit(0)

# ---------------- apply ----------------
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
result_path = os.path.join(os.path.dirname(__file__), f'change_and_loss_result_{stamp}.json')
result = {'topic': TOPIC, 'started': stamp, 'source': SRC, 'inserted': [], 'failed': None}


def save():
    with open(result_path, 'w') as f:
        json.dump(result, f, indent=2)


save()
for p in todo:
    d = dict(p['data'], id=str(uuid.uuid4()), created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
             content='data:application/pdf;base64,' + base64.b64encode(open(p['path'], 'rb').read()).decode())
    try:
        time.sleep(PAUSE_SECONDS)
        # a previous attempt may have succeeded before a timeout: never insert a filename that is already stored
        if sb.table('resources').select('id').eq('pdf_filename', d['pdf_filename']).execute().data:
            result.setdefault('already_present', []).append(d['pdf_filename'])
            save()
            print('already present, skipped', d['pdf_filename'])
            continue
        prev = previews_for(p['path'], d['id'])          # in memory first
        out = sb.table('resources').insert(d).execute()
        if not out.data or out.data[0].get('id') != d['id']:
            raise RuntimeError(f'insert returned {out.data!r}')
        rec = {'id': d['id'], 'title': d['title'], 'pdf_filename': d['pdf_filename'], 'sha256': p['sha'], 'previews': 0}
        result['inserted'].append(rec)
        save()
        sb.table('resource_previews').insert(prev).execute()
        rec['previews'] = len(prev)
        save()
    except Exception as e:
        result['failed'] = {'pdf_filename': d['pdf_filename'], 'error': str(e)[:300]}
        # no blind retry: look at what the database holds for this row (and for orphan previews), report it, stop
        try:
            found = sb.table('resources').select('id,title').eq('pdf_filename', d['pdf_filename']).execute().data
            attempted = [d['id']] + [f['id'] for f in found]
            orphans = sb.table('resource_previews').select('resource_id,page_order').in_('resource_id', attempted).execute().data
            result['failed']['db_row_found'] = found
            result['failed']['previews_found_for_attempt'] = len(orphans or [])
            print(f"DB check for {d['pdf_filename']}: row present={bool(found)} {found} | previews for this attempt={len(orphans or [])}")
        except Exception as e2:
            result['failed']['db_check_error'] = str(e2)[:200]
            print(f'could not check the database after the failure: {e2}')
        save()
        sys.exit(f"STOPPED at {d['pdf_filename']}: {e}\nInserted so far: {len(result['inserted'])} (ids in {result_path}). Nothing retried.")
    print('inserted', d['id'], d['title'])
print(f'INSERTED {len(result["inserted"])} rows, {sum(r["previews"] for r in result["inserted"])} previews -> results: {result_path}')
