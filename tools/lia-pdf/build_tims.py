#!/usr/bin/env python3
"""TIMS International house-style PDF — LIA (MIL) item bank and answer key.

Two editions from one source:  python3 build_tims.py --lang es | --lang en
"""
import json, os, glob, sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, PageBreak, Flowable, KeepTogether,
                                Image as RLImage)

LANG = 'es'          # set by main(); 'es' or 'en'

def L(es, en):
    """Pick the string for the edition being built.

    Named L, not t: `t` is used as a local for Table(...) all through story().
    """
    return es if LANG == 'es' else en

HERE = os.path.dirname(os.path.abspath(__file__))
ITEMS = json.load(open(os.path.join(HERE, 'items.json'), encoding='utf-8'))
A = os.path.join(HERE, 'assets')
LOGO_NAVY  = glob.glob(os.path.join(A, '*id6d06c962d87b*.png'))[0]
LOGO_WHITE = glob.glob(os.path.join(A, '*i6408beff6a8ca*.png'))[0]
FIG_RED    = glob.glob(os.path.join(A, '*id84530683427f*.png'))[0]
FIG_GHOST  = glob.glob(os.path.join(A, '*iffc3fd5971dc3*.png'))[0]

# ---- fonts: the house serif is Georgia, code is Menlo
SUP = '/System/Library/Fonts/Supplemental/'
pdfmetrics.registerFont(TTFont('Georgia', SUP + 'Georgia.ttf'))
pdfmetrics.registerFont(TTFont('Georgia-Bold', SUP + 'Georgia Bold.ttf'))
pdfmetrics.registerFont(TTFont('Georgia-Italic', SUP + 'Georgia Italic.ttf'))
pdfmetrics.registerFontFamily('Georgia', normal='Georgia', bold='Georgia-Bold', italic='Georgia-Italic')
try:
    pdfmetrics.registerFont(TTFont('Menlo', '/System/Library/Fonts/Menlo.ttc', subfontIndex=0))
    MONO = 'Menlo'
except Exception:
    MONO = 'Courier'

NAVY = HexColor('#0D0E4F'); RED = HexColor('#E40104')
COVER = HexColor('#111449'); COVER2 = HexColor('#1A1E63')
INK = HexColor('#1A1A2E'); INK2 = HexColor('#4A4A66'); INK3 = HexColor('#8A8AA0')
LINE = HexColor('#D6D6E0'); LINE2 = HexColor('#EDEDF3'); ZEB = HexColor('#F7F7FB')
GOOD = HexColor('#1B6B44'); GOODBG = HexColor('#E7F3EC')
WARN = HexColor('#A05A00'); WARNBG = HexColor('#FBEFDF')
CRIT = HexColor('#C0121A'); CRITBG = HexColor('#FBE6E7')
COOLBG = HexColor('#EAEAF4')

PW, PH = letter
LM = RM = 70; TM = 92; BM = 74
CW = PW - LM - RM
SECTION_PAGES = {}

def S(n, **kw):
    b = dict(fontName='Georgia', fontSize=9.6, leading=14.2, textColor=INK, alignment=TA_LEFT, spaceAfter=0)
    b.update(kw); return ParagraphStyle(n, **b)

BODY  = S('b', spaceAfter=8)
NOTE  = S('n', fontSize=8.6, leading=12.6, textColor=INK2)
EYE   = S('e', fontSize=8, leading=11, textColor=INK3)
H1    = S('h1', fontName='Georgia', fontSize=25, leading=29, textColor=NAVY, spaceAfter=2)
H1SUB = S('h1s', fontName='Georgia-Italic', fontSize=10.6, leading=14, textColor=INK2, spaceAfter=0)
H2    = S('h2', fontName='Georgia-Bold', fontSize=12, leading=16, textColor=NAVY, spaceAfter=5)
CELL  = S('c', fontSize=8.4, leading=11.2)
CELLC = S('cc', fontSize=8.4, leading=11.2, alignment=TA_CENTER)
CELLM = S('cm', fontName=MONO, fontSize=8, leading=11.2, alignment=TA_CENTER)
CELLK = S('ck', fontName='Georgia-Bold', fontSize=8.4, leading=11.2, alignment=TA_CENTER, textColor=NAVY)
TH    = S('th', fontName='Georgia-Bold', fontSize=7.8, leading=10.4, textColor=colors.white)
THC   = S('thc', fontName='Georgia-Bold', fontSize=7.8, leading=10.4, textColor=colors.white, alignment=TA_CENTER)

def sp(s):  # letterspaced house eyebrow
    return ' '.join(s)

SUBTESTS = [
    ('pattern_recognition', 'Reconocimiento de Patrones', 'Pattern Recognition', 60, 180,
     ('¿Cuántas columnas tienen letras iguales? (sin importar mayúsculas/minúsculas)',
      'How many columns contain the same letter? (case is ignored)')),
    ('verbal_reasoning', 'Razonamiento Verbal', 'Verbal Reasoning', 50, 240, None),
    ('numerical_speed', 'Velocidad Numérica', 'Numerical Speed', 60, 240,
     ('¿Cuál número está más lejos del valor medio?',
      'Which number is farther from the middle number?')),
    ('working_memory', 'Memoria de Trabajo', 'Working Memory', 60, 240,
     ('¿Cuál letra exterior está más lejos alfabéticamente de la letra del centro?',
      'Which outer letter is alphabetically farther from the middle letter?')),
    ('visual_rotation', 'Rotación Visual', 'Visual Rotation', 60, 300,
     ('¿Cuántas columnas tienen figuras iguales? (rotaciones permitidas, espejos no)',
      'How many columns contain the same figure? (rotations allowed, mirrors not)')),
]
MIRROR = 'ᖉ'
def toc():
    return [
      ('01', L('Resumen','Summary'),
             L('Qué es este documento y de dónde sale','What this document is and where it comes from')),
      ('02', L('El instrumento','The instrument'),
             L('Las cinco subpruebas, tiempos y tipo de respuesta','The five subtests, timings and answer format')),
      ('03', L('Cómo se califica','How it is scored'),
             L('La regla exacta de cada subprueba','The exact rule for each subtest')),
      ('04', L('Idiomas','Languages'),
             L('Qué está traducido y qué solo lo parece','What is translated and what only looks like it')),
      ('05', L('Reconocimiento de Patrones','Pattern Recognition'),
             L('3 de práctica + 60 calificados','3 practice + 60 scored')),
      ('06', L('Razonamiento Verbal','Verbal Reasoning'),
             L('3 + 50, en español e inglés','3 + 50, in Spanish and English')),
      ('07', L('Velocidad Numérica','Numerical Speed'),
             L('3 + 60 calificados','3 + 60 scored')),
      ('08', L('Memoria de Trabajo','Working Memory'),
             L('3 + 60 calificados','3 + 60 scored')),
      ('09', L('Rotación Visual','Visual Rotation'),
             L('3 + 60, con la orientación de cada R','3 + 60, with the orientation of every R')),
      ('10', L('Distribución de la clave','Answer key distribution'),
             L('Balance del banco','How balanced the bank is')),
      ('11', L('Advertencias','Cautions'),
             L('Lo que conviene saber antes de aplicarlo','What to know before administering it')),
    ]

def items_of(k, p):
    return sorted([i for i in ITEMS if i['subtest']==k and i['practice']==p], key=lambda r: r['n'])

# ---------------- answers, spelled out
def pr_cols(q):
    m = [i+1 for i in range(4) if q['row1'][i].lower()==q['row2'][i].lower()]
    return L('ninguna','none') if not m else (L('col. ','col. ') + ', '.join(map(str,m)))
def vr_cols(q):
    ch = lambda t: MIRROR if t.startswith(MIRROR) else 'R'
    m = [i+1 for i in range(3) if ch(q['topRow'][i])==ch(q['bottomRow'][i])]
    return L('ninguna','none') if not m else (L('col. ','col. ') + ', '.join(map(str,m)))
def ns_val(q, k): return str(q['numbers']['ABC'.index(k)])
def wm_val(q, k): return q['letters'][0] if k=='left' else q['letters'][2]
def vb_val(q, k):
    try: return q['options']['ABC'.index(k)]
    except Exception: return '—'

# ---------------- flowables
class Mark(Flowable):
    def __init__(self, key): super().__init__(); self.key=key; self.width=0; self.height=0
    def wrap(self,a,b): return (0,0)
    def draw(self): SECTION_PAGES[self.key]=self.canv.getPageNumber()

class Rule2(Flowable):
    """House two-tone rule: red segment, then navy."""
    def __init__(self, w=CW, red=86, th=2.2, top=9, bot=13):
        super().__init__(); self.width=w; self.red=red; self.th=th
        self.top=top; self.bot=bot; self.height=th+top+bot
    def wrap(self,a,b): return (self.width,self.height)
    def draw(self):
        c=self.canv; y=self.bot
        c.setLineWidth(self.th); c.setStrokeColor(NAVY)
        c.line(self.red, y, self.width, y)
        c.setStrokeColor(RED); c.line(0, y, self.red, y)

def draw_R(c, x, y, mirrored, deg, size):
    """The app draws a serif R with CSS `scaleX(-1) rotate(Ndeg)`. CSS y points down, PDF y points
    up, so the angle is negated; the rotation is applied to the glyph first, the mirror second."""
    c.saveState(); c.translate(x,y)
    if mirrored: c.scale(-1,1)
    c.rotate(-deg)
    c.setFont('Georgia-Bold', size); c.setFillColor(INK)
    c.drawCentredString(0, -size*0.35, 'R')
    c.restoreState()

def parse_tok(t): return (t.startswith(MIRROR), int(t.split('_')[1]))
def tok_lab(t):
    m,d = parse_tok(t); return ('M' if m else 'R') + str(d)

class VRRow(Flowable):
    CW_, CH_ = 116.0, 104.0
    def __init__(self, its, n=4):
        super().__init__(); self.its=its; self.n=n; self.width=CW; self.height=self.CH_
    def wrap(self,a,b): return (self.width,self.height)
    def draw(self):
        c=self.canv
        gap=(CW-self.n*self.CW_)/max(1,self.n-1)
        for k,it in enumerate(self.its):
            x0=k*(self.CW_+gap); q=it['q']
            c.setFillColor(colors.white); c.setStrokeColor(LINE); c.setLineWidth(0.7)
            c.rect(x0,0,self.CW_,self.CH_,stroke=1,fill=1)
            c.setFillColor(NAVY); c.rect(x0,self.CH_-15,self.CW_,15,stroke=0,fill=1)
            c.setFillColor(colors.white); c.setFont('Georgia-Bold',7.6)
            c.drawString(x0+6,self.CH_-10.6, ('P' if it['practice'] else '') + str(it['n']))
            c.drawRightString(x0+self.CW_-6,self.CH_-10.6, L('Clave ','Key ') + it['ans'])
            colw=self.CW_/3.0
            for r,row in enumerate((q['topRow'],q['bottomRow'])):
                cy=self.CH_-15-20-r*25
                for i,t in enumerate(row):
                    m,d=parse_tok(t); draw_R(c, x0+colw*(i+0.5), cy, m, d, 15)
            c.setStrokeColor(LINE2); c.setLineWidth(0.5)
            c.line(x0+7,self.CH_-47,x0+self.CW_-7,self.CH_-47)
            c.setFillColor(INK3); c.setFont(MONO,5.7)
            c.drawCentredString(x0+self.CW_/2, 25, ' '.join(tok_lab(t) for t in q['topRow']))
            c.drawCentredString(x0+self.CW_/2, 18, ' '.join(tok_lab(t) for t in q['bottomRow']))
            c.setFillColor(NAVY); c.setFont('Georgia-Bold',6.6)
            c.drawCentredString(x0+self.CW_/2, 6.5, L('Iguales: ','Matches: ') + vr_cols(q))

# ---------------- table helpers
def gstyle(nb=1, ncol=0):
    cmds=[('GRID',(0,0),(-1,-1),0.4,LINE),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
          ('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),
          ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
          ('BACKGROUND',(0,0),(-1,0),NAVY),
          ('TOPPADDING',(0,0),(-1,0),5),('BOTTOMPADDING',(0,0),(-1,0),5),
          ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,ZEB])]
    st=TableStyle(cmds)
    for b in range(1,nb): st.add('LINEBEFORE',(b*ncol,0),(b*ncol,-1),1.2,NAVY)
    return st

def nup(rows, header, colw, nb):
    per=(len(rows)+nb-1)//nb
    blocks=[rows[i*per:(i+1)*per] for i in range(nb)]
    mx=max(len(b) for b in blocks); nc=len(header)
    data=[header*nb]
    for r in range(mx):
        line=[]
        for b in blocks: line += b[r] if r<len(b) else ['']*nc
        data.append(line)
    t=Table(data, colWidths=colw*nb, repeatRows=1, hAlign='LEFT')
    t.setStyle(gstyle(nb,nc)); return t

def kv(pairs, w1=140):
    d=[[Paragraph(f'<b>{k}</b>',CELL), Paragraph(v,CELL)] for k,v in pairs]
    t=Table(d,colWidths=[w1,CW-w1],hAlign='LEFT')
    t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),0.4,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BACKGROUND',(0,0),(0,-1),ZEB),('LEFTPADDING',(0,0),(-1,-1),7),
        ('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),5),
        ('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    return t

def box(title, body, fg=CRIT, bg=CRITBG):
    inner=[[Paragraph(title, S('bt',fontName='Georgia-Bold',fontSize=9.2,leading=12,textColor=fg))],
           [Paragraph(body, NOTE)]]
    t=Table(inner,colWidths=[CW-18],hAlign='LEFT')
    t.setStyle(TableStyle([('LEFTPADDING',(0,0),(-1,-1),11),('RIGHTPADDING',(0,0),(-1,-1),11),
        ('TOPPADDING',(0,0),(0,0),8),('TOPPADDING',(0,1),(-1,1),2),
        ('BOTTOMPADDING',(0,-1),(-1,-1),9),('BACKGROUND',(0,0),(-1,-1),bg),
        ('LINEBEFORE',(0,0),(0,-1),2.6,fg)]))
    return KeepTogether(t)

# ---------------- page furniture
def cover_page(c, doc):
    c.saveState()
    c.setFillColor(COVER); c.rect(0,0,PW,PH,stroke=0,fill=1)
    c.setFillColor(COVER2); c.circle(PW*0.78, PH*0.66, 150, stroke=0, fill=1)
    c.drawImage(FIG_GHOST, PW*0.60, PH*0.20, width=250, height=364,
                mask='auto', preserveAspectRatio=True)
    c.setFillColor(COVER2); c.setFillAlpha(0.35)
    c.rect(0,0,PW,PH,stroke=0,fill=0); c.setFillAlpha(1)
    c.drawImage(LOGO_WHITE, LM, PH-150, width=150, height=76.6, mask='auto', preserveAspectRatio=True)
    c.setFillColor(HexColor('#AFAFD8')); c.setFont('Georgia', 8.4);
    c.drawString(LM, PH-250, sp(L('DOCUMENTACIÓN DE INSTRUMENTO','INSTRUMENT DOCUMENTATION')));
    c.setFillColor(colors.white); c.setFont('Georgia', 30)
    c.drawString(LM, PH-300, L('LIA (MIL): banco completo','LIA (MIL): the complete'))
    c.drawString(LM, PH-338, L('de ítems y clave','item bank and key'))
    c.setFillColor(HexColor('#C8C8E4')); c.setFont('Georgia', 11.6)
    for i,l in enumerate(L(['Los 305 ítems del instrumento en español e inglés, con la respuesta',
                            'correcta de cada uno y la orientación exacta de las figuras de',
                            'la subprueba de Rotación Visual'],
                           ['All 305 items of the instrument in Spanish and English, with the',
                            'correct answer to each and the exact orientation of every figure',
                            'in the Visual Rotation subtest'])):
        c.drawString(LM, PH-378-i*19, l)
    c.setStrokeColor(RED); c.setLineWidth(2.6); c.line(LM, PH-462, LM+186, PH-462)
    meta=[(L('Preparado para','Prepared for'),'TIMS International'),
          (L('Preparado por','Prepared by'),'NexaDev LLC'),
          (L('Instrumento','Instrument'),L('LIA — registrado internamente como MIL',
                                           'LIA — recorded internally as MIL')),
          (L('Contenido','Contents'),L('305 ítems · 15 de práctica y 290 calificados',
                                       '305 items · 15 practice and 290 scored')),
          (L('Origen','Source'),'lia-question-bank.json, lia-verbal-en.json'
                                + L(' y ',' and ') + 'LiaAnswerScoring.cs'),
          (L('Método','Method'),L('Extracción mecánica; la clave se recalculó con la lógica de producción',
                                  'Mechanical extraction; the key was recomputed with the production logic'))]
    y=PH-508
    for k,v in meta:
        c.setFillColor(HexColor('#9A9ACB')); c.setFont('Georgia',9.4); c.drawString(LM,y,k)
        c.setFillColor(colors.white); c.setFont('Georgia',9.4); c.drawString(LM+190,y,v)
        y-=28
    c.setStrokeColor(HexColor('#3A3A72')); c.setLineWidth(0.6); c.line(LM,116,PW-RM,116)
    c.setFillColor(HexColor('#C8C8E4')); c.setFont('Georgia',8);
    c.drawString(LM,98, sp(L('24 DE SEPTIEMBRE DE 2026','SEPTEMBER 24, 2026')) + '   ·   ' + sp('WWW.TIMSHR.COM'))
    c.setFillColor(HexColor('#E88B8D'))
    c.drawString(LM,78, sp(L('CONFIDENCIAL — CONTIENE LA CLAVE DE RESPUESTAS',
                             'CONFIDENTIAL — CONTAINS THE ANSWER KEY')))
    c.restoreState()

def body_page(c, doc):
    c.saveState()
    c.drawImage(LOGO_NAVY, LM, PH-72, width=96, height=49, mask='auto', preserveAspectRatio=True)
    c.setFillColor(INK2); c.setFont('Georgia',7.6)
    c.drawCentredString(PW/2, PH-52, L('LIA (MIL) · Banco de ítems y clave · Confidencial',
                                       'LIA (MIL) · Item bank and answer key · Confidential'))
    c.drawImage(FIG_RED, PW-RM-16, PH-70, width=16, height=23.3, mask='auto', preserveAspectRatio=True)
    c.setStrokeColor(LINE2); c.setLineWidth(0.6); c.line(LM,BM-26,PW-RM,BM-26)
    c.setFillColor(NAVY); c.setFont('Georgia',7.2);
    c.drawString(LM,BM-40, sp('WWW.TIMSHR.COM'));
    c.setFillColor(INK2); c.setFont('Georgia',8.6)
    c.drawRightString(PW-RM,BM-40, str(doc.page-1))
    c.restoreState()

def section(num, title, sub):
    return [Mark(num),
            Paragraph(sp(L('SECCIÓN','SECTION')) + '&nbsp;&nbsp;&nbsp;' + sp(num), EYE), Spacer(1,5),
            Paragraph(title, H1), Paragraph(sub, H1SUB), Rule2()]

# ---------------- story
def story(pass2):
    s=[]; A_=s.append
    A_(PageBreak())
    # ---- contenido
    A_(Paragraph(L('Contenido','Contents'), S('toc',fontName='Georgia',fontSize=24,leading=28,textColor=NAVY,spaceAfter=18)))
    d=[]
    for num,ttl,subt in toc():
        pg=(str(SECTION_PAGES[num]-1) if num in SECTION_PAGES else '') if pass2 else ''
        d.append([Paragraph(num, S('tn',fontName='Georgia',fontSize=11,textColor=INK3)),
                  Paragraph(f'{ttl}<br/><font size="8" color="#4A4A66"><i>{subt}</i></font>',
                            S('tt',fontSize=10.6,leading=14)),
                  Paragraph(pg, S('tp',fontSize=10,alignment=TA_RIGHT,textColor=INK2))])
    t=Table(d,colWidths=[46,CW-46-40,40],hAlign='LEFT')
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LINEBELOW',(0,0),(-1,-1),0.5,LINE2),
        ('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),
        ('LEFTPADDING',(0,0),(0,-1),0)]))
    A_(t); A_(PageBreak())

    # ---- 01 resumen
    for f in section('01',L('Resumen','Summary'),
                     L('Qué es este documento y de dónde sale',
                       'What this document is and where it comes from')): A_(f)
    A_(Paragraph(L('Este documento reúne los <b>305 ítems</b> del instrumento LIA con la respuesta correcta de cada '
        'uno, en español e inglés. Sirve para aplicar la prueba, revisar la calificación, trabajar la traducción '
        'y auditar. Ningún ítem fue transcrito a mano: todos salen de los archivos de datos del propio '
        'instrumento.',
        'This document gathers all <b>305 items</b> of the LIA instrument together with the correct answer to each, '
        'in Spanish and English. It is for administering the test, checking the scoring, working on the '
        'translation and auditing. No item was transcribed by hand: every one comes from the instrument\'s own '
        'data files.'), BODY))
    A_(Spacer(1,4))
    A_(kv([(L('Los 305 ítems','All 305 items'), f'<font face="{MONO}" size="8">Data/lia-question-bank.json</font>'),
           (L('Texto verbal en inglés','English verbal text'), f'<font face="{MONO}" size="8">Data/lia-verbal-en.json</font>'),
           (L('Clave de respuestas','Answer key'), L('Recalculada con','Recomputed with') + f' <font face="{MONO}" size="8">LiaAnswerScoring.cs</font>'),
           (L('Cantidades y tiempos','Counts and timings'), f'<font face="{MONO}" size="8">SUBTEST_CONFIG</font>' + L(' en',' in') + ' liaService.ts'),
           (L('Orientación de figuras','Figure orientation'), f'<font face="{MONO}" size="8">VisualRotationItem.tsx</font>')], 152))
    A_(Spacer(1,12))
    A_(Paragraph(L('Cómo se obtuvo la clave','How the key was obtained'), H2))
    A_(Paragraph(L('Cuatro de las cinco subpruebas <b>no guardan ninguna respuesta</b>: la correcta se calcula a partir '
        'de los datos del ítem en el momento de calificar. Por eso la clave de este documento tuvo que '
        'regenerarse, no leerse. Se reimplementó la lógica de producción tal como está en '
        f'<font face="{MONO}" size="8">LiaAnswerScoring.cs</font> y se contrastó con ejemplos resueltos de cada '
        'subprueba. Solo Razonamiento Verbal guarda su clave, y se reproduce literal.',
        'Four of the five subtests <b>store no answer at all</b>: the correct one is computed from the item\'s own '
        'data at the moment of scoring. That is why the key in this document had to be regenerated rather than '
        'read. The production logic was reimplemented exactly as it stands in '
        f'<font face="{MONO}" size="8">LiaAnswerScoring.cs</font> and checked against worked examples from every '
        'subtest. Only Verbal Reasoning stores its own key, and that is reproduced verbatim.'), BODY))
    A_(box(L('Editar un ítem cambia su respuesta, sin avisar','Editing an item changes its answer, silently'),
        L('Como la clave se deriva de los datos del ítem, cambiar una letra o un número mueve la respuesta correcta. '
        'No hay un archivo de claves que pueda quedar desfasado — pero tampoco hay ninguno que delate el error. '
        'Después de cualquier cambio en el banco, este documento se <b>regenera</b>; no se edita a mano.',
        'Because the key is derived from the item\'s data, changing a letter or a number moves the correct answer. '
        'There is no key file that can fall out of date — but equally there is none that would give the mistake '
        'away. After any change to the bank this document is <b>regenerated</b>; it is never edited by hand.'), WARN, WARNBG))
    A_(PageBreak())

    # ---- 02 instrumento
    for f in section('02',L('El instrumento','The instrument'),
                     L('Las cinco subpruebas, tiempos y tipo de respuesta',
                       'The five subtests, timings and answer format')): A_(f)
    h=[Paragraph('#',THC),Paragraph(L('Subprueba','Subtest'),TH),Paragraph(L('English','Español'),TH),
       Paragraph(L('Práctica','Practice'),THC),
       Paragraph(L('Calificados','Scored'),THC),Paragraph(L('Tiempo','Time'),THC),
       Paragraph(L('Respuesta','Answer'),THC)]
    rows=[h]
    ansfmt={'pattern_recognition':'0–4','verbal_reasoning':'A / B / C','numerical_speed':'A / B / C',
            'working_memory':L('izq. / der.','left / right'),'visual_rotation':'0–3'}
    for i,(k,es,en,n,secs,_) in enumerate(SUBTESTS,1):
        primary,secondary = (es,en) if LANG=='es' else (en,es)
        rows.append([Paragraph(str(i),CELLC),Paragraph(f'<b>{primary}</b>',CELL),Paragraph(secondary,CELL),
                     Paragraph('3',CELLC),Paragraph(str(n),CELLC),Paragraph(f'{secs//60} min',CELLC),
                     Paragraph(ansfmt[k],CELLM)])
    rows.append([Paragraph('',CELLC),Paragraph('<b>Total</b>',CELL),Paragraph('',CELL),
                 Paragraph('<b>15</b>',CELLC),Paragraph('<b>290</b>',CELLC),Paragraph('<b>20 min</b>',CELLC),
                 Paragraph('',CELL)])
    t=Table(rows,colWidths=[20,120,104,50,58,48,72],repeatRows=1,hAlign='LEFT')
    st=gstyle(); st.add('BACKGROUND',(0,-1),(-1,-1),COOLBG); t.setStyle(st); A_(t)
    A_(Spacer(1,8))
    A_(Paragraph(L('Las subpruebas se aplican en ese orden. Cada una va precedida de sus instrucciones y de tres ítems '
        'de práctica que no puntúan. El reloj corre por subprueba, no por sesión, y una subprueba no se puede '
        'retomar una vez vencido su tiempo.',
        'The subtests are administered in that order. Each is preceded by its instructions and by three practice '
        'items that do not count. The clock runs per subtest, not per session, and a subtest cannot be resumed '
        'once its time has run out.'), NOTE))
    A_(Spacer(1,14))

    # ---- 03 calificación
    for f in section('03',L('Cómo se califica','How it is scored'),
                     L('La regla exacta de cada subprueba','The exact rule for each subtest')): A_(f)
    rules=[(L('Reconocimiento de Patrones','Pattern Recognition'),
            L('Dos filas de cuatro letras. Se comparan las dos letras de cada columna '
            '<b>sin distinguir mayúsculas</b>. La respuesta es el <b>número de columnas iguales</b>, de 0 a 4.',
            'Two rows of four letters. The two letters in each column are compared <b>ignoring case</b>. '
            'The answer is the <b>number of matching columns</b>, from 0 to 4.')),
           (L('Razonamiento Verbal','Verbal Reasoning'),
            L('Dos premisas y una pregunta con tres opciones. La clave <b>viene guardada</b> con el '
            'ítem y se expresa como la letra de la opción, A, B o C, en el orden en que se presentan.',
            'Two premises and a question with three options. The key <b>is stored</b> with the item and is '
            'given as the option letter, A, B or C, in the order the options are presented.')),
           (L('Velocidad Numérica','Numerical Speed'),
            L('Tres números. Se toma la <b>mediana</b> y se busca cuál queda más lejos de ella en '
            'distancia absoluta. La respuesta es su <b>posición original</b>: A, B o C. <b>Los empates se resuelven '
            'hacia la posición más temprana</b>, en el orden A, B, C.',
            'Three numbers. The <b>median</b> is taken, and the number lying farthest from it in absolute '
            'distance is sought. The answer is that number\'s <b>original position</b>: A, B or C. <b>Ties resolve '
            'to the earliest position</b>, in the order A, B, C.')),
           (L('Memoria de Trabajo','Working Memory'),
            L('Tres letras. Se convierte cada una a su posición en el alfabeto (A=1 … Z=26) y se '
            'compara qué tan lejos queda cada letra exterior de la del centro. La respuesta es <b>izquierda</b> o '
            '<b>derecha</b>, la que quede más lejos. <b>El empate se resuelve hacia la izquierda.</b>',
            'Three letters. Each is converted to its position in the alphabet (A=1 … Z=26) and the distance of '
            'each outer letter from the middle one is compared. The answer is <b>left</b> or <b>right</b>, '
            'whichever lies farther. <b>A tie resolves to the left.</b>')),
           (L('Rotación Visual','Visual Rotation'),
            L('Dos filas de tres figuras, cada una una letra R normal o en espejo, girada. Dos figuras '
            'coinciden si comparten la <b>lateralidad</b>: ambas normales, o ambas en espejo. La respuesta es el '
            '<b>número de columnas iguales</b>, de 0 a 3.',
            'Two rows of three figures, each a letter R either normal or mirrored, and rotated. Two figures '
            'match if they share the same <b>handedness</b>: both normal, or both mirrored. The answer is the '
            '<b>number of matching columns</b>, from 0 to 3.'))]
    d=[[Paragraph(L('Subprueba','Subtest'),TH),Paragraph(L('Regla','Rule'),TH)]]
    for n_,r in rules: d.append([Paragraph(f'<b>{n_}</b>',CELL),Paragraph(r,CELL)])
    t=Table(d,colWidths=[128,CW-128],repeatRows=1,hAlign='LEFT'); t.setStyle(gstyle()); A_(t)
    A_(Spacer(1,10))
    A_(box(L('El giro es un distractor, no parte de la respuesta','Rotation is a distractor, not part of the answer'),
        L('Rotación Visual se califica <b>solo por lateralidad</b>. El ángulo de giro se lee y se descarta: '
        f'<font face="{MONO}" size="8">R_90</font> y <font face="{MONO}" size="8">R_270</font> cuentan como iguales, '
        'porque ambas son R normales. Los ángulos existen para dificultar el juicio, no para cambiar la respuesta. '
        'Es la regla que más se malinterpreta, y por eso el enunciado en pantalla dice «rotaciones permitidas, '
        'espejos no».',
        'Visual Rotation is scored <b>on handedness alone</b>. The angle of rotation is read and discarded: '
        f'<font face="{MONO}" size="8">R_90</font> and <font face="{MONO}" size="8">R_270</font> count as matching, '
        'because both are normal Rs. The angles exist to make the judgement harder, not to change the answer. '
        'This is the most misread rule in the instrument, which is why the on-screen instruction says '
        '\u201crotations allowed, mirrors not\u201d.'), NAVY, COOLBG))
    A_(PageBreak())

    # ---- 04 idiomas
    for f in section('04',L('Idiomas','Languages'),
                     L('Qué está traducido y qué solo lo parece',
                       'What is translated and what only looks like it')): A_(f)
    A_(Paragraph(L('Solo <b>Razonamiento Verbal</b> tiene contenido que dependa del idioma, y está completamente '
        'traducido: los 3 ítems de práctica y los 50 calificados existen en español y en inglés, con revisión '
        'humana. Las otras cuatro subpruebas son <b>neutras por construcción</b> — sus ítems son letras, números y '
        'figuras, así que el mismo ítem sirve para los dos idiomas.',
        'Only <b>Verbal Reasoning</b> has content that depends on language, and it is fully translated: the 3 '
        'practice items and the 50 scored ones exist in Spanish and English, human-reviewed. The other four '
        'subtests are <b>language-neutral by construction</b> — their items are letters, numbers and figures, so '
        'the same item serves both languages.'), BODY))
    d=[[Paragraph(L('Subprueba','Subtest'),TH),Paragraph(L('Contenido del ítem','Item content'),TH),
        Paragraph(L('Enunciado en pantalla','On-screen instruction'),TH)]]
    for k,es,en,*_ in SUBTESTS:
        nm = es if LANG=='es' else en
        if k=='verbal_reasoning':
            d.append([Paragraph(f'<b>{nm}</b>',CELL),
                      Paragraph('<font color="#1B6B44"><b>' + L('Traducido — español e inglés',
                                'Translated — Spanish and English') + '</b></font>',CELL),
                      Paragraph(L('No lleva enunciado aparte: la pregunta del ítem hace ese papel, y va traducida',
                                  'No separate instruction: the item\'s own question does that job, and it is translated'),CELL)])
        else:
            d.append([Paragraph(f'<b>{nm}</b>',CELL),
                      Paragraph(L('Neutro al idioma','Language-neutral'),CELL),
                      Paragraph('<font color="#1B6B44"><b>' + L('Español e inglés','Spanish and English') + '</b></font>',CELL)])
    t=Table(d,colWidths=[140,150,CW-290],repeatRows=1,hAlign='LEFT'); t.setStyle(gstyle()); A_(t)
    A_(Spacer(1,10))
    A_(box(L('Corregido el 24 de septiembre de 2026','Fixed on 24 September 2026'),
        L('Hasta esa fecha las cuatro subpruebas neutras llevaban su enunciado fijo en español, sin rama de '
        'traducción, igual que los avisos de cuenta regresiva: un estudiante que trabajaba en inglés veía el '
        'enunciado en español en cuatro de las cinco subpruebas. La causa no fue una decisión sino un cableado '
        'incompleto — los componentes que dibujan la pregunta nunca recibieron el idioma, aunque todo lo que está '
        'por encima sí lo recibía. <b>Ya está corregido</b>: los enunciados en inglés que aparecen en este '
        'documento son los que muestra el producto. Falta una <b>revisión por hablante nativo</b> de esas '
        'formulaciones antes de darlas por definitivas.',
        'Until that date the four language-neutral subtests carried their instruction hard-coded in Spanish, with '
        'no translation branch, as did the countdown warnings: a student working in English saw a Spanish '
        'instruction on four of the five subtests. The cause was not a decision but incomplete wiring — the '
        'components that draw the question never received the language, although everything above them did. '
        '<b>This is now fixed</b>: the English instructions printed in this document are the ones the product '
        'shows. A <b>native-speaker review</b> of those wordings is still outstanding before they can be '
        'considered final.'), GOOD, GOODBG))
    A_(Spacer(1,10))
    A_(Paragraph(L('El resto de la plataforma','The rest of the platform'), H2))
    A_(Paragraph(L('Medido el 24 de septiembre de 2026: la plataforma tiene <b>8 espacios de nombres en inglés y '
        'español, con 4.355 claves en cada idioma y paridad exacta</b> — no falta ninguna traducción en ninguna '
        'dirección. De 617 componentes, solo 7 tenían texto fijo en español, y los 7 eran los de LIA. Dicho de otro '
        'modo: LIA era el único hueco, y ya está cerrado. Queda una salvedad honesta: la paridad demuestra que la '
        'traducción <i>existe</i>, no que esté bien redactada.',
        'Measured on 24 September 2026: the platform has <b>8 namespaces in English and Spanish, with 4,355 keys '
        'in each language at exact parity</b> — no translation is missing in either direction. Of 617 components, '
        'only 7 carried hard-coded Spanish, and all 7 were LIA\'s. Put another way: LIA was the only hole, and it '
        'is now closed. One honest caveat remains: parity proves the translation <i>exists</i>, not that it is '
        'well written.'), BODY))
    A_(Spacer(1,10))
    A_(Paragraph(L('No existe portugués','There is no Portuguese'), H2))
    A_(Paragraph(L('La aplicación solo trae español e inglés. Un estudiante con el navegador en portugués queda '
        'resuelto a <b>inglés</b> sin ningún aviso. Añadir portugués no es solo traducir: como LIA informa '
        '<b>percentiles</b>, traducir los ítems cambia su dificultad, y habría que volver a baremar el instrumento '
        'con población de habla portuguesa antes de poder informar esos percentiles con honestidad.',
        'The application ships Spanish and English only. A student whose browser is set to Portuguese is resolved '
        'to <b>English</b> with no warning at all. Adding Portuguese is not just translation: because the LIA '
        'reports <b>percentiles</b>, translating the items changes their difficulty, and the instrument would have '
        'to be re-normed on a Portuguese-speaking population before those percentiles could be reported '
        'honestly.'), BODY))
    A_(PageBreak())

    # ---- 05..09
    for idx,(key,es,en,count,secs,instr) in enumerate(SUBTESTS):
        num=f'0{idx+5}'
        title   = es if LANG=='es' else en
        othernm = en if LANG=='es' else es
        A_sub = L(f'{othernm} · 3 de práctica + {count} calificados · {secs//60} minutos',
                  f'{othernm} · 3 practice + {count} scored · {secs//60} minutes')
        for f in section(num, title, A_sub): A_(f)
        if instr:
            A_(kv([(L('Enunciado · español','Instruction · Spanish'), instr[0]),
                   (L('Enunciado · English','Instruction · English'), instr[1])],152)); A_(Spacer(1,10))
        if key=='pattern_recognition':
            A_(Paragraph(L('La clave es el número de columnas cuyas dos letras coinciden sin distinguir mayúsculas '
                         '(0–4). La columna <b>Iguales</b> indica <i>cuáles</i> columnas coinciden.',
                         'The key is the number of columns whose two letters match, ignoring case (0–4). The '
                         '<b>Matches</b> column says <i>which</i> columns match.'), BODY))
            A_(_pr())
        elif key=='verbal_reasoning':
            A_(Paragraph(L('La clave es la letra de la opción — <b>A</b>, <b>B</b> o <b>C</b> — y junto a ella se '
                         'imprime <b>la respuesta correcta escrita</b>, para no tener que contarlas.',
                         'The key is the option letter — <b>A</b>, <b>B</b> or <b>C</b> — and beside it the '
                         '<b>correct answer written out</b>, so nobody has to count the options.'), BODY))
            A_(box(L('Un ítem cambia de clave según el idioma','One item has a different key in each language'),
                L('En el <b>ítem 2 de práctica</b> el orden de las opciones en inglés difiere del original en español, '
                'así que la clave es <b>B en español y C en inglés</b>. El motor aplica esa excepción solo. '
                'Ningún ítem calificado difiere: los 50 comparten clave en ambos idiomas.',
                'In <b>practice item 2</b> the order of the English options differs from the Spanish original, so '
                'the key is <b>B in Spanish and C in English</b>. The engine applies that one exception and no '
                'other. No scored item differs: all 50 share a key across both languages.'), NAVY, COOLBG))
            A_(Spacer(1,9))
            for b in _vb(): A_(b)
        elif key=='numerical_speed':
            A_(Paragraph(L('La clave es la <b>posición</b> del número más lejano a la mediana — <b>A</b> el primero, '
                         '<b>B</b> el segundo, <b>C</b> el tercero — y al lado va <b>ese número</b>.',
                         'The key is the <b>position</b> of the number farthest from the median — <b>A</b> the '
                         'first, <b>B</b> the second, <b>C</b> the third — with <b>that number</b> beside it.'), BODY))
            A_(_ns())
        elif key=='working_memory':
            A_(Paragraph(L('La clave es <b>izq.</b> o <b>der.</b>, según qué letra exterior queda más lejos en el '
                         'alfabeto de la del centro, y al lado va <b>esa letra</b>.',
                         'The key is <b>left</b> or <b>right</b>, according to which outer letter lies farther '
                         'in the alphabet from the middle one, with <b>that letter</b> beside it.'), BODY))
            A_(_wm())
        else:
            A_(Paragraph(L('Las figuras se imprimen <b>tal como las ve el estudiante</b>. Debajo de cada ítem se repiten '
                f'en notación: <font face="{MONO}" size="8">R</font> es una R normal y '
                f'<font face="{MONO}" size="8">M</font> una R en espejo, seguidas del giro en grados. La línea '
                '<b>Iguales</b> dice qué columnas coinciden, que es de donde sale la clave. Recuerde que '
                '<b>solo cuenta la lateralidad</b>.',
                'The figures are printed <b>exactly as the student sees them</b>. Under each item they are '
                f'repeated in notation: <font face="{MONO}" size="8">R</font> is a normal R and '
                f'<font face="{MONO}" size="8">M</font> a mirrored R, each followed by its rotation in degrees. '
                'The <b>Matches</b> line says which columns match, which is where the key comes from. Remember '
                'that <b>only handedness counts</b>.'), BODY))
            A_(Spacer(1,7))
            for b in _vrot(): A_(b)
        A_(PageBreak())

    # ---- 10 distribución
    for f in section('10',L('Distribución de la clave','Answer key distribution'),
                     L('Balance del banco','How balanced the bank is')): A_(f)
    for key,es,en,*_ in SUBTESTS:
        rows=items_of(key,False); cnt={}
        for r in rows: cnt[r['ans']]=cnt.get(r['ans'],0)+1
        order=sorted(cnt,key=lambda k:(len(k),k))
        lab={'left':L('izq.','left'),'right':L('der.','right')}
        nm = es if LANG=='es' else en
        A_(Paragraph(f'<b>{nm}</b> — {len(rows)} ' + L('ítems calificados','scored items'),
                     S('dh',fontName='Georgia-Bold',fontSize=9.8,leading=13,spaceAfter=4)))
        d=[[Paragraph(f'<b>{lab.get(k,k)}</b>',CELLC) for k in order],
           [Paragraph(f'{cnt[k]} · {cnt[k]*100//len(rows)}%',CELLC) for k in order]]
        t=Table(d,colWidths=[min(72,CW/len(order))]*len(order),hAlign='LEFT')
        t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),0.4,LINE),('BACKGROUND',(0,0),(-1,0),ZEB),
            ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
        A_(t); A_(Spacer(1,11))
    A_(Paragraph(L('Memoria de Trabajo se inclina levemente hacia <b>der.</b> (35 de 63) y Velocidad Numérica hacia '
        '<b>A</b> (26 de 63). Ninguna es extrema, pero conviene saberlo si alguna vez se amplía o se vuelve a '
        'muestrear el banco: un estudiante que respondiera siempre lo mismo no quedaría en el azar.',
        'Working Memory leans slightly towards <b>right</b> (35 of 63) and Numerical Speed towards <b>A</b> '
        '(26 of 63). Neither is extreme, but it is worth knowing if the bank is ever extended or resampled: a '
        'student who always gave the same answer would not land at chance.'), NOTE))
    A_(PageBreak())

    # ---- 11 advertencias
    for f in section('11',L('Advertencias','Cautions'),
                     L('Lo que conviene saber antes de aplicarlo','What to know before administering it')): A_(f)
    for t_,fg,bg,b in [
        (L('Resuelto — los enunciados y los avisos ya son bilingües',
           'Resolved — the instructions and warnings are bilingual now'), GOOD, GOODBG,
         L('Hasta el 24 de septiembre de 2026, cuatro subpruebas daban la instrucción solo en español y los avisos de '
         '30 y 10 segundos salían en español para todos. Ya no. Pendiente: <b>revisión por hablante nativo</b> de '
         'las formulaciones en inglés.',
         'Until 24 September 2026, four subtests gave their instruction in Spanish only, and the 30- and '
         '10-second warnings appeared in Spanish for everyone. No longer. Outstanding: a <b>native-speaker '
         'review</b> of the English wordings.')),
        (L('El portugués se resuelve a inglés en silencio','Portuguese silently resolves to English'), WARN, WARNBG,
         L('No hay versión en portugués. El navegador en portugués queda resuelto a inglés sin aviso al estudiante '
         'ni a quien aplica la prueba.',
         'There is no Portuguese version. A browser set to Portuguese resolves to English with no warning to the '
         'student or to whoever is administering the test.')),
        (L('Editar un ítem mueve su respuesta','Editing an item moves its answer'), WARN, WARNBG,
         L('Cuatro de las cinco subpruebas calculan la clave desde los datos del ítem. Regenere este documento '
         'después de cualquier cambio en el banco.',
         'Four of the five subtests compute the key from the item\'s data. Regenerate this document after any '
         'change to the bank.')),
        (L('Lo que decide una coincidencia es la lateralidad, no el giro',
           'What decides a match is handedness, not rotation'), NAVY, COOLBG,
         L('Conviene repetirlo a quien revise Rotación Visual a ojo: dos R normales en ángulos distintos SÍ '
         'coinciden. Es el error más frecuente al revisar.',
         'Worth repeating to anyone checking Visual Rotation by eye: two normal Rs at different angles DO '
         'match. It is the most common mistake made when reviewing.'))]:
        A_(box(t_,b,fg,bg)); A_(Spacer(1,8))
    return s

# ---------------- item tables
def _lab(r): return ('P'+str(r['n'])) if r['practice'] else str(r['n'])

def _pr():
    rows=[]
    for r in items_of('pattern_recognition',True)+items_of('pattern_recognition',False):
        q=r['q']
        rows.append([Paragraph(_lab(r),CELLC),Paragraph(' '.join(q['row1']),CELLM),
                     Paragraph(' '.join(q['row2']),CELLM),Paragraph(f"<b>{r['ans']}</b>",CELLK),
                     Paragraph(pr_cols(q),S('pc',fontSize=7.2,leading=9.6,alignment=TA_CENTER,textColor=INK2))])
    h=[Paragraph(L('Ítem','Item'),THC),Paragraph(L('Fila 1','Row 1'),THC),Paragraph(L('Fila 2','Row 2'),THC),
       Paragraph(L('Clave','Key'),THC),Paragraph(L('Iguales','Matches'),THC)]
    return nup(rows,h,[32,48,48,32,52],2)

def _ns():
    rows=[]
    for r in items_of('numerical_speed',True)+items_of('numerical_speed',False):
        q=r['q']
        rows.append([Paragraph(_lab(r),CELLC),Paragraph('  '.join(str(n) for n in q['numbers']),CELLM),
                     Paragraph(f"<b>{r['ans']}</b>",CELLK),
                     Paragraph(f"<b>{ns_val(q,r['ans'])}</b>",S('nv',fontName='Georgia-Bold',fontSize=8.4,
                               leading=11,alignment=TA_CENTER,textColor=RED))])
    h=[Paragraph(L('Ítem','Item'),THC),Paragraph('A  B  C',THC),Paragraph(L('Clave','Key'),THC),
       Paragraph(L('Es','Is'),THC)]
    return nup(rows,h,[32,56,34,28],3)

def _wm():
    rows=[]
    lab={'left':L('izq.','left'),'right':L('der.','right')}
    for r in items_of('working_memory',True)+items_of('working_memory',False):
        q=r['q']
        rows.append([Paragraph(_lab(r),CELLC),Paragraph('  '.join(q['letters']),CELLM),
                     Paragraph(f"<b>{lab[r['ans']]}</b>",CELLK),
                     Paragraph(f"<b>{wm_val(q,r['ans'])}</b>",S('wv',fontName='Georgia-Bold',fontSize=8.4,
                               leading=11,alignment=TA_CENTER,textColor=RED))])
    h=[Paragraph(L('Ítem','Item'),THC),Paragraph(L('Letras','Letters'),THC),Paragraph(L('Clave','Key'),THC),
       Paragraph(L('Es','Is'),THC)]
    return nup(rows,h,[32,50,34,28],3)

def _vcell(q):
    if not q: return Paragraph('<i>—</i>',CELL)
    prem='<br/>'.join(q['premises'])
    opts=' · '.join(f'<b>{chr(65+i)}</b> {o}' for i,o in enumerate(q['options']))
    return Paragraph(f'{prem}<br/><i>{q["question"]}</i><br/>{opts}',CELL)

def _vb():
    out=[]
    for practice in (True,False):
        rows=items_of('verbal_reasoning',practice)
        out.append(Paragraph(L('Ítems de práctica (no se puntúan)','Practice items (not scored)') if practice
                             else L('Ítems calificados','Scored items'),
                             S('vt',fontName='Georgia-Bold',fontSize=10,leading=13,textColor=NAVY,spaceAfter=5)))
        d=[[Paragraph(L('Ítem','Item'),THC),Paragraph('Español',TH),Paragraph('English',TH),
            Paragraph('ES',THC),Paragraph(L('Respuesta','Answer'),THC),Paragraph('EN',THC),
            Paragraph(L('Answer','Answer'),THC)]]
        for r in rows:
            esk=r['ans']; enk=r.get('ansEn',r['ans']); diff=esk!=enk
            enfmt=(f'<font color="#C0121A"><b>{enk}</b></font>' if diff else f'<b>{enk}</b>')
            d.append([Paragraph(_lab(r),CELLC),_vcell(r['q']),_vcell(r.get('qEn')),
                      Paragraph(f'<b>{esk}</b>',CELLK),
                      Paragraph(vb_val(r['q'],esk),S('va',fontSize=7.8,leading=10,alignment=TA_CENTER,textColor=RED)),
                      Paragraph(enfmt,CELLK),
                      Paragraph(vb_val(r.get('qEn') or {},enk),S('va2',fontSize=7.8,leading=10,
                                alignment=TA_CENTER,textColor=RED))])
        wide=(CW-32-28-50-28-50)/2
        t=Table(d,colWidths=[32,wide,wide,28,50,28,50],repeatRows=1,hAlign='LEFT')
        t.setStyle(gstyle()); out.append(t); out.append(Spacer(1,13))
    return out

def _vrot():
    out=[]
    for practice in (True,False):
        rows=items_of('visual_rotation',practice)
        out.append(Paragraph(L('Ítems de práctica (no se puntúan)','Practice items (not scored)') if practice
                             else L('Ítems calificados','Scored items'),
                             S('vt2',fontName='Georgia-Bold',fontSize=10,leading=13,textColor=NAVY,spaceAfter=6)))
        for i in range(0,len(rows),4):
            out.append(VRRow(rows[i:i+4],4)); out.append(Spacer(1,10))
        out.append(Spacer(1,6))
    return out

# ---------------- build
def build(path):
    for p2 in (False,True):
        doc=BaseDocTemplate(path,pagesize=letter,leftMargin=LM,rightMargin=RM,topMargin=TM,bottomMargin=BM,
            title=L('LIA (MIL) — Banco completo de ítems y clave de respuestas',
                    'LIA (MIL) — Complete item bank and answer key'),
            author=L('NexaDev LLC para TIMS International','NexaDev LLC for TIMS International'),
            subject=L('Documentación de instrumento — confidencial',
                      'Instrument documentation — confidential'))
        doc.addPageTemplates([
            PageTemplate(id='cover',frames=[Frame(LM,BM,CW,PH-TM-BM,id='c')],onPage=cover_page),
            PageTemplate(id='body', frames=[Frame(LM,BM,CW,PH-TM-BM,id='b')],onPage=body_page)])
        from reportlab.platypus import NextPageTemplate
        st=story(p2); st.insert(0,NextPageTemplate('body'))
        doc.build(st)
    return path

OUT = {'es':'TIMS-LIA-Banco-de-Items-ES.pdf', 'en':'TIMS-LIA-Item-Bank-EN.pdf'}

def main(argv):
    global LANG
    langs = ['es','en']
    if '--lang' in argv:
        v = argv[argv.index('--lang')+1]
        if v not in ('es','en','both'):
            sys.exit("--lang must be es, en or both")
        langs = ['es','en'] if v=='both' else [v]
    outdir = HERE
    if '--out' in argv:
        outdir = os.path.abspath(argv[argv.index('--out')+1])
        os.makedirs(outdir, exist_ok=True)
    for lg in langs:
        LANG = lg
        SECTION_PAGES.clear()          # page numbers are per-edition
        p = build(os.path.join(outdir, OUT[lg]))
        print(f'built [{lg}] {p} {os.path.getsize(p)} bytes')

if __name__=='__main__':
    main(sys.argv[1:])
