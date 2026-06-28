from __future__ import annotations

from PIL import Image, ImageFilter

Box = tuple[int, int, int, int]


def blur_regions(
    image: Image.Image,
    boxes: list[Box],
    radius: int = 12,
) -> Image.Image:
    """Gaussian-blur the given boxes. Pure PIL, no model dependency."""
    if not boxes:
        return image

    result = image.copy()
    width, height = result.size
    for x1, y1, x2, y2 in boxes:
        left = max(0, int(x1))
        top = max(0, int(y1))
        right = min(width, int(x2))
        bottom = min(height, int(y2))
        if right <= left or bottom <= top:
            continue
        region = result.crop((left, top, right, bottom)).filter(
            ImageFilter.GaussianBlur(radius)
        )
        result.paste(region, (left, top))
    return result


def detect_sensitive_regions(image: Image.Image) -> list[Box]:
    """Detect human faces and license plates via OpenCV Haar cascades.

    Defensive: if OpenCV is unavailable, returns no regions (no blur) rather
    than failing the request.
    """
    try:
        import cv2
        import numpy as np
    except Exception:
        return []

    gray = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
    boxes: list[Box] = []
    cascades = (
        "haarcascade_frontalface_default.xml",
        "haarcascade_russian_plate_number.xml",
    )
    for cascade_file in cascades:
        classifier = cv2.CascadeClassifier(cv2.data.haarcascades + cascade_file)
        if classifier.empty():
            continue
        for x, y, w, h in classifier.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5
        ):
            boxes.append((int(x), int(y), int(x + w), int(y + h)))
    return boxes


def blur_sensitive_regions(image: Image.Image) -> Image.Image:
    """Blur human faces / license plates before the crop is persisted."""
    return blur_regions(image, detect_sensitive_regions(image))
