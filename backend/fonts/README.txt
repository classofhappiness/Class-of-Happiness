Fonts bundled for PDF reports (ru, zh, and non-Latin-1 characters in names).
Both families are licensed under the SIL Open Font License 1.1 (see OFL-NotoSans.txt and OFL-NotoSansCJK.txt).

NotoSans-{Regular,Bold,Italic,BoldItalic}.ttf
  Source: notofonts/latin-greek-cyrillic release NotoSans-v2.015 (NotoSans/full/ttf).
  Modified: subset to Basic Latin, Latin-1, Latin Extended-A/B, Latin Extended Additional, combining marks,
  Cyrillic + Cyrillic Supplement, general punctuation, currency symbols and a few arrows/symbols; hinting and layout tables dropped.

NotoSansSC-{Regular,Bold}.ttf  (Noto Sans CJK SC, the Simplified Chinese design Google Fonts publishes as "Noto Sans SC")
  Source: notofonts/noto-cjk release Sans2.004, 08_NotoSansCJKsc.zip (NotoSansCJKsc-Regular.otf / -Bold.otf).
  Modified: subset to all 6,763 GB2312 hanzi (+ GB2312 symbols), Latin/Cyrillic ranges, CJK and full-width punctuation;
  CFF outlines converted to TrueType (quadratic) outlines with fontTools (cu2qu) because ReportLab needs glyf fonts.
  Characters outside the subset are rendered by the server as a visible "?" placeholder.

----------------------------------------------------------------------------------------------------
Hindi + Arabic PDF reports (HarfBuzz shaping, backend/pdf_shaping.py)
OFL licence texts: OFL-NotoSansDevanagari.txt, OFL-NotoNaskhArabic.txt (SIL Open Font License 1.1).

NotoSansDevanagari-{Regular,Bold}.ttf  - Noto Sans Devanagari v2.007, notofonts/devanagari release (full TTF, unmodified).
NotoNaskhArabic-{Regular,Bold}.ttf     - Noto Naskh Arabic v2.021, notofonts/arabic release (full TTF, unmodified).
  These ORIGINALS are read by HarfBuzz (uharfbuzz) at runtime for glyph selection and positioning, so their GSUB/GPOS
  tables must stay: they are deliberately not subset.  NotoSans-{Regular,Bold}.ttf (above) supply Latin letters and
  digits inside Hindi/Arabic text.

pua/PUA-*.ttf  - GENERATED copies (do not edit by hand) of the six fonts above (Devanagari, Naskh Arabic, Noto Sans).
  Modified: cmap replaced by U+E000+glyph_id -> glyph_id (private use area), all tables except
  glyf/loca/head/hhea/hmtx/maxp/cmap/name/OS/2/post removed, and a UNIQUE PostScript/family name set (COHPUA<name>)
  because ReportLab de-duplicates registered fonts by PostScript name.  ReportLab draws one glyph id at a time
  through these copies and embeds only the glyphs used.  The unmodified outlines are the OFL fonts above; because
  they are modified versions that keep the original design, they are distributed here under the same OFL terms
  and under non-reserved names (the Noto fonts declare no Reserved Font Name).
  Regenerate with:  pip install fonttools && python3 backend/fonts/build_pua_fonts.py   (fonttools is build-time only).
