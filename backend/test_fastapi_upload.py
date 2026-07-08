import asyncio
from main import validate_upload, _UPLOAD_MIME_OK, IMAGE_EXTS

print('Testing validate_upload with jpg...')
content = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00'
try:
    ext = validate_upload('test.jpg', content, IMAGE_EXTS, content_type='image/jpeg')
    print('Success:', ext)
except Exception as e:
    print('Failed:', type(e), str(e))

print('Testing validate_upload with mp3...')
content_mp3 = b'ID3\x03\x00\x00\x00\x00\x00\x00'
try:
    from main import AUDIO_EXTS
    ext = validate_upload('test.mp3', content_mp3, AUDIO_EXTS, content_type='audio/mpeg')
    print('Success:', ext)
except Exception as e:
    print('Failed:', type(e), str(e))
