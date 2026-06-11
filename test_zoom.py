import sys
import asyncio
sys.path.append('./backend')
from backend.main import zoom_create_meeting

async def test():
    try:
        res = await zoom_create_meeting('Test Meeting', '2026-06-10T10:00:00Z', 60)
        print('Success:', res)
    except Exception as e:
        print('Error:', e)

asyncio.run(test())
