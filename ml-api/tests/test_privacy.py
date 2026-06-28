from PIL import Image

from app.privacy import blur_regions, blur_sensitive_regions


def test_blur_regions_changes_pixels_inside_the_box_only():
    # Left half black, right half white -> a sharp vertical edge at x=50.
    image = Image.new("RGB", (100, 100), "black")
    image.paste(Image.new("RGB", (50, 100), "white"), (50, 0))
    original = image.copy()

    blurred = blur_regions(image, [(40, 40, 60, 60)], radius=8)

    # A pixel on the edge inside the box is no longer pure black/white.
    assert blurred.getpixel((50, 50)) != original.getpixel((50, 50))
    # A pixel far outside the box is untouched.
    assert blurred.getpixel((5, 5)) == original.getpixel((5, 5))


def test_blur_regions_no_boxes_returns_same_image():
    image = Image.new("RGB", (10, 10), "white")
    assert blur_regions(image, []) is image


def test_blur_sensitive_regions_runs_on_a_plain_image():
    image = Image.new("RGB", (32, 32), "white")
    result = blur_sensitive_regions(image)
    assert result.size == (32, 32)
