#!/usr/bin/env python3
"""Build-time script (NOT used at runtime): regenerate backend/fonts/pua/*.ttf.

For HarfBuzz-shaped PDF text (backend/pdf_shaping.py) every glyph is drawn by glyph id.  ReportLab can only
draw characters through a cmap, so each font gets a "private use" copy whose cmap maps U+E000+gid -> glyph gid.
Only the tables ReportLab needs are kept (glyf, loca, head, hhea, hmtx, maxp, cmap, name, OS/2, post); layout
tables (GSUB/GPOS) stay in the ORIGINAL fonts, which HarfBuzz reads at runtime.
Each copy gets a UNIQUE PostScript/family name: ReportLab de-duplicates registered TrueType fonts by PostScript
name, so a copy sharing the original's name would silently resolve to the wrong font.

Usage (needs fonttools, which is NOT a runtime dependency):
    pip install fonttools
    python3 backend/fonts/build_pua_fonts.py
"""
import os
import re
import sys

from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._c_m_a_p import cmap_format_4

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "pua")
PUA0 = 0xE000
SOURCES = [
    "NotoSansDevanagari-Regular.ttf", "NotoSansDevanagari-Bold.ttf",
    "NotoNaskhArabic-Regular.ttf", "NotoNaskhArabic-Bold.ttf",
    "NotoSans-Regular.ttf", "NotoSans-Bold.ttf",   # Latin / digits fallback (already bundled for ru/zh PDFs)
]
KEEP = {"glyf", "loca", "head", "hhea", "hmtx", "maxp", "cmap", "name", "OS/2", "post"}


def build(src, dst):
    f = TTFont(src)
    order = f.getGlyphOrder()
    if len(order) > 0x1900:
        raise SystemExit("%s: too many glyphs (%d) for the BMP private use area" % (src, len(order)))
    for t in list(f.keys()):
        if t != "GlyphOrder" and t not in KEEP:
            del f[t]
    cmap = newTable("cmap")
    cmap.tableVersion = 0
    st = cmap_format_4(4)
    st.platformID, st.platEncID, st.language = 3, 1, 0
    st.cmap = {PUA0 + i: n for i, n in enumerate(order)}
    cmap.tables = [st]
    f["cmap"] = cmap
    ps = "COHPUA" + re.sub(r"[^A-Za-z0-9]", "", os.path.basename(src)[:-4])
    f["name"].names = [n for n in f["name"].names if n.nameID not in (1, 2, 3, 4, 6, 16, 17)]
    for pid, eid, lid in ((3, 1, 0x409), (1, 0, 0)):
        for nid, val in ((1, ps), (2, "Regular"), (3, ps), (4, ps), (6, ps)):
            f["name"].setName(val, nid, pid, eid, lid)
    f["post"].formatType = 3.0  # no glyph names
    f.save(dst)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name in SOURCES:
        src = os.path.join(HERE, name)
        dst = os.path.join(OUT, "PUA-" + name)
        build(src, dst)
        print("%-40s -> %s (%d bytes)" % (name, os.path.relpath(dst, HERE), os.path.getsize(dst)))


if __name__ == "__main__":
    sys.exit(main())
