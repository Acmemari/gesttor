# -*- coding: utf-8 -*-
"""
Gera mockups (PNG) da tela de Nascimento + documento Word PRD.
"""
from __future__ import annotations
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).parent
IMG_DIR = OUT_DIR / "img"
IMG_DIR.mkdir(parents=True, exist_ok=True)

# ── Paleta de cores (mesma do app) ──────────────────────────────────────────────
BG       = "#f9fafb"
WHITE    = "#ffffff"
BORDER   = "#e5e7eb"
TXT      = "#0F172A"
GRAY_500 = "#6b7280"
GRAY_600 = "#4b5563"
GRAY_700 = "#374151"
GRAY_400 = "#9ca3af"
GRAY_300 = "#d1d5db"
GRAY_100 = "#f3f4f6"
GREEN    = "#16a34a"   # primária
GREEN_BG = "#e7f6ec"
GREEN_LT = "#f1faf4"
GREEN_DK = "#15803d"
GREEN_LN = "#b7e0c4"
ORANGE   = "#ea580c"
ORANGE_BG= "#fdeee3"
ORANGE_LN= "#fcd9b6"
BLUE     = "#2563eb"
RED      = "#dc2626"
YELLOW   = "#a06a12"
YELLOW_BG= "#fef6e0"
YELLOW_LN= "#f3d98a"

# ── Fontes ──────────────────────────────────────────────────────────────────────
def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates_b = [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ]
    candidates_n = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    paths = candidates_b if bold else candidates_n
    for p in paths:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

F_TITLE  = lambda: font(22, True)
F_H1     = lambda: font(18, True)
F_H2     = lambda: font(15, True)
F_LBL    = lambda: font(12, True)
F_TXT    = lambda: font(13, False)
F_SM     = lambda: font(11, False)
F_SMB    = lambda: font(11, True)
F_XS     = lambda: font(10, False)
F_XSB    = lambda: font(10, True)
F_BTN    = lambda: font(13, True)
F_TBL_TH = lambda: font(10, True)
F_TBL_TD = lambda: font(12, False)

# ── Helpers ─────────────────────────────────────────────────────────────────────
def rounded(d: ImageDraw.ImageDraw, xy, radius, fill=None, outline=None, width=1):
    d.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

def label(d, x, y, txt, *, f=None, color=GRAY_700):
    d.text((x, y), txt, fill=color, font=f or F_LBL())

def text(d, x, y, txt, *, f=None, color=TXT):
    d.text((x, y), txt, fill=color, font=f or F_TXT())

def input_box(d, x, y, w, h=34, *, value="", placeholder=""):
    rounded(d, (x, y, x+w, y+h), 8, fill=WHITE, outline=BORDER, width=1)
    if value:
        d.text((x+10, y+(h-18)//2), value, fill=TXT, font=F_TXT())
    elif placeholder:
        d.text((x+10, y+(h-18)//2), placeholder, fill=GRAY_400, font=F_TXT())

def select_box(d, x, y, w, h=34, *, value="", placeholder="—"):
    rounded(d, (x, y, x+w, y+h), 8, fill=WHITE, outline=BORDER, width=1)
    d.text((x+10, y+(h-18)//2), value or placeholder, fill=TXT if value else GRAY_400, font=F_TXT())
    # caret
    cx = x+w-14; cy = y+h//2
    d.polygon([(cx-5, cy-2), (cx+5, cy-2), (cx, cy+3)], fill=GRAY_500)

def btn_primary(d, x, y, w, h, txt, icon: str | None = None):
    rounded(d, (x, y, x+w, y+h), 8, fill=GREEN, outline=None)
    pad = 12
    if icon:
        d.text((x+pad, y+(h-15)//2), icon, fill=WHITE, font=F_BTN())
        pad += 18
    d.text((x+pad, y+(h-15)//2), txt, fill=WHITE, font=F_BTN())

def btn_outline_green(d, x, y, w, h, txt, icon: str | None = None):
    rounded(d, (x, y, x+w, y+h), 8, fill=WHITE, outline=GREEN, width=1)
    pad = 12
    if icon:
        d.text((x+pad, y+(h-15)//2), icon, fill=GREEN, font=F_BTN())
        pad += 18
    d.text((x+pad, y+(h-15)//2), txt, fill=GREEN, font=F_BTN())

def btn_outline_gray(d, x, y, w, h, txt, icon: str | None = None):
    rounded(d, (x, y, x+w, y+h), 8, fill=WHITE, outline=BORDER, width=1)
    pad = 12
    if icon:
        d.text((x+pad, y+(h-15)//2), icon, fill=GRAY_600, font=F_BTN())
        pad += 18
    d.text((x+pad, y+(h-15)//2), txt, fill=GRAY_600, font=F_BTN())

def pill(d, x, y, txt, *, fill=GREEN_BG, color=GREEN, fb=None):
    fb = fb or F_SMB()
    tw = d.textlength(txt, font=fb)
    w = int(tw + 22); h = 22
    rounded(d, (x, y, x+w, y+h), 99, fill=fill)
    d.text((x+11, y+3), txt, fill=color, font=fb)
    return x+w

def card(d, x, y, w, h):
    rounded(d, (x, y, x+w, y+h), 14, fill=WHITE, outline=BORDER, width=1)

def hr(d, x, y, w, color=BORDER):
    d.line([(x, y), (x+w, y)], fill=color, width=1)

def chip(d, x, y, txt, *, fill=GREEN_BG, color=GREEN):
    fb = F_XSB()
    tw = d.textlength(txt, font=fb)
    w = int(tw + 18); h = 20
    rounded(d, (x, y, x+w, y+h), 99, fill=fill)
    d.text((x+9, y+3), txt, fill=color, font=fb)
    return x+w

# ── Cabeçalho compartilhado da página ───────────────────────────────────────────
def draw_app_header(d, w, *, aba_lancar=True, qtd_movs=2):
    """Sidebar + header da tela com abas Lançamentos/Registros."""
    # Sidebar
    rounded(d, (0, 0, 60, 1000), 0, fill="#0F172A")
    d.text((22, 18), "≡", fill=WHITE, font=F_H1())
    d.text((19, 60), "🐄", fill=WHITE, font=F_H1())
    d.text((19, 110), "📋", fill=WHITE, font=F_H1())
    d.text((19, 160), "📊", fill=WHITE, font=F_H1())
    d.text((19, 210), "⚙", fill=WHITE, font=F_H1())

    # Topbar
    d.line([(60, 56), (w, 56)], fill=BORDER, width=1)
    # Caminho de navegação
    d.text((80, 22), "Pecuário  ›  Movimentação  ›  Nascimentos", fill=GRAY_500, font=F_SM())

    # Título + abas
    # Brinco bovino (ícone simbólico)
    bx, by = 86, 78
    d.ellipse([(bx, by), (bx+18, by+18)], outline=GREEN, width=2)
    d.text((bx+5, by+1), "8", fill=GREEN, font=F_SMB())
    d.text((bx+26, by-1), "Nascimentos", fill=TXT, font=F_TITLE())

    # Abas
    tx, ty = w-360, 76; tw = 320; th = 32
    rounded(d, (tx, ty, tx+tw, ty+th), 12, fill=WHITE, outline=BORDER, width=1)
    cw = tw//2
    if aba_lancar:
        rounded(d, (tx+4, ty+4, tx+cw-2, ty+th-4), 8, fill=GREEN)
        d.text((tx+44, ty+9), "+ Lançamentos", fill=WHITE, font=F_BTN())
        d.text((tx+cw+18, ty+9), "≡ Registros", fill=GRAY_600, font=F_BTN())
    else:
        d.text((tx+44, ty+9), "+ Lançamentos", fill=GRAY_600, font=F_BTN())
        rounded(d, (tx+cw+2, ty+4, tx+tw-4, ty+th-4), 8, fill=GREEN)
        d.text((tx+cw+14, ty+9), "≡ Registros", fill=WHITE, font=F_BTN())
        # contador
        pill(d, tx+cw+118, ty+8, str(qtd_movs), fill="#ffffff33", color=WHITE, fb=F_XSB())

# ──────────────────────────────────────────────────────────────────────────────
# Mockup 1 — Tela inicial (modo COLETIVO / Lote)
# ──────────────────────────────────────────────────────────────────────────────
def mock_1_coletivo():
    W, H = 1440, 900
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    draw_app_header(d, W, aba_lancar=True)

    # Container principal
    x0, y0 = 80, 130
    cw = W - x0 - 30
    ch = 360
    card(d, x0, y0, cw, ch)

    # Régua vertical
    left_w = int(cw * 0.65)
    d.line([(x0+left_w, y0+1), (x0+left_w, y0+ch-1)], fill=BORDER, width=1)

    # ── PAINEL ESQUERDO ──────────────────────────────────────────────────────
    px = x0 + 24; py = y0 + 22
    # Cabeçalho linha 1 — Data | Proprietário | Fazenda | Retiro | Local
    fields = [
        ("Data",         140, "22/06/2026"),
        ("Proprietário", 220, "Selecionar proprietário..."),
        ("Fazenda",      170, "Fazenda Boa Vista"),
        ("Retiro",       150, "Sede"),
        ("Local",        160, "Curral 1"),
    ]
    cx = px
    for lbl, ww, val in fields:
        label(d, cx, py, lbl)
        sb = py + 22
        select_box(d, cx, sb, ww, value=val if "Proprietário" not in lbl else "", placeholder=val if "Proprietário" in lbl else "—")
        cx += ww + 14

    # Safra automática (abaixo de Data)
    d.text((px, py+22+40), "Safra ", fill=GRAY_500, font=F_SM())
    d.text((px+34, py+22+40), "2025/2026", fill=GREEN, font=F_SMB())

    # Linha 2 — Toggle brinco/lote + Quantidade + Categoria (sem detalhe) + +mais
    py2 = py + 96
    # Ícone toggles
    # Brinco (inativo)
    rounded(d, (px, py2, px+44, py2+44), 10, fill=WHITE, outline=BORDER, width=1)
    d.ellipse([(px+10, py2+8), (px+34, py2+32)], outline=GRAY_500, width=2)
    # Lote (ativo)
    rounded(d, (px+52, py2, px+96, py2+44), 10, fill=GREEN_BG, outline=GREEN, width=2)
    for i in range(3):
        d.ellipse([(px+60+i*9, py2+12), (px+76+i*9, py2+32)], outline=GREEN, width=2)

    label(d, px+112, py2-18, "Quantidade  *  (cab.)")
    input_box(d, px+112, py2, 140, value="18")
    label(d, px+266, py2-18, "Categoria  (sem detalhe)")
    select_box(d, px+266, py2, 280, value="Bezerros Mamando")
    btn_outline_green(d, px+560, py2, 90, 34, "+ mais")

    # Resumo ao vivo
    py3 = py2 + 60
    pill(d, px, py3, "Total 18 cab. · 0 identificados · 18 a detalhar", fill="#eef0f2", color=GRAY_500)

    # Ações — Cancelar + Salvar
    btns_y = y0 + ch - 60
    btn_outline_gray(d, x0+left_w-220, btns_y, 96, 36, "Cancelar")
    btn_primary(d, x0+left_w-114, btns_y, 100, 36, "💾 Salvar")

    # ── PAINEL DIREITO — Distribuição por categoria ──────────────────────────
    rx = x0 + left_w + 22; ry = y0 + 22
    d.text((rx, ry), "🏷  Distribuição por categoria", fill=GRAY_700, font=F_H2())
    # tabela
    ty = ry + 32
    rounded(d, (rx, ty, x0+cw-22, ty+30), 6, fill="#fcfcfd")
    d.text((rx+8, ty+8), "CATEGORIA",  fill=GRAY_500, font=F_TBL_TH())
    d.text((rx+170, ty+8), "SEM ID",   fill=GRAY_500, font=F_TBL_TH())
    d.text((rx+240, ty+8), "COM ID",   fill=GRAY_500, font=F_TBL_TH())
    d.text((rx+310, ty+8), "TOTAL",    fill=GRAY_500, font=F_TBL_TH())
    d.text((rx+370, ty+8), "AÇÕES",    fill=GRAY_500, font=F_TBL_TH())

    rows = [("Bezerros Mamando", 18, 0, 18)]
    yy = ty + 36
    for name, sem, com, total in rows:
        d.text((rx+8,   yy), name, fill=TXT, font=F_TBL_TD())
        d.text((rx+170, yy), str(sem), fill=GRAY_700, font=F_TBL_TD())
        d.text((rx+240, yy), str(com), fill=BLUE, font=F_TBL_TD())
        d.text((rx+310, yy), f"{total} cab.", fill=TXT, font=F_TBL_TD())
        d.text((rx+380, yy), "•••", fill=GRAY_500, font=F_TBL_TD())

    # Rodapé do painel direito
    foot_y = y0 + ch - 56
    hr(d, rx, foot_y, x0+cw-22-rx)
    d.text((rx, foot_y+12), "TOTAL", fill=GRAY_500, font=F_TBL_TH())
    d.text((rx+200, foot_y+12), "Sem ID 18", fill=GRAY_700, font=F_SM())
    d.text((rx+280, foot_y+12), "Com ID 0", fill=BLUE, font=F_SM())
    d.text((rx+360, foot_y+8), "18 cab.", fill=GREEN, font=F_H1())

    # Anotação visual (legenda) abaixo do card
    legend_y = y0 + ch + 24
    d.text((x0, legend_y),
           "Modo COLETIVO (Lote): você lança a quantidade e a categoria; "
           "cada bezerro pode ser individualizado depois.", fill=GRAY_500, font=F_SM())

    img.save(IMG_DIR / "01_tela_coletivo.png")

# ──────────────────────────────────────────────────────────────────────────────
# Mockup 2 — Modo INDIVIDUAL com painel "Defina seus campos"
# ──────────────────────────────────────────────────────────────────────────────
def mock_2_individual():
    W, H = 1440, 1180
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    draw_app_header(d, W, aba_lancar=True)

    # ── Cartão de cabeçalho (mesmo do modo coletivo, com toggles trocados) ──
    x0, y0 = 80, 130
    cw = W - x0 - 30
    ch = 320
    card(d, x0, y0, cw, ch)
    left_w = int(cw * 0.65)
    d.line([(x0+left_w, y0+1), (x0+left_w, y0+ch-1)], fill=BORDER, width=1)

    px = x0 + 24; py = y0 + 22
    fields = [
        ("Data", 140, "22/06/2026"),
        ("Proprietário", 220, ""),
        ("Fazenda", 170, "Fazenda Boa Vista"),
        ("Retiro", 150, "Sede"),
        ("Local", 160, "Curral 1"),
    ]
    cx = px
    for lbl, ww, val in fields:
        label(d, cx, py, lbl)
        select_box(d, cx, py+22, ww, value=val, placeholder="Selecionar proprietário..." if lbl=="Proprietário" else "—")
        cx += ww + 14
    d.text((px, py+62), "Safra ", fill=GRAY_500, font=F_SM())
    d.text((px+34, py+62), "2025/2026", fill=GREEN, font=F_SMB())

    # Toggles invertidos: Individual ATIVO
    py2 = py + 96
    rounded(d, (px, py2, px+44, py2+44), 10, fill=GREEN_BG, outline=GREEN, width=2)
    d.ellipse([(px+10, py2+8), (px+34, py2+32)], outline=GREEN, width=2)
    d.line([(px+22, py2+32),(px+22, py2+38)], fill=GREEN, width=2)
    rounded(d, (px+52, py2, px+96, py2+44), 10, fill=WHITE, outline=BORDER, width=1)
    for i in range(3):
        d.ellipse([(px+60+i*9, py2+12), (px+76+i*9, py2+32)], outline=GRAY_500, width=2)

    # Campos coletivos bloqueados (cinza)
    label(d, px+112, py2-18, "Quantidade  *  (cab.)")
    rounded(d, (px+112, py2, px+252, py2+34), 8, fill=GRAY_100, outline=BORDER, width=1)
    label(d, px+266, py2-18, "Categoria  (sem detalhe)")
    rounded(d, (px+266, py2, px+546, py2+34), 8, fill=GRAY_100, outline=BORDER, width=1)
    d.text((px+274, py2+9), "Selecione a categoria", fill=GRAY_400, font=F_TXT())
    rounded(d, (px+560, py2, px+650, py2+34), 8, fill=GRAY_100, outline=BORDER, width=1)
    d.text((px+580, py2+9), "+ mais", fill=GRAY_400, font=F_BTN())

    # Resumo verde
    py3 = py2 + 56
    pill(d, px, py3, "✓  3 identificados · total 3 cab.", fill=GREEN_BG, color=GREEN)

    # Ações
    btns_y = y0 + ch - 60
    btn_outline_gray(d, x0+left_w-220, btns_y, 96, 36, "Cancelar")
    btn_primary(d, x0+left_w-114, btns_y, 100, 36, "💾 Salvar")

    # Painel direito — Distribuição
    rx = x0 + left_w + 22; ry = y0 + 22
    d.text((rx, ry), "🏷  Distribuição por categoria", fill=GRAY_700, font=F_H2())
    ty = ry + 32
    rounded(d, (rx, ty, x0+cw-22, ty+30), 6, fill="#fcfcfd")
    d.text((rx+8, ty+8), "CATEGORIA", fill=GRAY_500, font=F_TBL_TH())
    d.text((rx+170, ty+8), "SEM ID", fill=GRAY_500, font=F_TBL_TH())
    d.text((rx+240, ty+8), "COM ID", fill=GRAY_500, font=F_TBL_TH())
    d.text((rx+310, ty+8), "TOTAL", fill=GRAY_500, font=F_TBL_TH())
    yy = ty + 36
    d.text((rx+8, yy), "Bezerros Mamando", fill=TXT, font=F_TBL_TD())
    d.text((rx+170, yy), "0", fill=GRAY_700, font=F_TBL_TD())
    d.text((rx+240, yy), "3", fill=BLUE, font=F_TBL_TD())
    d.text((rx+310, yy), "3 cab.", fill=TXT, font=F_TBL_TD())
    d.text((rx+380, yy), "só com ID", fill=GRAY_300, font=F_XS())

    foot_y = y0 + ch - 56
    hr(d, rx, foot_y, x0+cw-22-rx)
    d.text((rx, foot_y+12), "TOTAL", fill=GRAY_500, font=F_TBL_TH())
    d.text((rx+200, foot_y+12), "Sem ID 0", fill=GRAY_700, font=F_SM())
    d.text((rx+280, foot_y+12), "Com ID 3", fill=BLUE, font=F_SM())
    d.text((rx+360, foot_y+8), "3 cab.", fill=GREEN, font=F_H1())

    # ── PAINEL Defina seus campos ──────────────────────────────────────────
    py_dc = y0 + ch + 24
    dc_h = 740
    card(d, x0, py_dc, cw, dc_h)
    # Header do card
    dx = x0 + 20; dy = py_dc + 14
    rounded(d, (dx, dy, dx+24, dy+24), 6, fill=WHITE, outline=GREEN_LN, width=1)
    d.text((dx+7, dy+4), "✎", fill=GREEN, font=F_SMB())
    d.text((dx+34, dy+5), "Defina seus campos", fill=TXT, font=F_H2())

    # Ações do header (direita)
    ah_y = dy
    btn_outline_green(d, x0+cw-360, ah_y, 100, 30, "⬇ Planilha")
    btn_outline_green(d, x0+cw-250, ah_y, 100, 30, "⬆ Planilha")
    btn_outline_gray(d, x0+cw-140, ah_y, 70, 30, "Fechar")
    btn_outline_green(d, x0+cw-66, ah_y, 56, 30, "⛶")

    # Linha "Repete em todos" (Top)
    rt_y = py_dc + 60
    label(d, dx, rt_y, "Repete em todos")
    rty = rt_y + 22
    items_top = [("Data", "22/06/2026", 130),
                 ("Raça", "Nelore", 130),
                 ("Lote", "RC-01 · Recria Machos 24", 220)]
    cx = dx
    for lbl, val, ww in items_top:
        label(d, cx, rt_y, lbl)
        select_box(d, cx, rty, ww, value=val)
        cx += ww + 12
    # Toggle Sanitário
    btn_outline_green(d, cx, rty, 130, 34, "▾ Sanitário")
    # Botão Dados adicionais
    btn_outline_gray(d, cx+140, rty, 170, 34, "▾ Dados adicionais")

    # Linha de inclusão (uma por animal)
    inc_y = rty + 60
    d.text((dx, inc_y-22), "Tabela de Lançamento (por animal)", fill=GRAY_600, font=F_LBL())
    items_bot = [
        ("ID Manejo *", "504A", 130),
        ("Categoria *", "Bezerros Mamando", 200),
        ("ID Eletrônica", "RFID", 150),
        ("SISBOV", "SISBOV", 130),
        ("Sexo *", "♂ Macho", 130),
        ("Porte *", "M", 80),
        ("Colostro?", "Sim", 100),
        ("Peso nasc.", "32,5 kg", 110),
    ]
    cx = dx
    for lbl, val, ww in items_bot:
        label(d, cx, inc_y, lbl)
        if "504A" in val or "RFID" in val or "SISBOV" in val or "kg" in val:
            input_box(d, cx, inc_y+22, ww, value=val if "504A" in val or "kg" in val else "", placeholder=val if val in ("RFID","SISBOV") else "")
        else:
            select_box(d, cx, inc_y+22, ww, value=val)
        cx += ww + 10

    btn_primary(d, dx, inc_y+66, 120, 34, "+ Adicionar")

    # Tabela dos animais já adicionados
    tb_y = inc_y + 116
    headers = ["ID Manejo", "ID Eletrônica", "SISBOV", "Sexo", "Categoria", "Porte", "Colostro", "Peso", "Ações"]
    col_widths = [110, 130, 110, 80, 200, 70, 90, 110, 70]
    th_y = tb_y
    rounded(d, (dx, th_y, dx+sum(col_widths)+30, th_y+30), 6, fill="#fcfcfd")
    cx = dx + 12
    for h, ww in zip(headers, col_widths):
        d.text((cx, th_y+8), h.upper(), fill=GRAY_500, font=F_TBL_TH())
        cx += ww
    # Linhas
    sample = [
        ["504A", "—", "—", "♂ M", "Bezerros Mamando", "M", "Sim", "32,5 kg", "🗑"],
        ["505A", "BR9000234", "—", "♀ F", "Bezerros Mamando", "M", "Sim", "30,2 kg", "🗑"],
        ["506A", "—", "—", "♂ M", "Bezerros Mamando", "P", "Sim", "28,8 kg", "🗑"],
    ]
    yy = th_y + 36
    for row in sample:
        cx = dx + 12
        for c, ww in zip(row, col_widths):
            d.text((cx, yy), c, fill=GRAY_700, font=F_TBL_TD())
            cx += ww
        yy += 28
        hr(d, dx, yy-4, sum(col_widths)+30)

    img.save(IMG_DIR / "02_modo_individual.png")

# ──────────────────────────────────────────────────────────────────────────────
# Mockup 3 — Configurar campos (modal)
# ──────────────────────────────────────────────────────────────────────────────
def mock_3_config_modal():
    W, H = 1280, 900
    img = Image.new("RGB", (W, H), "#0f172a99")
    d = ImageDraw.Draw(img)
    # fundo do app (esmaecido)
    img2 = Image.new("RGBA", (W, H), (15, 23, 42, 180))
    img.paste(img2, (0, 0), img2)

    # Modal
    mx, my, mw, mh = 80, 60, W-160, H-120
    rounded(d, (mx, my, mx+mw, my+mh), 18, fill=WHITE, outline=BORDER, width=1)
    # Cabeçalho
    d.text((mx+24, my+22), "Configurar campos do Lançamento Rápido", fill=TXT, font=F_TITLE())
    d.text((mx+24, my+56),
           "Defina onde cada campo aparece: Linha Superior (repete em todos), "
           "Linha Tabela Lançamento (por animal), Dados Adicionais (recolhido) "
           "ou Desativado (não aparece). Arraste pela alça para definir a ordem.",
           fill=GRAY_500, font=F_SM())
    d.text((mx+mw-40, my+24), "✕", fill=GRAY_500, font=F_H1())

    # Cabeçalho da tabela
    hy = my+110
    cols = [("CAMPO", 380), ("Linha Superior", 180), ("Tabela Lançamento", 200), ("Dados Adicionais", 180), ("Desativado", 130)]
    cx = mx+24
    for n, ww in cols:
        d.text((cx, hy), n.upper(), fill=GRAY_500, font=F_TBL_TH())
        cx += ww
    hr(d, mx+20, hy+22, mw-40)

    # Linhas (amostra dos campos do registry)
    rows = [
        ("ID Manejo  🔒",    "—", "Tabela", "—", "—"),
        ("Categoria *",      "—", "Tabela", "—", "—"),
        ("Data",             "Superior", "Tabela", "Adicionais", "Desativado"),
        ("Raça",             "Superior", "Tabela", "Adicionais", "Desativado"),
        ("Lote",             "Superior", "Tabela", "Adicionais", "Desativado"),
        ("ID Eletrônica (RFID)", "Superior", "Tabela", "Adicionais", "Desativado"),
        ("Nº SISBOV",        "Superior", "Tabela", "Adicionais", "Desativado"),
        ("Sexo *",           "—", "Tabela", "—", "—"),
        ("Porte *",          "Superior", "Tabela", "Adicionais", "Desativado"),
        ("Colostro?",        "Superior", "Tabela", "Adicionais", "Desativado"),
        ("Peso nasc.",       "Superior", "Tabela", "Adicionais", "Desativado"),
        ("Pesagem",          "Superior", "Tabela", "Adicionais", "Desativado"),
        ("Sanitário (seção)", "Superior", "—", "—", "Desativado"),
    ]
    yy = hy + 32
    # Definir qual destino fica ATIVO por linha (exemplificando)
    actives = ["tabela","tabela","top","top","top","tabela","tabela","tabela","tabela","tabela","tabela","tabela","top"]
    def pill_cell(label_text, kind, on):
        color_map = {
            "top": ("#fef6e0","#a06a12","#f3d98a"),
            "tabela": ("#e3f7ea","#15803d","#9bdcb2"),
            "dados": ("#e7f6ec","#16a34a","#b7e0c4"),
            "off": ("#fdecec","#dc2626","#f3c0c0"),
        }
        return color_map[kind]

    for i, (name, c1, c2, c3, c4) in enumerate(rows):
        a = actives[i]
        # Alça
        d.text((mx+30, yy+8), "⠿", fill=GRAY_400, font=F_TXT())
        d.text((mx+54, yy+8), name, fill=TXT, font=F_TXT())
        cx = mx+24+380
        cells = [(c1,"top"),(c2,"tabela"),(c3,"dados"),(c4,"off")]
        widths = [180,200,180,130]
        for (txt, kind), ww in zip(cells, widths):
            if txt == "—":
                cx += ww
                continue
            on = (a == kind)
            on_fill, on_color, on_outline = pill_cell(txt, kind, on)
            if on:
                rounded(d, (cx, yy, cx+ww-20, yy+30), 10, fill=on_fill, outline=on_outline, width=1)
                d.text((cx+12, yy+8), txt, fill=on_color, font=F_BTN())
            else:
                rounded(d, (cx, yy, cx+ww-20, yy+30), 10, fill=WHITE, outline=BORDER, width=1)
                d.text((cx+12, yy+8), txt, fill=GRAY_500, font=F_BTN())
            cx += ww
        yy += 42

    # Rodapé do modal
    fy = my + mh - 70
    hr(d, mx+20, fy, mw-40)
    # Toggle Nº auto
    d.text((mx+24, fy+22), "Numeração automática (ID Manejo):", fill=GRAY_600, font=F_TXT())
    rounded(d, (mx+260, fy+18, mx+304, fy+44), 99, fill=GREEN)
    d.ellipse([(mx+286, fy+20), (mx+302, fy+42)], fill=WHITE)
    # Botões
    btn_outline_gray(d, mx+mw-280, fy+18, 130, 32, "Restaurar padrão")
    btn_primary(d, mx+mw-140, fy+18, 110, 32, "✓ Concluir")

    img.save(IMG_DIR / "03_config_campos.png")

# ──────────────────────────────────────────────────────────────────────────────
# Mockup 4 — Seção Sanitário aberta
# ──────────────────────────────────────────────────────────────────────────────
def mock_4_sanitario():
    W, H = 1440, 760
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Cabeçalho mínimo
    d.text((30, 24), "Defina seus campos › Sanitário (recolhível)", fill=GRAY_500, font=F_SM())

    # Card sanitário
    x0, y0, w, h = 30, 58, W-60, 680
    card(d, x0, y0, w, h)
    d.text((x0+24, y0+18), "Sanitário", fill=GREEN, font=F_H1())
    d.text((x0+24, y0+50),
           "Aplicações sanitárias do lançamento (nível movimento). "
           "Use 'Aplicação Única' ou um 'Protocolo' pré-configurado.",
           fill=GRAY_500, font=F_SM())

    # Tipo de aplicação
    label(d, x0+24, y0+88, "Tipo de Aplicação")
    # Rádios
    rx = x0+24; ry = y0+114
    d.ellipse([(rx, ry), (rx+18, ry+18)], outline=GREEN, width=2)
    d.ellipse([(rx+4, ry+4), (rx+14, ry+14)], fill=GREEN)
    d.text((rx+26, ry), "Aplicação Única", fill=TXT, font=F_TXT())
    rx2 = rx+170
    d.ellipse([(rx2, ry), (rx2+18, ry+18)], outline=GRAY_400, width=2)
    d.text((rx2+26, ry), "Protocolo", fill=TXT, font=F_TXT())

    # Protocolo (desabilitado quando Única)
    label(d, x0+24, y0+150, "Protocolo Sanitário")
    select_box(d, x0+24, y0+174, 480, value="", placeholder="Selecione um item")

    # Linha de aplicação
    py = y0+232
    fields = [
        ("Vacina/Medicamento", 260, "Vacina Clostridiose"),
        ("Unidade de Medida",  130, "DOSE"),
        ("Tipo de Dose",       130, "Fixa"),
        ("Dose *",             110, "1,00"),
        ("Por Cada (X) Kg",    150, "0,00"),
    ]
    cx = x0+24
    for lbl, ww, val in fields:
        label(d, cx, py, lbl)
        select_box(d, cx, py+22, ww, value=val) if "Vacina" in lbl or "Tipo" in lbl else input_box(d, cx, py+22, ww, value=val)
        cx += ww + 14
    btn_primary(d, cx, py+22, 130, 34, "+ Adicionar")

    # Tabela
    tb_y = y0 + 340
    headers = ["VACINA/MEDICAMENTO", "TIPO DE DOSE", "QTDE/POR CADA (X) KG", "DOSE", "UNIDADE", "CUSTO DA APLICAÇÃO", "AÇÕES"]
    widths = [260, 140, 220, 80, 120, 220, 120]
    rounded(d, (x0+24, tb_y, x0+24+sum(widths), tb_y+30), 6, fill="#fcfcfd")
    cx = x0+30
    for h_, w_ in zip(headers, widths):
        d.text((cx, tb_y+8), h_, fill=GRAY_500, font=F_TBL_TH())
        cx += w_
    rows = [
        ("Vacina Clostridiose", "Fixa", "—", "1,00", "DOSE", "R$ 1,80", "✎  🗑"),
        ("Vermífugo Ivermectina 1%", "Por Peso", "30 Kg", "5,00", "ML", "R$ 3,25", "✎  🗑"),
    ]
    yy = tb_y + 36
    for r in rows:
        cx = x0+30
        for c, w_ in zip(r, widths):
            d.text((cx, yy), c, fill=GRAY_700, font=F_TBL_TD())
            cx += w_
        yy += 28
        hr(d, x0+24, yy-4, sum(widths))
    # Total
    yy += 6
    rounded(d, (x0+24, yy, x0+24+sum(widths), yy+30), 6, fill="#fcfcfd")
    d.text((x0+30, yy+8), "Custo total da aplicação", fill=TXT, font=F_LBL())
    d.text((x0+24+sum(widths)-260, yy+8), "R$ 5,05", fill=GREEN, font=F_H2())

    img.save(IMG_DIR / "04_sanitario.png")

# ──────────────────────────────────────────────────────────────────────────────
# Mockup 5 — Atribuir ID (painel inferior)
# ──────────────────────────────────────────────────────────────────────────────
def mock_5_atribuir_id():
    W, H = 1440, 620
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    x0, y0, w, h = 30, 30, W-60, 560
    card(d, x0, y0, w, h)
    # Header
    d.text((x0+24, y0+16), "Atribuição de ID", fill=TXT, font=F_H1())
    # Chip status
    pill(d, x0+w-360, y0+22, "5 de 18 detalhados", fill=ORANGE_BG, color=ORANGE)
    btn_outline_gray(d, x0+w-160, y0+18, 80, 30, "✕ Fechar")

    # Subtítulo / hint
    rounded(d, (x0+24, y0+58, x0+w-24, y0+90), 8, fill="#fafbfc")
    d.text((x0+36, y0+66),
           "🆔  Individualizando o nascimento de 22/06/2026 — total 18 cab. "
           "(a quantidade é a base de conciliação). A categoria de cada bezerro é definida aqui.",
           fill=GRAY_500, font=F_SM())

    # Chips por categoria
    cy = y0 + 104
    pill(d, x0+24, cy, "Bezerros Mamando: 5", fill=GREEN_BG, color=GREEN)
    pill(d, x0+200, cy, "13 a detalhar", fill="#eef0f2", color=GRAY_500)

    # Tabela
    tb_y = y0 + 142
    headers = ["ID MANEJO", "CATEGORIA", "ID ELETRÔNICA", "SISBOV", "PESO", "PORTE", ""]
    widths = [180, 240, 180, 160, 130, 110, 220]
    rounded(d, (x0+24, tb_y, x0+24+sum(widths), tb_y+30), 6, fill="#fcfcfd")
    cx = x0+30
    for h_, w_ in zip(headers, widths):
        d.text((cx, tb_y+8), h_, fill=GRAY_500, font=F_TBL_TH())
        cx += w_

    # Linha de inclusão (destaque)
    inc_y = tb_y + 36
    rounded(d, (x0+24, inc_y, x0+24+sum(widths), inc_y+44), 6, fill="#f7faff")
    cx = x0+30
    inputs = [
        ("ID Manejo *", 160),
        ("Bezerros Mamando", 220),
        ("RFID", 160),
        ("SISBOV", 140),
        ("0,00", 110),
        ("M", 90),
    ]
    for v, w_ in inputs:
        rounded(d, (cx, inc_y+6, cx+w_, inc_y+38), 6, fill=WHITE, outline=BORDER, width=1)
        d.text((cx+8, inc_y+13), v, fill=TXT if v not in ("ID Manejo *","RFID","SISBOV","0,00") else GRAY_400, font=F_TXT())
        cx += w_ + 10
    btn_primary(d, x0+24+sum(widths)-160, inc_y+6, 130, 32, "+ Adicionar")

    # Linhas das fichas já criadas
    rows = [
        ("504A", "Bezerros Mamando", "BR1003500", "—", "32,5 kg", "M"),
        ("505A", "Bezerros Mamando", "—",          "—", "30,2 kg", "M"),
        ("506A", "Bezerros Mamando", "BR1003501", "—", "28,8 kg", "P"),
        ("507A", "Bezerros Mamando", "—",          "—", "31,0 kg", "M"),
        ("508A", "Bezerros Mamando", "BR1003502", "—", "29,6 kg", "M"),
    ]
    yy = inc_y + 56
    for r in rows:
        cx = x0+30
        for c, w_ in zip(r, widths[:-1]):
            d.text((cx, yy), c, fill=TXT if r.index(c)==0 else GRAY_700, font=F_TBL_TD())
            cx += w_
        yy += 28
        hr(d, x0+24, yy-4, sum(widths))

    img.save(IMG_DIR / "05_atribuir_id.png")

# ──────────────────────────────────────────────────────────────────────────────
# Mockup 6 — Aba Registros (master-detail)
# ──────────────────────────────────────────────────────────────────────────────
def mock_6_registros():
    W, H = 1440, 900
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    draw_app_header(d, W, aba_lancar=False, qtd_movs=4)

    # Subtítulo
    d.text((80, 130), "Todos os lançamentos — Nascimento", fill=TXT, font=F_H1())
    d.text((80, 158),
           "Clique em um lançamento para abri-lo; use ••• para ver, editar, atribuir ID ou excluir.",
           fill=GRAY_500, font=F_SM())

    # Card master-detail
    x0, y0 = 80, 190; cw = W-110; ch = 670
    card(d, x0, y0, cw, ch)

    # Master (50%)
    master_h = int(ch * 0.45)
    # Header da tabela
    rounded(d, (x0+1, y0+1, x0+cw-1, y0+34), 6, fill="#fcfcfd")
    headers = ["", "DATA", "CATEGORIA", "QTD", "AÇÕES"]
    widths = [50, 140, cw-50-140-120-120, 120, 120]
    cx = x0+12
    for h_, w_ in zip(headers, widths):
        d.text((cx, y0+10), h_, fill=GRAY_500, font=F_TBL_TH())
        cx += w_
    # Linhas
    rows = [
        ("▸", "22/06/2026", "Bezerros Mamando (18)", "+18", True),
        ("▾", "20/06/2026", "Bezerros Mamando (12), Bezerras (8)", "+20", False),
        ("▸", "18/06/2026", "Bezerros Mamando (5)", "+5", False),
        ("▸", "15/06/2026", "A detalhar", "+10", False),
    ]
    yy = y0+40
    for i, (caret, data, cat, qtd, selected) in enumerate(rows):
        bg = GREEN_BG if selected else None
        if bg:
            rounded(d, (x0+1, yy, x0+cw-1, yy+44), 0, fill=bg)
        cx = x0+12
        # ▸
        d.text((cx+8, yy+12), caret, fill=GREEN if (caret=="▾" or selected) else GRAY_300, font=F_TXT())
        cx += widths[0]
        d.text((cx, yy+12), data, fill=GRAY_700, font=F_TBL_TD())
        cx += widths[1]
        d.text((cx, yy+12), cat, fill=GREEN if selected else TXT, font=F_LBL())
        cx += widths[2]
        d.text((cx+40, yy+12), qtd, fill=GRAY_700, font=F_TBL_TD())
        cx += widths[3]
        d.text((cx+44, yy+12), "•••", fill=GRAY_500, font=F_TXT())
        yy += 44
        if caret == "▾":
            # categorias expandidas
            cats = [("● Bezerros Mamando", "12"), ("● Bezerras Mamando", "8")]
            for nm, q in cats:
                rounded(d, (x0+1, yy, x0+cw-1, yy+34), 0, fill=GREEN_LT)
                d.text((x0+90, yy+8), nm, fill=GRAY_700, font=F_TBL_TD())
                d.text((x0+cw-260, yy+8), q, fill=GREEN, font=F_LBL())
                d.text((x0+cw-122, yy+8), "•••", fill=GRAY_500, font=F_TXT())
                yy += 34
        if i < 3:
            hr(d, x0+1, yy, cw-2)

    # Régua arrastável
    drag_y = y0 + master_h + 30
    rounded(d, (x0+1, drag_y-2, x0+cw-1, drag_y+8), 0, fill="#fafbfc")
    rounded(d, (x0 + cw//2 - 20, drag_y, x0 + cw//2 + 20, drag_y+4), 2, fill=GREEN_LN)

    # Detail (50%)
    dx = x0+24; dy = drag_y + 22
    d.text((dx, dy), "Detalhamento · 20/06/2026", fill=TXT, font=F_H2())
    pill(d, dx+260, dy+2, "20 cab.", fill="#eef0f2", color=GRAY_600)
    pill(d, dx+340, dy+2, "ℹ 12 de 20 detalhados", fill=ORANGE_BG, color=ORANGE)
    btn_primary(d, x0+cw-180, dy-2, 150, 30, "🆔 Atribuir ID")

    # Tabela detalhe (somente leitura)
    tb_y = dy + 40
    headers = ["ID MANEJO", "CATEGORIA", "ID ELETRÔNICA", "SISBOV", "PESO", "PORTE"]
    widths = [140, 260, 180, 160, 140, 120]
    rounded(d, (dx, tb_y, dx+sum(widths), tb_y+28), 6, fill="#fcfcfd")
    cx = dx + 8
    for h_, w_ in zip(headers, widths):
        d.text((cx, tb_y+8), h_, fill=GRAY_500, font=F_TBL_TH())
        cx += w_

    rows2 = [
        ("504A", "Bezerros Mamando", "BR1003500", "—", "32,5 kg", "M"),
        ("505A", "Bezerros Mamando", "—",          "—", "30,2 kg", "M"),
        ("506A", "Bezerras Mamando", "BR1003510", "—", "28,8 kg", "P"),
        ("507A", "Bezerras Mamando", "—",          "—", "31,0 kg", "M"),
    ]
    yy = tb_y + 34
    for r in rows2:
        cx = dx + 8
        for c, w_ in zip(r, widths):
            d.text((cx, yy), c, fill=GRAY_700, font=F_TBL_TD())
            cx += w_
        yy += 26
        hr(d, dx, yy-4, sum(widths))

    img.save(IMG_DIR / "06_registros.png")

# ──────────────────────────────────────────────────────────────────────────────
# Mockup 7 — Importar planilha (drawer)
# ──────────────────────────────────────────────────────────────────────────────
def mock_7_importar_planilha():
    W, H = 1280, 760
    img = Image.new("RGB", (W, H), "#0f172abb")
    d = ImageDraw.Draw(img)

    mx, my, mw, mh = 60, 40, W-120, H-80
    rounded(d, (mx, my, mx+mw, my+mh), 18, fill=WHITE, outline=BORDER, width=1)

    d.text((mx+24, my+20), "Importar planilha", fill=TXT, font=F_TITLE())
    d.text((mx+24, my+54),
           "Confira o conteúdo antes de lançar em massa. Linhas válidas serão "
           "adicionadas como animais detalhados; linhas com erro ficam destacadas.",
           fill=GRAY_500, font=F_SM())
    d.text((mx+mw-36, my+22), "✕", fill=GRAY_500, font=F_H1())

    # Box de arquivo + KPIs
    by = my + 100
    rounded(d, (mx+24, by, mx+360, by+74), 10, fill=GREEN_BG, outline=GREEN_LN, width=1)
    d.text((mx+40, by+12), "📄  modelo-lancamento-nascimento.xlsx", fill=GREEN, font=F_BTN())
    d.text((mx+40, by+38), "32 linhas detectadas", fill=GREEN_DK, font=F_SM())

    pill(d, mx+400, by+8, "28 válidas", fill=GREEN_BG, color=GREEN)
    pill(d, mx+500, by+8, "3 com erro", fill="#fdecec", color=RED)
    pill(d, mx+600, by+8, "1 duplicada", fill=YELLOW_BG, color=YELLOW)

    # Tabela preview
    tb_y = my + 200
    headers = ["LINHA", "ID MANEJO", "CATEGORIA", "SEXO", "PESO", "STATUS"]
    widths = [80, 160, 240, 110, 120, mw - 80 - 160 - 240 - 110 - 120 - 40]
    rounded(d, (mx+24, tb_y, mx+mw-24, tb_y+30), 6, fill="#fcfcfd")
    cx = mx+34
    for h_, w_ in zip(headers, widths):
        d.text((cx, tb_y+8), h_, fill=GRAY_500, font=F_TBL_TH())
        cx += w_

    rows = [
        ("1", "504A", "Bezerros Mamando", "♂ M", "32,5 kg", ("OK", "ok")),
        ("2", "505A", "Bezerros Mamando", "♀ F", "30,2 kg", ("OK", "ok")),
        ("3", "506A", "—",                "♂ M", "28,8 kg", ("Categoria vazia", "err")),
        ("4", "504A", "Bezerros Mamando", "♂ M", "32,0 kg", ("ID duplicado", "warn")),
        ("5", "507A", "Bezerros Mamando", "♀ F", "31,0 kg", ("OK", "ok")),
    ]
    yy = tb_y+36
    for r in rows:
        cx = mx+34
        for j, (c, w_) in enumerate(zip(r, widths)):
            if j == 5:
                txt_, kind = c
                colors = {"ok": (GREEN_BG, GREEN), "err": ("#fdecec", RED), "warn": (YELLOW_BG, YELLOW)}
                pill(d, cx, yy-3, txt_, fill=colors[kind][0], color=colors[kind][1])
            else:
                d.text((cx, yy), str(c), fill=GRAY_700, font=F_TBL_TD())
            cx += w_
        yy += 28
        hr(d, mx+24, yy-4, mw-48)

    # Rodapé
    fy = my+mh-70
    hr(d, mx+20, fy, mw-40)
    btn_outline_gray(d, mx+24, fy+18, 180, 32, "Escolher outro arquivo")
    btn_outline_gray(d, mx+mw-260, fy+18, 100, 32, "Cancelar")
    btn_primary(d, mx+mw-150, fy+18, 130, 32, "✓ Importar 28")

    img.save(IMG_DIR / "07_importar_planilha.png")

# ──────────────────────────────────────────────────────────────────────────────
# Mockup 8 — Fluxograma de dados (modelo conceitual)
# ──────────────────────────────────────────────────────────────────────────────
def mock_8_fluxo_dados():
    W, H = 1400, 760
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    d.text((40, 24), "Modelo de dados — Movimentação › Nascimento", fill=TXT, font=F_TITLE())
    d.text((40, 56), "Camada dupla aditiva: declarado (sem ID) + detalhado (com ID), reconciliados pela quantidade total.",
           fill=GRAY_500, font=F_SM())

    # Entidades
    def box(x, y, w, h, title, fields, fill=WHITE):
        rounded(d, (x, y, x+w, y+h), 12, fill=fill, outline=BORDER, width=1)
        rounded(d, (x, y, x+w, y+30), 0, fill=GREEN_BG)
        d.text((x+12, y+8), title, fill=GREEN, font=F_LBL())
        yy = y+38
        for f in fields:
            d.text((x+12, yy), f, fill=GRAY_700, font=F_SM())
            yy += 18

    box(60, 110, 360, 260, "nascimento_movimentos",
        [
            "id (uuid, pk)",
            "organization_id (fk)",
            "farm_id, local_id, retiro, proprietario_id",
            "data (date)  ·  safra (text)",
            "qtd (int)  · nao_identificados (int)",
            "status: 'pendente' | 'conciliado'",
            "catDecl (jsonb) — [{catId,qtd}]",
            "sanitario (jsonb) — SanItem[]",
            "criado_por (fk)",
            "created_at / updated_at",
        ],
        fill="#fffefb")

    box(540, 110, 360, 220, "nascimento_fichas",
        [
            "id (uuid, pk)",
            "movimento_id (fk → movimentos)",
            "categoria_id (fk → animal_categories)",
            "apelido (text)  — ID Manejo",
            "rfid · sisbov · porte · raca",
            "peso (numeric 8,2)",
            "extras (jsonb)  — Campos Personalizados (cp_*)",
            "created_at",
        ])

    box(540, 360, 360, 130, "nascimento_field_configs",
        [
            "organization_id (unique)",
            "config (jsonb)",
            "  • places: Record<fieldId, place>",
            "  • order: string[]  · autonum: boolean",
        ])

    box(1010, 110, 340, 220, "animal_categories  (lookup)",
        [
            "id (uuid)",
            "nome  ·  sexo (m/f)",
            "grupo = 'bezerros_mamando' (filtro)",
            "Mostradas no select Categoria",
        ])

    box(1010, 360, 340, 120, "fichas_animal  (cadastro)",
        [
            "Geração futura automática a partir das",
            "nascimento_fichas (vínculo via nascimento_ficha_id).",
        ])

    # Setas
    def arrow(x1, y1, x2, y2, label=""):
        d.line([(x1, y1), (x2, y2)], fill=GREEN, width=2)
        d.polygon([(x2, y2), (x2-8, y2-5), (x2-8, y2+5)], fill=GREEN)
        if label:
            d.text(((x1+x2)//2 - 60, (y1+y2)//2 - 18), label, fill=GREEN, font=F_SMB())

    arrow(420, 220, 538, 220, "1 → N (fichas)")
    arrow(900, 220, 1008, 220, "N → 1 (categoria)")
    arrow(900, 420, 1008, 420, "vínculo futuro")

    # Legenda
    ly = 540
    d.text((60, ly), "Invariantes-chave", fill=TXT, font=F_H2())
    items = [
        "• qtd = naoIdentificados + fichas.length  →  base de conciliação.",
        "• status = 'conciliado' quando naoIdentificados == 0; senão 'pendente'.",
        "• catDecl é a distribuição CONSOLIDADA (declarado sem ID + detalhado por categoria).",
        "• Salvar com fichas: a parte declarada do mesmo catId é descontada para evitar dupla contagem.",
        "• Add ficha (atribuição posterior): naoIdentificados-- e status recalculado no servidor.",
        "• Update substitui as fichas integralmente pelo conjunto reenviado pelo formulário.",
        "• Sanitário e extras (Campos Personalizados) são snapshots — não criam tabelas próprias.",
    ]
    for i, it in enumerate(items):
        d.text((60, ly+30+i*22), it, fill=GRAY_700, font=F_TXT())

    img.save(IMG_DIR / "08_fluxo_dados.png")

# ──────────────────────────────────────────────────────────────────────────────
# Build all
# ──────────────────────────────────────────────────────────────────────────────
print("Gerando mockups…")
mock_1_coletivo()
mock_2_individual()
mock_3_config_modal()
mock_4_sanitario()
mock_5_atribuir_id()
mock_6_registros()
mock_7_importar_planilha()
mock_8_fluxo_dados()
print("OK — imagens em", IMG_DIR)
