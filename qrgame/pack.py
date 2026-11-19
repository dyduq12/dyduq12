import zlib, base64, sys
src = open(sys.argv[1] if len(sys.argv)>1 else "game.js","rb").read()
c = zlib.compressobj(9, zlib.DEFLATED, -15)
raw = c.compress(src)+c.flush()
b64 = base64.urlsafe_b64encode(raw).decode().rstrip("=")
base = sys.argv[2] if len(sys.argv)>2 else "https://dyduq12.github.io/dyduq12/qrgame/loader.html"
url = base + "#" + b64
print("fonte:", len(src), "bytes | comprimido:", len(raw), "bytes | URL:", len(url), "chars")
open("url.txt","w").write(url)
try:
    import qrcode
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_L, border=2)
    q.add_data(url); q.make(fit=True)
    q.make_image().save("qr.png"); print("QR versao", q.version)
except Exception as e:
    print("QR nao gerado:", e, "(pip install qrcode[pil])")
