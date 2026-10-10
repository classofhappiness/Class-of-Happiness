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
