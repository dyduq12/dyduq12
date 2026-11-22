#!/usr/bin/env python3
# Fase 3 - Pipeline v2 do QR Game.
# Uso: python pack.py [arquivo.js] [url-base]
# Pipeline: minifica (Terser se disponivel, senao Python leve) -> IIFE -> checa UTF-8 ->
# deflate-raw (Zopfli se disponivel, senao zlib 9) -> Base64URL sem '=' -> URL -> QR 1:1.
# Nao aborta se a URL passar de 2.650 chars; so avisa no relatorio de orcamento.
import os, re, subprocess, sys, zlib, base64
try:
    from zopfli.zlib import compress as zopfli_compress
except ImportError:
    zopfli_compress = None
BASE = "https://dyduq12.github.io/dyduq12/qrgame/loader.html"
LIMIT = 2650
G_PROPS = {"c","x","w","h","p","pal","loop","txt","spr","note","save","load"}
def read(p):
    with open(p, "rb") as f:
        return f.read()
def strip_js(src):
    out = []
    i = 0
    n = len(src)
    in_s = None
    in_re = False
    while i < n:
        c = src[i]
        if in_s:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(src[i+1]); i += 2; continue
            if c == in_s:
                in_s = None
            i += 1; continue
        if c in "\"'`":
            in_s = c; out.append(c); i += 1; continue
        if c == "/" and i + 1 < n and src[i+1] == "/":
            while i < n and src[i] != "\n": i += 1
            continue
        if c == "/" and i + 1 < n and src[i+1] == "*":
            i += 2
            while i + 1 < n and not (src[i] == "*" and src[i+1] == "/"): i += 1
            i += 2; continue
        if c == "/" and i + 1 < n and src[i+1] != "/" and src[i+1] != "*":
            in_re = True
        if in_re and c == "\n":
            in_re = False
        out.append(c); i += 1
    s = "".join(out)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*", "\n", s)
    s = re.sub(r"\n+", "\n", s)
    s = re.sub(r" ?([=+\-*/%<>!&|^,;:?(){}\[\]]) ?", r"\1", s)
    s = re.sub(r";}", "}", s)
    return s.strip()
def terser(src):
    try:
        p = subprocess.run(["npx", "--yes", "terser", "--compress", "--mangle", "--format", "json"], input=src, capture_output=True, text=True, timeout=30)
        if p.returncode == 0 and p.stdout.strip():
            return p.stdout.strip()
    except Exception:
        pass
    try:
        p = subprocess.run(["terser", "--compress", "--mangle", "--format", "json"], input=src, capture_output=True, text=True, timeout=30)
        if p.returncode == 0 and p.stdout.strip():
            return p.stdout.strip()
    except Exception:
        pass
    return None
def wrap_iife(code):
    return "(()=>{" + code + "})()"
def main():
    src_path = sys.argv[1] if len(sys.argv) > 1 else "game.js"
    base = sys.argv[2] if len(sys.argv) > 2 else BASE
    src = read(src_path).decode("utf-8")
    m = terser(src)
    if m:
        print("Terser: ok")
    else:
        print("AVISO: Terser/Node nao disponivel; usando minificacao leve em Python.")
        m = strip_js(src)
    code = wrap_iife(m)
    non_ascii = sorted(set(ch for ch in code if ord(ch) > 127))
    if non_ascii:
        print("AVISO UTF-8: caracteres multibyte encontrados:", " ".join(non_ascii))
    raw = zopfli_compress(code.encode("utf-8")) if zopfli_compress else None
    if raw is None:
        c = zlib.compressobj(9, zlib.DEFLATED, -15)
        raw = c.compress(code.encode("utf-8")) + c.flush()
    payload = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    url = base + "#" + payload
    over = len(url) - LIMIT
    print(f"fonte: {len(src.encode('utf-8'))} bytes | minificado: {len(code.encode('utf-8'))} bytes | comprimido: {len(raw)} bytes | URL: {len(url)} chars")
    if over <= 0:
        print(f"ORCAMENTO: dentro da meta ({LIMIT} chars, folga {-over} chars) — QR v38-L.")
    else:
        print(f"AVISO: ultrapassou {LIMIT} chars — otimo para testar via link direto, mas precisa reduzir {over} bytes para caber em QR Code v38-L.")
    with open("url.txt", "w", encoding="utf-8") as f:
        f.write(url)
    try:
        import qrcode
        q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_L, border=4)
        q.add_data(url); q.make(fit=True)
        img = q.make_image(fill_color="#000000", back_color="#FFFFFF")
        img.save("qr.png")
        with open("qr.svg", "w", encoding="utf-8") as f:
            f.write(q.make_image(image_factory=qrcode.image.svg.SvgPathImage).save("qr.svg") or "")
        print("QR versao", q.version, "| 1:1 | border 4")
    except Exception as e:
        print("QR nao gerado:", e, "(pip install qrcode[pil])")
if __name__ == "__main__":
    main()
