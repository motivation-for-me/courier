import qrcode
from PIL import Image

# Define user's URL from image
url = "https://courier-six-henna.vercel.app/"

# Generate the static QR code
qr = qrcode.QRCode(
    version=1,
    error_correction=qrcode.constants.ERROR_CORRECT_H,
    box_size=10,
    border=4,
)
qr.add_data(url)
qr.make(fit=True)

img = qr.make_image(fill_color="black", back_color="white")
img.save("static_qr_code.png")
