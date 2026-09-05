"""Minimal namespace-aware xlsx reader. Handles x: prefixes, sharedStrings, inline strings,
absolute /xl/... rel targets and Type-before-Id attribute order (this file has all four)."""
import zipfile, re, sys
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "p": "http://schemas.openxmlformats.org/package/2006/relationships"}

def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters: n = n*26 + (ord(ch)-64)
    return n-1

def load(path):
    z = zipfile.ZipFile(path)
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid2target = {}
    for rel in rels.findall("p:Relationship", NS):
        t = rel.get("Target")
        if t.startswith("/"): t = t[1:]
        elif not t.startswith("xl/"): t = "xl/" + t
        rid2target[rel.get("Id")] = t
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        sst = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in sst.findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
    sheets = {}
    for sh in wb.find("m:sheets", NS).findall("m:sheet", NS):
        name = sh.get("name"); rid = sh.get(f"{{{NS['r']}}}id")
        root = ET.fromstring(z.read(rid2target[rid]))
        rows = []
        for row in root.iter(f"{{{NS['m']}}}row"):
            cells = {}
            for c in row.findall("m:c", NS):
                ref = c.get("r"); typ = c.get("t"); v = c.find("m:v", NS)
                if typ == "s": val = shared[int(v.text)]
                elif typ == "inlineStr":
                    val = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
                elif typ == "str": val = v.text if v is not None else ""
                elif v is not None:
                    val = v.text
                    try:
                        fv = float(val); val = int(fv) if fv.is_integer() else fv
                    except ValueError: pass
                else: val = ""
                cells[col_index(ref)] = val
            if cells:
                width = max(cells)+1
                rows.append([cells.get(i, "") for i in range(width)])
        sheets[name] = rows
    return sheets

if __name__ == "__main__":
    sheets = load(sys.argv[1])
    if len(sys.argv) == 2:
        for n, r in sheets.items(): print(f"{n}: {len(r)} rows")
    else:
        for row in sheets[sys.argv[2]]:
            print(" | ".join(str(c) for c in row))
