# qrgame

Jogo dentro de um QR code. O jogo vai comprimido (deflate-raw + base64url) no hash da URL; o `loader.html` decodifica e executa.

## Uso

1. Ative o GitHub Pages (Settings > Pages > Deploy from branch > main > / (root)).
2. `pip install qrcode[pil]`
3. `cd qrgame && python pack.py game.js https://dyduq12.github.io/dyduq12/qrgame/loader.html`
4. Escaneie o `qr.png` gerado.
