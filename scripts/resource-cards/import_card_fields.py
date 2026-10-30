"""Import resource card facts and page previews (one-off, run 30 Oct 2026).

Reads ~/Desktop/COH Redesign/resource-data/resource-metadata.csv and previews/*.jpg, matches
each row to the resources table by pdf_filename, writes the 7 card fields and the preview
images (resource_previews). Never touches content, week_number, ordering, school_admin_id or ids.

Needs 01_resource_card_fields.sql run first. Dry run by default; pass --apply to write.
Uses backend/.env (SUPABASE_URL, SUPABASE_SERVICE_KEY).
"""
import base64, csv, os, sys
from dotenv import dotenv_values
from supabase import create_client

ROOT = os.path.expanduser('~/Desktop/COH Redesign/resource-data/')
env = dotenv_values(os.path.join(os.path.dirname(__file__), '..', '..', 'backend', '.env'))
sb = create_client(env['SUPABASE_URL'], env['SUPABASE_SERVICE_KEY'])
GROUPING = {'Individual': 'individual', 'Small group': 'small_group', 'Whole class': 'whole_class',
            'Individual or small group': 'individual,small_group',
            'Small group or whole class': 'small_group,whole_class', '': None}

db = {d['pdf_filename']: d for d in sb.table('resources').select('id,title,pdf_filename').execute().data}
apply = '--apply' in sys.argv
total = 0
for r in csv.DictReader(open(ROOT + 'resource-metadata.csv', encoding='utf-8')):
    d = db.get(r['pdf_filename'])
    if not d:
        sys.exit(f"No resource with pdf_filename {r['pdf_filename']!r} - stopping")
    fields = dict(
        age_min=int(r['age_min']) if r['age_min'] else None, age_max=int(r['age_max']) if r['age_max'] else None,
        duration_minutes=int(r['minutes']) if r['minutes'] else None, grouping=GROUPING[r['grouping']],
        goal=r['goal'] or None, outcomes=r['outcomes'] or None, use_when=r['use_when'] or None)
    images = [ROOT + f"previews/{r['pdf_filename'][:-4]}-{i}.jpg" for i in range(1, int(r['preview_count']) + 1)]
    total += len(images)
    print(d['id'][:8], d['title'][:48], fields['grouping'], len(images), 'previews')
    if apply:
        sb.table('resources').update(fields).eq('id', d['id']).execute()
        rows = [{'resource_id': d['id'], 'page_order': i + 1, 'image': base64.b64encode(open(f, 'rb').read()).decode()}
                for i, f in enumerate(images)]
        if rows:
            sb.table('resource_previews').upsert(rows).execute()
print('previews:', total, '(written)' if apply else '(dry run - nothing written)')
