"""Generate a cactus icon for the Swarm Orchestrator desktop shortcut."""
import struct, os, zlib

def create_cactus_ico(path):
    """Create a 32x32 cactus icon as .ico file."""
    W, H = 32, 32
    # RGBA pixel data - simple cactus on desert background
    pixels = []

    # Color palette
    SKY = (135, 206, 235, 255)      # sky blue
    SAND = (244, 211, 94, 255)       # desert sand
    CACTUS = (46, 204, 113, 255)     # green
    CACTUS_D = (39, 174, 96, 255)    # darker green
    OUTLINE = (61, 43, 31, 255)      # dark brown
    TRANSPARENT = (0, 0, 0, 0)

    for y in range(H):
        row = []
        for x in range(W):
            # Ground line at y=24
            if y >= 24:
                row.append(SAND)
            elif y < 4:
                row.append(SKY)
            else:
                # Sky background
                c = SKY

                # Main trunk: x 14-17, y 8-23
                if 14 <= x <= 17 and 8 <= y <= 23:
                    c = CACTUS
                # Left arm: x 9-13, y 12-13
                elif 9 <= x <= 13 and 12 <= y <= 13:
                    c = CACTUS
                # Left arm vertical: x 9-10, y 14-17
                elif 9 <= x <= 10 and 14 <= y <= 17:
                    c = CACTUS
                # Left arm top: x 9-10, y 10-11
                elif 9 <= x <= 10 and 10 <= y <= 11:
                    c = CACTUS
                # Right arm: x 18-22, y 15-16
                elif 18 <= x <= 22 and 15 <= y <= 16:
                    c = CACTUS
                # Right arm vertical: x 21-22, y 11-14
                elif 21 <= x <= 22 and 11 <= y <= 14:
                    c = CACTUS

                # Outline: 1px border around cactus parts
                if c == SKY:
                    # Check if any neighbor is cactus
                    for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                        nx, ny = x+dx, y+dy
                        if 0 <= nx < W and 0 <= ny < H:
                            is_cactus = False
                            if 14 <= nx <= 17 and 8 <= ny <= 23: is_cactus = True
                            elif 9 <= nx <= 13 and 12 <= ny <= 13: is_cactus = True
                            elif 9 <= nx <= 10 and 14 <= ny <= 17: is_cactus = True
                            elif 9 <= nx <= 10 and 10 <= ny <= 11: is_cactus = True
                            elif 18 <= nx <= 22 and 15 <= ny <= 16: is_cactus = True
                            elif 21 <= nx <= 22 and 11 <= ny <= 14: is_cactus = True
                            if is_cactus:
                                c = OUTLINE
                                break

                row.append(c)
        pixels.append(row)

    # Build BMP data (BGRA, bottom-up)
    bmp_data = bytearray()
    for y in range(H - 1, -1, -1):
        for x in range(W):
            r, g, b, a = pixels[y][x]
            bmp_data.extend([b, g, r, a])

    # AND mask (1bpp, all opaque)
    and_mask = bytes(H * 4)  # 32 pixels wide = 4 bytes per row

    # ICO header
    ico_header = struct.pack('<HHH', 0, 1, 1)  # reserved, type=1(ico), count=1

    # BMP info header (BITMAPINFOHEADER)
    bmp_header = struct.pack('<IiiHHIIiiII',
        40,      # header size
        W,       # width
        H * 2,   # height (doubled for AND mask)
        1,       # planes
        32,      # bpp
        0,       # compression
        len(bmp_data) + len(and_mask),  # image size
        0, 0,    # ppm
        0, 0     # colors
    )

    image_data = bmp_header + bytes(bmp_data) + and_mask

    # ICO directory entry
    ico_entry = struct.pack('<BBBBHHII',
        W if W < 256 else 0,   # width
        H if H < 256 else 0,   # height
        0,       # color palette
        0,       # reserved
        1,       # color planes
        32,      # bpp
        len(image_data),       # size
        6 + 16   # offset (header=6 + entry=16)
    )

    with open(path, 'wb') as f:
        f.write(ico_header + ico_entry + image_data)

    print(f"Created icon: {path} ({os.path.getsize(path)} bytes)")

if __name__ == "__main__":
    create_cactus_ico(os.path.join(os.path.dirname(os.path.abspath(__file__)), "cactus.ico"))
