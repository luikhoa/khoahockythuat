#!/usr/bin/env python3
"""Chuyển các file .md của dự án CyberShield sang .docx theo định dạng chuẩn.

Định dạng:
- Font: Times New Roman, nội dung 13pt, tiêu đề Bold 14-16pt
- Dãn dòng 1.5, Spacing Before/After 3pt
- Lề trang: Trên 2cm, Dưới 2cm, Trái 3cm, Phải 2cm
- Bảng: căn giữa, viền 0.5pt, header tô nền xám nhẹ
"""
import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

FONT_NAME = "Times New Roman"
BODY_SIZE = Pt(13)
HEADING_SIZES = {1: Pt(16), 2: Pt(15), 3: Pt(14), 4: Pt(14)}
SPACING_PT = Pt(3)
HEADER_SHADE = "D9D9D9"  # xám nhẹ

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCX_DIR = Path(__file__).resolve().parent

# (tên file .md, thư mục chứa file nguồn)
SOURCE_FILES = [
    ("BAO_CAO_GVHD.md", REPO_ROOT),
    ("TECHNICAL_TIMELINE_REFERENCE.md", DOCX_DIR),
    ("POSTER_CONTENT.md", DOCX_DIR),
    ("PROMPT_LOG_PHULUC1.md", DOCX_DIR),
]


def set_cell_shading(cell, hex_color: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tc_pr.append(shd)


def set_cell_border(cell, sz: str = "4") -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), sz)  # 4 = 0.5pt (đơn vị 1/8 pt)
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), "000000")
        borders.append(el)
    tc_pr.append(borders)


def apply_paragraph_format(paragraph) -> None:
    pf = paragraph.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    pf.line_spacing = 1.5
    pf.space_before = SPACING_PT
    pf.space_after = SPACING_PT


def set_run_font(run, size=BODY_SIZE, bold=False, italic=False) -> None:
    run.font.name = FONT_NAME
    run.font.size = size
    run.font.bold = bold
    run.font.italic = italic
    # Đảm bảo font áp dụng cho cả ký tự Đông Á/phức hợp (tránh Word tự đổi font tiếng Việt)
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rfonts.set(qn(attr), FONT_NAME)


INLINE_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
INLINE_CODE_RE = re.compile(r"`([^`]+)`")


def add_inline_runs(paragraph, text: str, base_bold=False, base_italic=False) -> None:
    """Thêm text vào paragraph, xử lý **bold** và `code` cơ bản."""
    tokens = []
    pos = 0
    combined_re = re.compile(r"(\*\*.+?\*\*|`[^`]+`)")
    for m in combined_re.finditer(text):
        if m.start() > pos:
            tokens.append(("plain", text[pos:m.start()]))
        token = m.group(0)
        if token.startswith("**"):
            tokens.append(("bold", token[2:-2]))
        else:
            tokens.append(("code", token[1:-1]))
        pos = m.end()
    if pos < len(text):
        tokens.append(("plain", text[pos:]))
    if not tokens:
        tokens = [("plain", text)]

    for kind, content in tokens:
        if not content:
            continue
        run = paragraph.add_run(content)
        if kind == "bold":
            set_run_font(run, bold=True or base_bold, italic=base_italic)
        elif kind == "code":
            run.font.name = "Consolas"
            run.font.size = BODY_SIZE
            run.font.bold = base_bold
        else:
            set_run_font(run, bold=base_bold, italic=base_italic)


def add_heading(doc, text: str, level: int) -> None:
    p = doc.add_paragraph()
    apply_paragraph_format(p)
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(6)
    size = HEADING_SIZES.get(level, Pt(14))
    add_inline_runs(p, text, base_bold=True)
    for run in p.runs:
        run.font.bold = True
        run.font.size = size


def add_body_paragraph(doc, text: str, italic=False) -> None:
    p = doc.add_paragraph()
    apply_paragraph_format(p)
    add_inline_runs(p, text, base_italic=italic)


def add_blockquote(doc, lines: list) -> None:
    joined = " ".join(line.lstrip("> ").strip() for line in lines if line.strip())
    p = doc.add_paragraph()
    apply_paragraph_format(p)
    p.paragraph_format.left_indent = Cm(1)
    add_inline_runs(p, joined, base_italic=True)


def parse_table_row(line: str) -> list:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [cell.strip() for cell in line.split("|")]


def add_table(doc, header: list, rows: list) -> None:
    table = doc.add_table(rows=1, cols=len(header))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True

    hdr_cells = table.rows[0].cells
    for i, text in enumerate(header):
        hdr_cells[i].text = ""
        p = hdr_cells[i].paragraphs[0]
        apply_paragraph_format(p)
        add_inline_runs(p, text, base_bold=True)
        set_cell_shading(hdr_cells[i], HEADER_SHADE)
        set_cell_border(hdr_cells[i])

    for row in rows:
        cells = table.add_row().cells
        for i, text in enumerate(row):
            if i >= len(cells):
                break
            cells[i].text = ""
            p = cells[i].paragraphs[0]
            apply_paragraph_format(p)
            add_inline_runs(p, text)
            set_cell_border(cells[i])


def add_list_item(doc, text: str, ordered: bool, index: int) -> None:
    style = "List Number" if ordered else "List Bullet"
    try:
        p = doc.add_paragraph(style=style)
    except KeyError:
        p = doc.add_paragraph()
    apply_paragraph_format(p)
    add_inline_runs(p, text)


def convert_markdown(doc: Document, md_text: str) -> None:
    lines = md_text.split("\n")
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # Code block ```...```
        if stripped.startswith("```"):
            i += 1
            code_lines = []
            while i < n and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # skip closing ```
            p = doc.add_paragraph()
            apply_paragraph_format(p)
            run = p.add_run("\n".join(code_lines))
            run.font.name = "Consolas"
            run.font.size = Pt(10)
            continue

        # Blockquote
        if stripped.startswith(">"):
            block = []
            while i < n and lines[i].strip().startswith(">"):
                block.append(lines[i])
                i += 1
            add_blockquote(doc, block)
            continue

        # Horizontal rule
        if re.fullmatch(r"-{3,}", stripped):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(6)
            pPr = p._p.get_or_add_pPr()
            pBdr = OxmlElement("w:pBdr")
            bottom = OxmlElement("w:bottom")
            bottom.set(qn("w:val"), "single")
            bottom.set(qn("w:sz"), "6")
            bottom.set(qn("w:space"), "1")
            bottom.set(qn("w:color"), "999999")
            pBdr.append(bottom)
            pPr.append(pBdr)
            i += 1
            continue

        # Table (header + separator row)
        if stripped.startswith("|") and i + 1 < n and re.match(r"^\|?[\s:|-]+\|?$", lines[i + 1].strip()):
            header = parse_table_row(lines[i])
            i += 2  # skip header + separator
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(parse_table_row(lines[i]))
                i += 1
            add_table(doc, header, rows)
            continue

        # Headings
        m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            add_heading(doc, m.group(2), level)
            i += 1
            continue

        # Unordered list
        m = re.match(r"^[-*]\s+(.*)$", stripped)
        if m:
            add_list_item(doc, m.group(1), ordered=False, index=0)
            i += 1
            continue

        # Ordered list
        m = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if m:
            add_list_item(doc, m.group(2), ordered=True, index=int(m.group(1)))
            i += 1
            continue

        # Default paragraph
        add_body_paragraph(doc, stripped)
        i += 1


def set_page_layout(doc: Document) -> None:
    section = doc.sections[0]
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(3)
    section.right_margin = Cm(2)


def set_default_style(doc: Document) -> None:
    style = doc.styles["Normal"]
    style.font.name = FONT_NAME
    style.font.size = BODY_SIZE
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rfonts.set(qn(attr), FONT_NAME)
    pf = style.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    pf.line_spacing = 1.5
    pf.space_before = SPACING_PT
    pf.space_after = SPACING_PT


def convert_file(md_path: Path, out_dir: Path) -> Path:
    md_text = md_path.read_text(encoding="utf-8")
    doc = Document()
    set_default_style(doc)
    set_page_layout(doc)
    convert_markdown(doc, md_text)
    out_path = out_dir / (md_path.stem + ".docx")
    doc.save(out_path)
    return out_path


def main() -> None:
    results = []
    for filename, source_dir in SOURCE_FILES:
        md_path = source_dir / filename
        if not md_path.exists():
            print(f"[BỎ QUA] Không tìm thấy: {md_path}")
            continue
        out_path = convert_file(md_path, DOCX_DIR)
        print(f"[OK] {md_path}  ->  {out_path}")
        results.append(out_path)

    print(f"\nHoàn tất: {len(results)}/{len(SOURCE_FILES)} file đã chuyển đổi.")


if __name__ == "__main__":
    sys.exit(main())
