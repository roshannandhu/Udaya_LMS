import magic
try:
    print(magic.from_buffer(b"RIFF\x00\x00\x00\x00WEBP", mime=True))
    print(magic.from_buffer(b"\x1a\x45\xdf\xa3", mime=True)) # webm/mkv magic bytes
except Exception as e:
    print(e)
