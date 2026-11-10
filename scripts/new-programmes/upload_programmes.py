"""Upload the You Are What You Eat and COH Entrepreneur PDFs as GLOBAL resources (Nov 2026).

Reads each programme's ROWS xlsx + PDF folder. Matches existing rows by pdf_filename (per topic) so a
re-run never double-inserts. Rows: school_admin_id NULL, is_global true, category = topic = programme id.
Dry run by default; pass --apply to write. Uses backend/.env (SUPABASE_URL, SUPABASE_SERVICE_KEY).
"""
import base64, datetime, os, sys, uuid
import openpyxl
from dotenv import dotenv_values
from supabase import create_client

H = os.path.expanduser('~/Desktop/')
NAMES = {'you_are_what_you_eat': 'You Are What You Eat', 'coh_entrepreneur': 'COH Entrepreneur'}
PROGRAMMES = [
    ('you_are_what_you_eat', H + 'You are what you eat/Files/COH-resource-guide-You-Are-What-You-Eat-ROWS.xlsx',
     H + 'You are what you eat/Files/You-Are-What-You-Eat-ALL-PDFs/'),
    ('coh_entrepreneur', H + 'COH Entrepreneur/COH-resource-guide-COH-Entrepreneur-ROWS.xlsx',
     H + 'COH Entrepreneur/COH-Entrepreneur-ALL-PDFs/'),
]
OWNER = 'user_f8551df6e129'  # jono@classofhappiness.com (superadmin), same user_id the existing global rows carry
GROUPING = {'individual': 'individual', 'small group': 'small_group', 'whole class': 'whole_class',
            'small group or whole class': 'small_group,whole_class',
            'individual or small group': 'individual,small_group'}
MAX_BYTES = 10 * 1024 * 1024
env = dotenv_values(os.path.join(os.path.dirname(__file__), '..', '..', 'backend', '.env'))
sb = create_client(env['SUPABASE_URL'], env['SUPABASE_SERVICE_KEY'])
apply = '--apply' in sys.argv


def txt(v):
    v = str(v).strip() if v is not None else ''
    return v or None


def num(v):
    return int(float(v)) if txt(v) else None


def week_for(row):
    title, doc, wk = row['Title'], row['Document type'] or '', txt(row['Week'])
    if wk:
        return int(float(wk))
    if doc.lower() == 'programme plan':
        return -1  # Program overview: always first
    return 0       # goal sheet, award, journal: Start here


planned, skipped, errors = [], 0, []
for topic, xlsx, pdfdir in PROGRAMMES:
    ws = openpyxl.load_workbook(xlsx).active
    head = [c.value for c in ws[1]]
    existing = {r['pdf_filename'] for r in sb.table('resources').select('pdf_filename').eq('topic', topic).execute().data}
    for n, vals in enumerate(ws.iter_rows(min_row=2, values_only=True), start=1):
        row = dict(zip(head, vals))
        if not txt(row['Title']):
            continue
        fn = txt(row['Source file (Desktop)'])
        path = pdfdir + fn
        if not os.path.isfile(path):
            errors.append(f'{topic}: missing PDF {fn}'); continue
        if os.path.getsize(path) > MAX_BYTES:
            errors.append(f'{topic}: {fn} over 10 MB'); continue
        if (row['Document type'] or '').lower() == 'programme plan':
            # Existing convention: '<Programme> Program description' (Emotions / Healthy Relationships / Leader Online)
            row['Title'] = f"{NAMES[topic]} Program description"
        g = txt(row['Grouping'])
        if g and g.lower() not in GROUPING:
            errors.append(f'{topic}: unknown grouping {g!r} ({fn})'); continue
        if fn in existing:
            skipped += 1; continue
        planned.append(dict(topic=topic, path=path, order_index=n, data=dict(
            title=txt(row['Title']), description=txt(row['Title']), content_type='pdf', pdf_filename=fn,
            category=topic, topic=topic, target_audience='both', is_global=True, is_active=True,
            school_admin_id=None, user_id=OWNER, week_number=week_for(row), order_index=n,
            age_min=num(row['Age min']), age_max=num(row['Age max']), duration_minutes=num(row['Minutes']),
            grouping=GROUPING[g.lower()] if g else None, goal=txt(row['Goal']), outcomes=txt(row['Outcomes']),
            use_when=txt(row['Need (use when…)']))))
if errors:
    sys.exit('STOPPING:\n' + '\n'.join(errors))

by = {}
for p in planned:
    by[p['topic']] = by.get(p['topic'], 0) + 1
print('to insert:', by or 0, '| already present (skipped):', skipped)
for p in planned:
    d = p['data']
    print(f"  {d['topic'][:4]} wk={d['week_number']:>2} {d['title'][:38]:38} {d['pdf_filename'][:34]:34} "
          f"{d['age_min']}-{d['age_max']} {d['duration_minutes']}min {d['grouping']}")
if apply:
    for p in planned:
        d = dict(p['data'], id=str(uuid.uuid4()), created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                 content='data:application/pdf;base64,' + base64.b64encode(open(p['path'], 'rb').read()).decode())
        sb.table('resources').insert(d).execute()
    print('INSERTED', len(planned))
else:
    print('(dry run - nothing written)')
