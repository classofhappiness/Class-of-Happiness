#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Curriculum map import.

  python3 import_curriculum_links.py            DRY RUN (default): reads the database, writes nothing to it.
  python3 import_curriculum_links.py --apply    writes resources.curriculum_links and inserts curriculum_statements.

Inputs: ~/Desktop/curriculum-map-data/data.json (codes per activity, proposals already merged in as `proposed`) and
statements.json (statement text per framework and code). data.json is never edited: England DfE codes are normalised here.

What --apply may write (nothing else, ever):
  * resources.curriculum_links  - only for rows matched below, only while the stored value is empty ('{}' / null).
                                  A row that already holds different links is NEVER overwritten: the run stops and reports it.
  * curriculum_statements       - insert-only. A (framework, code) that already exists is left exactly as it is.
It never updates or deletes anything else, never touches pdf content, titles, weeks, audiences or any other column.

Guards (apply refuses to start unless all hold; each failure is reported, not worked around):
  - the migration has been run (resources.curriculum_links and curriculum_statements both exist);
  - the matching result is exactly the expected one (every activity matched, none unmatched or ambiguous, no two activities
    on one row, every override target found);
  - the active resources row count is what the dry run saw.
During apply: one row at a time, 1 s pause, 120 s timeout, read-back verification after every write, results file written after
every step (previous value recorded for rollback). A failure or a mismatch STOPS the run: it looks the row up, reports, and
does not retry. Re-running --apply resumes safely (rows already equal to the target are recorded as already_set).
Rollback = set curriculum_links back to the `previous` value (always '{}') for each id in the results file; statements inserted
are listed by (framework, code) in the same file.

Matching, in order, for each activity (never guesses; ambiguity is reported):
  1. explicit OVERRIDES below (activity id -> pdf_filename);
  2. pdf_filename: Change and Loss from the sheet's Filename column, every other programme through resource-metadata.csv
     (programme + week + title -> pdf_filename);
  3. title + programme (normalised).
"""
import csv, json, os, re, sys, time, unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from dotenv import dotenv_values
import openpyxl
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions

APPLY = '--apply' in sys.argv
if any(a not in ('--apply',) for a in sys.argv[1:]):
    sys.exit('Unknown argument. Usage: import_curriculum_links.py [--apply]')

HOME = os.path.expanduser('~')
DATA_DIR = os.path.join(HOME, 'Desktop', 'curriculum-map-data')
GUIDE_CSV = os.path.join(HOME, 'Desktop', 'COH Redesign', 'resource-data', 'resource-metadata.csv')
CL_XLSX = os.path.join(HOME, 'Desktop', 'COH Redesign', 'Change-and-Loss', 'COH-resource-guide-Change-and-Loss-rows.xlsx')
HERE = os.path.dirname(os.path.abspath(__file__))
ENV = os.path.join(HERE, '..', '..', 'backend', '.env')
FRAMEWORKS = ['england_dfe', 'england_pshe', 'scotland', 'wales', 'ni', 'australia', 'cambridge', 'portugal', 'casel']
TOPIC = {'Emotions': 'emotions_program', 'Healthy Relationships': 'healthy_relationships',
         'Leader Online': 'leader_online', 'Change and Loss': 'change_and_loss'}
OVERRIDES = {'g5': 'HR-Extra-My-Body-Bubble.pdf',        # "My Body Bubble": guide says Emotions, the database row is Healthy Relationships
             'g55': 'Leader-Online-Wk1-Tape-art.pdf'}    # "Tape spray art": database title is "Tape art"
EXPECT_ACTIVITIES, PAUSE_SECONDS, STATEMENT_BATCH = 98 + 59, 1, 25   # 98 guide activities + 59 new-row proposals (matched by database id)

# Phase 2: statement text clean-ups for parse leftovers in statements.json (statements.json itself is never edited).
# Each entry is (framework, code) -> (old text, clean text). An entry only applies while the stored text still equals `old`
# exactly; if statements.json changes, the importer says so instead of guessing.
STATEMENT_FIXES = {
    ('england_pshe', 'KS2 H24'): ('problem-solving strategies for dealing with emotions, challenges and change, including the transition to new schools ng and changing',
                                  'problem-solving strategies for dealing with emotions, challenges and change, including the transition to new schools'),
    ('england_pshe', 'KS2 R29'): ('where to get advice and report concerns if worried about their own or someone else\u2019s personal safety (including online) elf and others',
                                  'where to get advice and report concerns if worried about their own or someone else\u2019s personal safety (including online)'),
    ('england_pshe', 'KS1 R20'): ('what to do if they feel unsafe or worried for themselves or others; who to ask for help and vocabulary to use when asking for help; importance of keeping trying until they are heard Respecting se',
                                  'what to do if they feel unsafe or worried for themselves or others; who to ask for help and vocabulary to use when asking for help; importance of keeping trying until they are heard'),
    ('england_pshe', 'KS2 H14'): ('how and when to seek support, including which adults to speak to in and outside school, if they are worried about their health health',
                                  'how and when to seek support, including which adults to speak to in and outside school, if they are worried about their health'),
    ('england_pshe', 'KS2 L16'): ('about how text and images in the media and on social media can be manipulated or invented; strategies to evaluate the reliability of sources and identify misinformation lbeing: Money',
                                  'about how text and images in the media and on social media can be manipulated or invented; strategies to evaluate the reliability of sources and identify misinformation'),
    ('england_pshe', 'KS2 R31'): (None, None),   # footer "\u00a9 PSHE Association 2020 | 16" removed by suffix rule below
    ('england_pshe', 'KS2 R34'): (None, None),   # footer "\u00a9 PSHE Association 2020 | 17" removed by suffix rule below
}
FOOTER_RE = re.compile(r'\s*\u00a9 PSHE Association 2020 \| \d+\s*$')
SOURCE = 'COH curriculum map data (curriculum-map-data/statements.json)'

def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)

REWRITES = Counter()
def norm_code(fw, code):
    """England DfE only: 'GW GW 5' -> 'GW 5'; mixed prefixes keep the LAST prefix token ('GW SAFE 7' -> 'SAFE 7')."""
    if fw != 'england_dfe':
        return code
    t = code.split()
    if len(t) >= 3 and t[-1].isdigit() and all(x.isalpha() for x in t[:-1]):
        new = '%s %s' % (t[-2], t[-1])
        if new != code:
            REWRITES[(code, new)] += 1
        return new
    return code

RANGE_RE = re.compile(r'^(.*?)(\d+)\s*[-\u2013]\s*(\d+)$')   # a trailing numbered range such as 01-03
RANGE_EXPANSIONS, RANGE_SEEN = Counter(), defaultdict(set)
def expand_code(fw, code):
    """Cambridge only: '123Ui.01-03' -> ['123Ui.01', '123Ui.02', '123Ui.03'] (same prefix, same zero padding).
    A range-style code in any OTHER framework is left as it is and listed in the report instead."""
    m = RANGE_RE.match(code)
    if not m:
        return [code]
    RANGE_SEEN[fw].add(code)
    if fw != 'cambridge':
        return [code]
    prefix, lo, hi = m.group(1), m.group(2), m.group(3)
    a_, b_ = int(lo), int(hi)
    if b_ < a_ or b_ - a_ > 20:
        return [code]
    out = [prefix + str(n).zfill(len(lo)) for n in range(a_, b_ + 1)]
    RANGE_EXPANSIONS[(code, ' '.join(out))] += 1
    return out

def links_proposed_only(codes):
    """Every code proposed:true (proposals-new-rows.json); same normalisation / range splitting as links_for."""
    out = {}
    for fw in FRAMEWORKS:
        seen, items = set(), []
        for c in (codes or {}).get(fw) or []:
            for n in (norm_code(fw, x) for x in expand_code(fw, c)):
                if n not in seen:
                    seen.add(n); items.append({'code': n, 'proposed': True})
        if items: out[fw] = items
    return out

def links_for(a):
    prop = a.get('proposed') or {}
    out = {}
    for fw in FRAMEWORKS:
        codes = (a.get('codes') or {}).get(fw) or []
        pset = set(prop.get(fw) or []) | set((proposals_cl.get(a['id']) or {}).get(fw) or [])
        seen, items = set(), []
        for c in codes:
            for n in (x2 for x1 in expand_code(fw, c) for x2 in [norm_code(fw, x1)]):
                if n in seen:
                    continue
                seen.add(n)
                items.append({'code': n, 'proposed': (c in pset) or (n in pset)})
        if items:
            out[fw] = items
    return out

# ---- inputs (read only)
acts = json.load(open(os.path.join(DATA_DIR, 'data.json'), encoding='utf-8'))
stmts_raw = json.load(open(os.path.join(DATA_DIR, 'statements.json'), encoding='utf-8'))
stmts = {fw: {norm_code(fw, c): t for c, t in (stmts_raw.get(fw) or {}).items()} for fw in FRAMEWORKS}
FIX_LOG = []
for (fw, c), (old, new) in STATEMENT_FIXES.items():
    cur = stmts[fw].get(c)
    if cur is None:
        FIX_LOG.append((fw, c, 'MISSING', None, None)); continue
    if old is None:                                   # footer rule
        clean = FOOTER_RE.sub('', cur)
        if clean != cur: stmts[fw][c] = clean; FIX_LOG.append((fw, c, 'fixed', cur, clean))
        else: FIX_LOG.append((fw, c, 'NO MATCH', cur, None))
    elif cur == old: stmts[fw][c] = new; FIX_LOG.append((fw, c, 'fixed', cur, new))
    else: FIX_LOG.append((fw, c, 'NO MATCH', cur, None))
proposals_cl = json.load(open(os.path.join(DATA_DIR, 'proposals.json'), encoding='utf-8'))        # Change and Loss (+ g61): proposed
proposals_new = json.load(open(os.path.join(DATA_DIR, 'proposals-new-rows.json'), encoding='utf-8'))  # 59 new rows, by database id
cl_file = {}
wb = openpyxl.load_workbook(CL_XLSX, read_only=True, data_only=True)
rows = list(wb['Change and Loss'].iter_rows(values_only=True))
hdr = {h: i for i, h in enumerate(rows[0])}
for r in rows[1:]:
    if r[hdr['#']] is not None and r[hdr['Filename']]:
        cl_file['c%s' % r[hdr['#']]] = str(r[hdr['Filename']]).strip()
csv_by_prog_title = defaultdict(list)
for r in csv.DictReader(open(GUIDE_CSV, encoding='utf-8')):
    csv_by_prog_title[(r['programme'], norm(r['title']))].append(r)

e = dotenv_values(ENV)
sb = create_client(e['SUPABASE_URL'], e['SUPABASE_SERVICE_KEY'],
                   options=SyncClientOptions(postgrest_client_timeout=120))

def fetch_all(table, cols, flt=None):
    out, off = [], 0
    while True:
        q = sb.table(table).select(cols)
        if flt: q = flt(q)
        page = q.range(off, off + 999).execute().data
        out += page
        if len(page) < 1000: return out
        off += 1000

db = fetch_all('resources', 'id,title,topic,category,week_number,pdf_filename,description,is_active', lambda q: q.eq('is_active', True))
for r in db:
    r['_topic'] = r.get('topic') or r.get('category') or 'general'
by_file, by_topic_title = defaultdict(list), defaultdict(list)
for r in db:
    if r.get('pdf_filename'): by_file[r['pdf_filename']].append(r)
    by_topic_title[(r['_topic'], norm(r['title']))].append(r)

def probe(table, col):
    try:
        sb.table(table).select(col).limit(1).execute(); return True
    except Exception:
        return False
col_ok, tbl_ok = probe('resources', 'curriculum_links'), probe('curriculum_statements', 'framework')
existing_links = {}
if col_ok:
    for r in fetch_all('resources', 'id,curriculum_links', lambda q: q.eq('is_active', True)):
        existing_links[r['id']] = r.get('curriculum_links') or {}
existing_stmts = set()
if tbl_ok:
    existing_stmts = {(r['framework'], r['code']) for r in fetch_all('curriculum_statements', 'framework,code')}

# ---- match
results = []
for a in acts:
    topic = TOPIC[a['programme']]
    cands, how, fname = [], None, None
    if a['id'] in OVERRIDES:
        fname = OVERRIDES[a['id']]
        cands, how = by_file.get(fname, []), 'override'
    else:
        if a['id'].startswith('c'):
            fname = cl_file.get(a['id'])
        else:
            hits = csv_by_prog_title.get((a['programme'], norm(a['title'])), [])
            if a['week'] is not None:
                hits = [h for h in hits if str(h['week']).strip() == str(a['week'])] or hits
            names = {h['pdf_filename'] for h in hits if h['pdf_filename']}
            fname = next(iter(names)) if len(names) == 1 else None
        if fname:
            cands, how = [r for r in by_file.get(fname, []) if r['_topic'] == topic], 'pdf_filename'
        if not cands:
            cands = by_topic_title.get((topic, norm(a['title'])), [])
            how = 'title+programme' if cands else None
    status = 'matched' if len(cands) == 1 else ('ambiguous' if len(cands) > 1 else 'unmatched')
    results.append({'activity': a['id'], 'programme': a['programme'], 'week': a['week'], 'title': a['title'],
                    'status': status, 'how': how, 'guide_filename': fname, 'candidate_ids': [c['id'] for c in cands],
                    'resource_id': cands[0]['id'] if len(cands) == 1 else None,
                    'resource_title': cands[0]['title'] if len(cands) == 1 else None,
                    'links': links_for(a) if len(cands) == 1 else None})
# ---- Phase 2: new-row proposals, matched by database id (no filename matching)
db_by_id = {r['id']: r for r in db}
NEW_STATS = Counter()
for rid, p in proposals_new.items():
    row = db_by_id.get(rid)
    if not row:
        NEW_STATS['skipped_not_found_or_inactive'] += 1
        results.append({'activity': 'n:' + rid[:8], 'programme': p['topic'], 'week': p['week'], 'title': p['title'], 'status': 'unmatched',
                        'how': 'database id', 'guide_filename': None, 'candidate_ids': [], 'resource_id': None, 'resource_title': None, 'links': None})
        continue
    if row['_topic'] != p['topic']: NEW_STATS['topic_differs_from_db'] += 1
    NEW_STATS['matched'] += 1
    NEW_STATS['confidence_' + p['confidence']] += 1
    results.append({'activity': 'n:' + rid[:8], 'programme': p['topic'], 'week': p['week'], 'title': p['title'], 'status': 'matched',
                    'how': 'database id', 'guide_filename': None, 'candidate_ids': [rid], 'resource_id': rid,
                    'resource_title': row['title'], 'links': links_proposed_only(p['codes']),
                    'confidence': p['confidence'], 'note': p['note']})

target = Counter(r['resource_id'] for r in results if r['status'] == 'matched')
for r in results:
    if r['status'] == 'matched' and target[r['resource_id']] > 1:
        r['status'], r['how'], r['candidate_ids'], r['resource_id'], r['links'] = 'ambiguous', (r['how'] or '') + ' (shared)', [r['resource_id']], None, None
cnt = Counter(r['status'] for r in results)
matched_ids = {r['resource_id'] for r in results if r['status'] == 'matched'}
uncovered = [r for r in db if r['id'] not in matched_ids]

# ---- statements to write: every code used by an activity, plus every code in statements.json
used = defaultdict(set)
for r in results:
    for fw, items in (r['links'] or {}).items():
        used[fw].update(i['code'] for i in items)
wanted = {}
for fw in FRAMEWORKS:
    for c in sorted(used[fw] | set(stmts[fw])):
        wanted[(fw, c)] = stmts[fw].get(c)
no_text = {fw: sorted(c for (f, c), t in wanted.items() if f == fw and not t and c in used[fw]) for fw in FRAMEWORKS}
new_stmts = {k: v for k, v in wanted.items() if k not in existing_stmts}

stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
report = {'mode': 'APPLY' if APPLY else 'DRY RUN (nothing written to the database)', 'at': stamp,
          'activities': len(results), 'active_db_rows': len(db), 'counts': dict(cnt),
          'by_programme': {p: dict(Counter(r['status'] for r in results if r['programme'] == p)) for p in TOPIC},
          'new_rows': dict(NEW_STATS),
          'statement_fixes': [{'framework': f, 'code': c, 'status': st, 'old': o, 'new': n} for f, c, st, o, n in FIX_LOG],
          'how': dict(Counter(r['how'] for r in results if r['status'] == 'matched')),
          'matched_with_no_codes': sum(1 for r in results if r['status'] == 'matched' and not r['links']),
          'rewrites': [{'old': o, 'new': n, 'count': c} for (o, n), c in sorted(REWRITES.items())],
          'range_expansions': [{'old': o, 'new': n.split(), 'count': c} for (o, n), c in sorted(RANGE_EXPANSIONS.items())],
          'range_style_codes_seen': {fw: sorted(v) for fw, v in RANGE_SEEN.items()},
          'distinct_codes_used': {fw: len(used[fw]) for fw in FRAMEWORKS},
          'distinct_codes_without_statement': {fw: len(v) for fw, v in no_text.items()},
          'codes_without_statement': no_text,
          'statements_to_insert': len(new_stmts), 'statements_already_in_db': len(set(wanted) & existing_stmts),
          'migration_applied': {'resources.curriculum_links': col_ok, 'curriculum_statements': tbl_ok},
          'db_rows_not_covered': len(uncovered)}

def show(rep):
    print(rep['mode'])
    print('activities:', rep['activities'], '| active DB rows:', rep['active_db_rows'], '| counts:', rep['counts'], '| matched via:', rep['how'])
    for p, c in rep['by_programme'].items(): print('   ', p, c)
    print('matched but no codes (documents):', rep['matched_with_no_codes'])
    print('new-row proposals (by database id): %s' % rep['new_rows'])
    print('statement clean-ups: %s' % Counter(x['status'] for x in rep['statement_fixes']))
    print('migration applied:', rep['migration_applied'])
    print('England DfE rewrites (old -> new, count):')
    for w in rep['rewrites']: print('    %-14s -> %-10s x%d' % (w['old'], w['new'], w['count']))
    print('    total rewritten occurrences:', sum(w['count'] for w in rep['rewrites']), '| distinct rewrites:', len(rep['rewrites']))
    print('Cambridge range codes split:', [(w['old'], '->', ' '.join(w['new']), 'x%d' % w['count']) for w in rep['range_expansions']] or 'none')
    other = {fw: v for fw, v in rep['range_style_codes_seen'].items() if fw != 'cambridge'}
    print('range-style codes in other frameworks (left as they are):', other or 'none')
    print('distinct codes used per framework:', rep['distinct_codes_used'])
    print('distinct codes with NO statement text (will import with null statement):', rep['distinct_codes_without_statement'])
    for fw, v in rep['codes_without_statement'].items():
        if v: print('    %-13s %s' % (fw, ', '.join(v)))
    print('statements to insert:', rep['statements_to_insert'], '| already in db:', rep['statements_already_in_db'])
    print('active DB rows not covered by the guide files:', rep['db_rows_not_covered'])

if not APPLY:
    out = dict(report, results=results)
    json.dump(out, open(os.path.join(HERE, 'curriculum_dryrun_%s.json' % stamp), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(DATA_DIR, 'rows-needing-codes.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(['id', 'topic', 'week_number', 'title', 'description', 'pdf_filename'])
        for r in sorted(uncovered, key=lambda r: (r['_topic'], r['week_number'] if r['week_number'] is not None else 99, r['title'] or '')):
            w.writerow([r['id'], r['_topic'], r['week_number'], r['title'], (r.get('description') or '').replace('\n', ' ')[:300], r.get('pdf_filename')])
    show(report)
    print('sample of 10 matched:')
    withc = [x for x in results if x['status'] == 'matched' and x['links']]
    for r in withc[::max(1, len(withc) // 10)][:10]:
        print('   ', r['activity'], '->', r['resource_id'][:8], '|', r['resource_title'][:40], '|', r['how'], '|',
              {k: [c['code'] + ('*' if c['proposed'] else '') for c in v][:3] for k, v in list(r['links'].items())[:3]})
    print('(* = proposed)  Nothing was written to the database.')
    sys.exit(0)

# ============================== APPLY ==============================
RES = os.path.join(HERE, 'curriculum_result_%s.json' % stamp)
state = {'at': stamp, 'links': [], 'statements': [], 'stopped': None}
def save(): json.dump(state, open(RES, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
def stop(msg):
    state['stopped'] = msg; save(); print('STOPPED:', msg); print('Results so far:', RES); sys.exit(1)

show(report)
problems = []
if not col_ok: problems.append('resources.curriculum_links does not exist: run 01_curriculum_links.sql first')
if not tbl_ok: problems.append('curriculum_statements does not exist: run 01_curriculum_links.sql first')
if len(results) != EXPECT_ACTIVITIES: problems.append('expected %d activities, found %d' % (EXPECT_ACTIVITIES, len(results)))
if cnt.get('matched', 0) != len(results): problems.append('not every activity matched: %s' % dict(cnt))
if any(a not in by_file or len(by_file[a]) != 1 for a in OVERRIDES.values()): problems.append('an override target is missing or not unique')
if problems: stop('; '.join(problems))
save()

# 1. statements (insert-only), in batches
todo = sorted(new_stmts.items())
for i in range(0, len(todo), STATEMENT_BATCH):
    batch = todo[i:i + STATEMENT_BATCH]
    rows_ = [{'framework': fw, 'code': c, 'statement': t, 'source': SOURCE} for (fw, c), t in batch]
    try:
        sb.table('curriculum_statements').insert(rows_).execute()
        have = {(r['framework'], r['code']) for r in sb.table('curriculum_statements').select('framework,code').in_('framework', list({f for (f, _), _ in batch})).execute().data}
        if not all(k in have for k, _ in batch): raise RuntimeError('read-back is missing inserted statements')
    except Exception as ex:
        stop('statement batch %d failed (%s); not retried. Check curriculum_statements for these keys before deciding.' % (i // STATEMENT_BATCH, ex))
    state['statements'] += [{'framework': f, 'code': c} for (f, c), _ in batch]; save(); time.sleep(PAUSE_SECONDS)

# 2. links, one row at a time
for r in results:
    rid, links = r['resource_id'], r['links']
    if not links:
        state['links'].append({'activity': r['activity'], 'id': rid, 'status': 'no_codes_skipped'}); continue
    try:
        cur = sb.table('resources').select('id,curriculum_links').eq('id', rid).execute().data
        if not cur: raise RuntimeError('row not found')
        prev = cur[0].get('curriculum_links') or {}
        if prev == links:
            state['links'].append({'activity': r['activity'], 'id': rid, 'status': 'already_set'}); save(); continue
        if prev:
            raise RuntimeError('row already holds different curriculum_links; refusing to overwrite: %s' % json.dumps(prev)[:200])
        sb.table('resources').update({'curriculum_links': links}).eq('id', rid).execute()
        back = sb.table('resources').select('curriculum_links').eq('id', rid).execute().data[0]['curriculum_links']
        if back != links: raise RuntimeError('read-back does not equal what was written')
    except Exception as ex:
        stop('%s (%s -> %s): %s. Not retried.' % (r['activity'], r['title'], rid, ex))
    state['links'].append({'activity': r['activity'], 'id': rid, 'status': 'written', 'previous': prev}); save(); time.sleep(PAUSE_SECONDS)
print('APPLY complete.', Counter(x['status'] for x in state['links']), '| statements inserted:', len(state['statements']))
print('Results:', RES)
