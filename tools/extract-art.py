"""
Estrae dal PDF di Guardie & Ladri le illustrazioni usate dall'interfaccia del sistema.

    pip install pymupdf pillow
    python tools/extract-art.py "C:/percorso/manuale.pdf"

Scrive in assets/gl-art/. Le illustrazioni sono di Luca Erbetta, la grafica di Carolina Fiandri,
il gioco di Atropo Kelevra e Valentino Sergi (Officina Meningi): NON sono coperte dalla licenza MIT del codice.
Gli xref sono quelli della prima edizione (gennaio 2025): con un'altra edizione lancia con --list.
"""
import sys
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image, ImageEnhance, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "assets" / "gl-art"

# nome -> (xref, formato, lato massimo)
IMMAGINI = {
    "copertina": (701, "jpg", 1200),
    "logo": (26, "png", 900),
    "berretto": (15, "jpg", 1000),
    "gangster": (180, "png", 900),
    "lady": (190, "png", 900),
    "meccanico": (200, "png", 900),
    "intellettuale": (210, "png", 900),
    "recluta": (173, "png", 900),
    "piano": (370, "jpg", 1200),
    "caveau": (393, "jpg", 1200),
    "fuga": (410, "jpg", 1200),
    "retro": (462, "jpg", 1000),
    "carta": (481, "jpg", 1000),
    "nero": (447, "jpg", 1000),
    "jolly": (363, "png", 600),
    "sbarre": (130, "png", 500),
    "bomba": (138, "png", 600),
    "borsetta": (159, "png", 600),
    "cannello": (166, "png", 500),
    "manganello": (223, "png", 600),
}


def pixmap(pdf, xref):
    pix = fitz.Pixmap(pdf, xref)
    smask = pdf.xref_get_key(xref, "SMask")
    if smask[0] == "xref":
        pix = fitz.Pixmap(pix, fitz.Pixmap(pdf, int(smask[1].split()[0])))
    if pix.n - pix.alpha > 3:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    mode = "RGBA" if pix.alpha else "RGB"
    return Image.frombytes(mode, (pix.width, pix.height), pix.samples)


def salva(im, nome, fmt, lato):
    im.thumbnail((lato, lato), Image.LANCZOS)
    if fmt == "jpg":
        if im.mode == "RGBA":
            bg = Image.new("RGB", im.size, (16, 16, 16))
            bg.paste(im, mask=im.split()[3])
            im = bg
        im.convert("RGB").save(OUT / f"{nome}.jpg", quality=86, optimize=True)
    else:
        im.save(OUT / f"{nome}.png", optimize=True)


def sfondo(pdf):
    """Sfondo 1920x1080 per la schermata d'ingresso e la scena: carta nera, copertina, logo."""
    W, H = 1920, 1080
    nero = pixmap(pdf, 447).convert("RGB").resize((W, H), Image.LANCZOS)
    nero = ImageEnhance.Brightness(nero).enhance(0.55)
    base = Image.new("RGB", (W, H), (10, 10, 10))
    base.paste(nero)
    # inseguimento sfumato a sinistra
    fuga = pixmap(pdf, 410).convert("RGB")
    fuga = fuga.resize((int(fuga.width * H / fuga.height), H), Image.LANCZOS)
    fuga = ImageEnhance.Brightness(fuga).enhance(0.45)
    mask = Image.new("L", fuga.size, 0)
    fw = fuga.width
    for x in range(fw):  # piena fino al 45%, poi sfuma a zero
        a = 255 if x < fw * 0.45 else max(0, int(255 * (1 - (x - fw * 0.45) / (fw * 0.55))))
        mask.paste(a, (x, 0, x + 1, fuga.height))
    base.paste(fuga, (0, 0), mask)
    # copertina a destra
    cop = pixmap(pdf, 701).convert("RGB")
    h = int(H * 0.86)
    cop = cop.resize((int(cop.width * h / cop.height), h), Image.LANCZOS)
    ombra = Image.new("RGBA", (cop.width + 40, cop.height + 40), (0, 0, 0, 0))
    ombra.paste((0, 0, 0, 170), (20, 20, cop.width + 20, cop.height + 20))
    ombra = ombra.filter(ImageFilter.GaussianBlur(14))
    x, y = W - cop.width - 150, (H - h) // 2
    base.paste(ombra, (x - 12, y - 4), ombra)
    base.paste(cop, (x, y))
    base.save(OUT / "sfondo.jpg", quality=86, optimize=True)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pdf = fitz.open(sys.argv[1])
    if "--list" in sys.argv:
        for i, page in enumerate(pdf, 1):
            print(i, [(im[0], im[2], im[3]) for im in page.get_images(full=True)])
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for nome, (xref, fmt, lato) in IMMAGINI.items():
        salva(pixmap(pdf, xref), nome, fmt, lato)
        print("ok", nome)
    sfondo(pdf)
    print("ok sfondo")


if __name__ == "__main__":
    main()
