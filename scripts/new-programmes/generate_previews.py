"""Page previews for the YAE and COH Entrepreneur resources (Nov 2026).

Same storage as the existing previews: resource_previews(resource_id, page_order, image), image = raw base64 JPEG,
600 px wide. PDF pages 2-4 only (page 1 is the shared template) become page_order 1-3; a PDF with fewer pages gets
whatever exists after page 1 (a 1-page PDF gets none). Resources that already have previews are skipped, so re-runs
never duplicate. Dry run by default; --apply writes. Uses backend/.env.
"""
import base64, io, os, sys
import fitz
from dotenv import dotenv_values
from supabase import create_client
from PIL import Image

H = os.path.expanduser('~/Desktop/')
DIRS = {'you_are_what_you_eat': H + 'You are what you eat/Files/You-Are-What-You-Eat-ALL-PDFs/',
        'coh_entrepreneur': H + 'COH Entrepreneur/COH-Entrepreneur-ALL-PDFs/'}
WIDTH, QUALITY = 600, 72
env = dotenv_values(os.path.join(os.path.dirname(__file__), '..', '..', 'backend', '.env'))
sb = create_client(env['SUPABASE_URL'], env['SUPABASE_SERVICE_KEY'])
apply = '--apply' in sys.argv
tot = n_res = n_none = 0
for topic, d in DIRS.items():
    for r in sb.table('resources').select('id,title,pdf_filename').eq('topic', topic).execute().data:
        if sb.table('resource_previews').select('page_order').eq('resource_id', r['id']).limit(1).execute().data:
            continue
        doc = fitz.open(d + r['pdf_filename'])
        rows = []
        for i in range(1, min(4, len(doc))):  # pages 2-4
            pix = doc[i].get_pixmap(matrix=fitz.Matrix(WIDTH / doc[i].rect.width, WIDTH / doc[i].rect.width))
            im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            buf = io.BytesIO(); im.save(buf, format='JPEG', quality=QUALITY, optimize=True)
            rows.append({'resource_id': r['id'], 'page_order': i, 'image': base64.b64encode(buf.getvalue()).decode()})
        kb = [round(len(x['image']) * 3 / 4 / 1024) for x in rows]
        print(f"{topic[:4]} {r['title'][:36]:36} pdf_pages={len(doc)} previews={len(rows)} kb={kb}")
        tot += len(rows); n_res += 1; n_none += not rows
        if apply and rows:
            sb.table('resource_previews').insert(rows).execute()
print(f'{n_res} resources, {tot} previews, {n_none} with none', '(written)' if apply else '(dry run - nothing written)')
