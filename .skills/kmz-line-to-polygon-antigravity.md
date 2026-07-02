# Skill: kmz-line-to-polygon — Correção de mapas de fazenda (KMZ/KML)

> Instruções autocontidas para uso em agente de IA (Antigravity, Claude Code, etc.).
> Contém: quando acionar, fluxo de trabalho, regras de conversão e o script completo.

## Quando acionar

Use sempre que o usuário pedir para corrigir, processar, converter ou validar um arquivo `.kmz`/`.kml` de fazenda; mencionar "área salva como linha", "pasto/piquete/talhão aparece como linha", "KMZ do Google Earth"; ou anexar um KMZ cujas áreas não importam corretamente em software de gestão.

## O que a skill faz

Corrige o erro mais comum em mapas de fazenda desenhados no Google Earth: áreas (pastos, piquetes, talhões) desenhadas como **LineString** em vez de **Polygon**. O script lê o KMZ/KML, identifica linhas que formam contorno fechado e as converte em polígonos, preservando nomes, descrições, estilos, pastas e demais arquivos internos do KMZ (ícones, imagens). O original nunca é sobrescrito.

## Como executar

Salve o script abaixo como `fix_kmz.py` (requer apenas Python 3, sem dependências externas) e rode:

```bash
python3 fix_kmz.py "caminho/arquivo.kmz"
```

Gera `arquivo_corrigido.kmz` ao lado do original e imprime o relatório.

| Flag | Padrão | Quando usar |
|------|--------|-------------|
| `-o saida.kmz` | `<entrada>_corrigido.<ext>` | Nome/local da saída |
| `-t METROS` | 10 | Tolerância de fechamento (distância máx. entre primeiro e último ponto). Aumente (20-30) se áreas óbvias não converterem; diminua (2-5) se linhas abertas converterem indevidamente |
| `--min-area M2` | 50 | Área mínima para valer como polígono |
| `--ignore-names` | off | Por padrão, linhas fechadas com nome de feição linear (estrada, cerca, rio, rede, energia...) NÃO são convertidas — só com esta flag, após confirmação do usuário |
| `--report-json caminho.json` | — | Relatório em JSON |

## Regras de conversão

Uma LineString vira Polygon somente quando TODAS valem:
1. Primeiro e último ponto idênticos ou dentro da tolerância (`-t`).
2. Pelo menos 3 vértices distintos e área acima de `--min-area`.
3. O nome não sugere feição linear (a menos de `--ignore-names`).

Tudo o mais permanece intacto: polígonos existentes, pontos, linhas abertas, estilos, StyleMaps, descrições, pastas e arquivos internos do KMZ. O anel é fechado ajustando o último ponto ao primeiro quando necessário.

## Fluxo de trabalho

1. Rode o script no arquivo do usuário (nunca sobrescreva o original).
2. Apresente o relatório resumido: features analisadas, convertidas (nomes + área em ha), mantidas abertas, ignoradas e por quê.
3. **Ignoradas por nome**: liste e pergunte ao usuário se alguma deve ser convertida (`--ignore-names`).
4. Valide a saída (snippet abaixo) e entregue o arquivo corrigido.

## Validação antes de entregar

```python
import zipfile, xml.etree.ElementTree as ET
path = "SAIDA.kmz"
data = zipfile.ZipFile(path).read([n for n in zipfile.ZipFile(path).namelist() if n.endswith('.kml')][0]) if zipfile.is_zipfile(path) else open(path,'rb').read()
root = ET.fromstring(data)  # erro se XML inválido
for ring in root.iter('{http://www.opengis.net/kml/2.2}LinearRing'):
    c = ring.find('{http://www.opengis.net/kml/2.2}coordinates').text.split()
    assert c[0] == c[-1] and len(c) >= 4, 'anel inválido'
print('OK: XML válido, anéis fechados')
```

## Casos especiais

- **KMZ com vários KML internos**: usa `doc.kml` ou o primeiro `.kml`; demais arquivos preservados.
- **MultiGeometry**: LineStrings internas avaliadas individualmente; demais geometrias intactas.
- **CDATA em descrições**: conteúdo preservado, pode sair escapado (`&lt;b&gt;`) — equivalente e válido no Google Earth/QGIS.
- **Usuário contesta conversão**: explique com os números do relatório (`gap_m`, `distancia_extremos_m`) e ajuste `-t`.

## Script completo (`fix_kmz.py`)

```python
#!/usr/bin/env python3
"""
fix_kmz.py - Converte linhas fechadas (LineString) em poligonos (Polygon) em arquivos KMZ/KML de mapas de fazenda.

Uso:
    python fix_kmz.py ENTRADA.kmz [opcoes]

Opcoes:
    -o, --output PATH        Arquivo de saida (padrao: <entrada>_corrigido.<ext>)
    -t, --tolerance METROS   Tolerancia de fechamento entre primeiro e ultimo ponto (padrao: 10.0)
    --min-area M2            Area minima para considerar poligono valido (padrao: 50.0)
    --ignore-names           Converte mesmo quando o nome sugere feicao linear (estrada, cerca, etc.)
    --report-json PATH       Salva o relatorio tambem em JSON
    --quiet                  Suprime o relatorio no stdout

Comportamento:
    - Le KMZ (zip) ou KML puro; localiza o doc.kml interno.
    - Nunca sobrescreve o arquivo original.
    - Preserva estilos, nomes, descricoes, pastas e demais arquivos internos do KMZ (icones, imagens).
    - Poligonos existentes, pontos e linhas abertas permanecem intactos.
"""
import argparse
import io
import json
import math
import os
import zipfile
import xml.etree.ElementTree as ET

KML_NS = "http://www.opengis.net/kml/2.2"

LINEAR_NAME_KEYWORDS = [
    "estrada", "rodovia", "rua", "caminho", "trilha", "rota", "percurso",
    "cerca", "aramado",
    "rede", "linha de energia", "energia", "eletrica", "elétrica",
    "adutora", "encanamento", "cano", "tubulacao", "tubulação", "aqueduto",
    "corrego", "córrego", "rio ", "riacho", "vala", "canal", "sanga",
    "road", "fence", "trail", "route", "pipeline", "powerline", "creek", "stream",
]


def register_namespaces(kml_bytes):
    for event, (prefix, uri) in ET.iterparse(io.BytesIO(kml_bytes), events=["start-ns"]):
        if uri == KML_NS:
            continue  # sempre serializado como namespace padrao (sem prefixo)
        try:
            ET.register_namespace(prefix, uri)
        except ValueError:
            pass
    ET.register_namespace("", KML_NS)


def parse_coordinates(text):
    coords = []
    for token in (text or "").split():
        parts = token.split(",")
        if len(parts) >= 2:
            lon, lat = float(parts[0]), float(parts[1])
            alt = float(parts[2]) if len(parts) >= 3 and parts[2] != "" else 0.0
            coords.append((lon, lat, alt))
    return coords


def haversine_m(p1, p2):
    R = 6371000.0
    lon1, lat1, lon2, lat2 = map(math.radians, (p1[0], p1[1], p2[0], p2[1]))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def ring_area_m2(coords):
    if len(coords) < 3:
        return 0.0
    R = 6371000.0
    lat0 = math.radians(sum(c[1] for c in coords) / len(coords))
    pts = [(math.radians(c[0]) * R * math.cos(lat0), math.radians(c[1]) * R) for c in coords]
    area = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def distinct_points(coords, eps_m=0.5):
    if not coords:
        return 0
    out = [coords[0]]
    for c in coords[1:]:
        if haversine_m(out[-1], c) > eps_m:
            out.append(c)
    if len(out) > 1 and haversine_m(out[0], out[-1]) <= eps_m:
        out = out[:-1]
    return len(out)


def name_suggests_linear(name):
    n = (name or "").lower()
    return any(kw in n for kw in LINEAR_NAME_KEYWORDS)


def qn(tag):
    return "{%s}%s" % (KML_NS, tag)


def build_polygon(linestring_el, coords):
    poly = ET.Element(qn("Polygon"))
    for tag in ("extrude", "tessellate", "altitudeMode"):
        child = linestring_el.find(qn(tag))
        if child is not None:
            new = ET.SubElement(poly, qn(tag))
            new.text = child.text
    outer = ET.SubElement(poly, qn("outerBoundaryIs"))
    ring = ET.SubElement(outer, qn("LinearRing"))
    ring_coords = list(coords)
    if ring_coords[0][:2] != ring_coords[-1][:2]:
        # extremos proximos, mas nao identicos: ajusta o ultimo ponto ao primeiro
        ring_coords[-1] = ring_coords[0]
    coord_el = ET.SubElement(ring, qn("coordinates"))
    coord_el.text = " ".join("%.10g,%.10g,%.10g" % (c[0], c[1], c[2]) for c in ring_coords)
    return poly


def process_kml(kml_bytes, tolerance_m, min_area_m2, ignore_names):
    register_namespaces(kml_bytes)
    root = ET.fromstring(kml_bytes)
    parent_map = {child: parent for parent in root.iter() for child in parent}

    report = {
        "features_analisadas": 0,
        "linhas_convertidas": [],
        "linhas_mantidas_abertas": [],
        "linhas_ignoradas": [],
        "poligonos_existentes": 0,
        "pontos": 0,
        "outros": 0,
    }

    for placemark in root.iter(qn("Placemark")):
        report["features_analisadas"] += 1
        name_el = placemark.find(qn("name"))
        name = (name_el.text.strip() if name_el is not None and name_el.text else "(sem nome)")

        geoms = []
        for container in [placemark] + placemark.findall(qn("MultiGeometry")):
            for ls in container.findall(qn("LineString")):
                geoms.append((container, ls))

        if not geoms:
            has_poly = placemark.find(qn("Polygon")) is not None
            mg = placemark.find(qn("MultiGeometry"))
            if not has_poly and mg is not None:
                has_poly = mg.find(qn("Polygon")) is not None
            if has_poly:
                report["poligonos_existentes"] += 1
            elif placemark.find(qn("Point")) is not None:
                report["pontos"] += 1
            else:
                report["outros"] += 1
            continue

        for container, ls in geoms:
            coords_el = ls.find(qn("coordinates"))
            coords = parse_coordinates(coords_el.text if coords_el is not None else "")

            if len(coords) < 3:
                report["linhas_ignoradas"].append(
                    {"nome": name, "motivo": "menos de 3 pontos (%d)" % len(coords)})
                continue

            gap_m = haversine_m(coords[0], coords[-1])
            if gap_m > tolerance_m:
                report["linhas_mantidas_abertas"].append(
                    {"nome": name, "distancia_extremos_m": round(gap_m, 1)})
                continue

            n_distinct = distinct_points(coords)
            area = ring_area_m2(coords)

            if n_distinct < 3 or area < min_area_m2:
                report["linhas_ignoradas"].append(
                    {"nome": name,
                     "motivo": "geometria degenerada (%d vertices distintos, area ~%.0f m2)" % (n_distinct, area)})
                continue

            if not ignore_names and name_suggests_linear(name):
                report["linhas_ignoradas"].append(
                    {"nome": name,
                     "motivo": "fechada, mas o nome sugere feicao linear (use --ignore-names para converter)"})
                continue

            poly = build_polygon(ls, coords)
            parent = parent_map.get(ls, container)
            idx = list(parent).index(ls)
            parent.remove(ls)
            parent.insert(idx, poly)
            report["linhas_convertidas"].append(
                {"nome": name, "area_ha": round(area / 10000.0, 2), "gap_m": round(gap_m, 2)})

    buf = io.BytesIO()
    ET.ElementTree(root).write(buf, encoding="UTF-8", xml_declaration=True)
    return buf.getvalue(), report


def load_input(path):
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as zf:
            kml_names = [n for n in zf.namelist() if n.lower().endswith(".kml")]
            if not kml_names:
                raise SystemExit("Erro: nenhum .kml encontrado dentro do KMZ.")
            kml_name = next((n for n in kml_names if n.lower() == "doc.kml"), kml_names[0])
            kml_bytes = zf.read(kml_name)
            extras = {n: zf.read(n) for n in zf.namelist() if n != kml_name and not n.endswith("/")}
            return kml_bytes, extras, kml_name
    with open(path, "rb") as f:
        return f.read(), {}, "doc.kml"


def write_output(path, kml_bytes, extras, kml_name):
    if path.lower().endswith(".kml"):
        with open(path, "wb") as f:
            f.write(kml_bytes)
    else:
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(kml_name, kml_bytes)
            for name, data in extras.items():
                zf.writestr(name, data)


def print_report(report, output_path):
    conv = report["linhas_convertidas"]
    abertas = report["linhas_mantidas_abertas"]
    ignoradas = report["linhas_ignoradas"]
    print("=" * 60)
    print("RELATORIO DE PROCESSAMENTO")
    print("=" * 60)
    print("Features analisadas:            %d" % report["features_analisadas"])
    print("Linhas convertidas em poligono: %d" % len(conv))
    print("Linhas mantidas como linha:     %d (abertas)" % len(abertas))
    print("Linhas ignoradas (incerteza):   %d" % len(ignoradas))
    print("Poligonos ja existentes:        %d (inalterados)" % report["poligonos_existentes"])
    print("Pontos:                         %d (inalterados)" % report["pontos"])
    if conv:
        print("\nConvertidas:")
        for c in conv:
            print("  - %s (~%s ha, gap %s m)" % (c["nome"], c["area_ha"], c["gap_m"]))
    if ignoradas:
        print("\nIgnoradas por incerteza ou geometria invalida:")
        grupos = {}
        for i in ignoradas:
            key = i["motivo"].split("(")[0].strip()
            grupos.setdefault(key, []).append(i["nome"])
        for motivo, nomes in grupos.items():
            print("  - %s: %d feature(s)" % (motivo, len(nomes)))
            mostra = ", ".join(nomes[:8])
            sufixo = "..." if len(nomes) > 8 else ""
            print("      %s%s" % (mostra, sufixo))
    print("\nArquivo gerado: %s" % output_path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("-o", "--output")
    ap.add_argument("-t", "--tolerance", type=float, default=10.0, help="metros (padrao 10)")
    ap.add_argument("--min-area", type=float, default=50.0, help="m2 (padrao 50)")
    ap.add_argument("--ignore-names", action="store_true")
    ap.add_argument("--report-json")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    if not os.path.isfile(args.input):
        raise SystemExit("Erro: arquivo nao encontrado: %s" % args.input)

    base, ext = os.path.splitext(args.input)
    output = args.output or "%s_corrigido%s" % (base, ext if ext.lower() in (".kml", ".kmz") else ".kmz")
    if os.path.abspath(output) == os.path.abspath(args.input):
        raise SystemExit("Erro: a saida nao pode sobrescrever o arquivo original.")

    kml_bytes, extras, kml_name = load_input(args.input)
    new_kml, report = process_kml(kml_bytes, args.tolerance, args.min_area, args.ignore_names)
    write_output(output, new_kml, extras, kml_name)
    report["arquivo_gerado"] = output

    if args.report_json:
        with open(args.report_json, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
    if not args.quiet:
        print_report(report, output)


if __name__ == "__main__":
    main()

```
