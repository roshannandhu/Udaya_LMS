import asyncio
import httpx
from main import service_supabase
async def test():
    token = ""
    res = service_supabase.auth.sign_in_with_password({"email": "teacher1@example.com", "password": "password"})
    token = res.session.access_token
    
    async with httpx.AsyncClient() as client:
        files = {"file": ("test.jpg", b"fake image bytes", "image/jpeg")}
        res = await client.post("http://localhost:8000/api/upload", files=files, headers={"Authorization": f"Bearer {token}"})
        print("Image:", res.status_code, res.text)
        
        files = {"file": ("test.webm", b"fake audio bytes", "audio/webm")}
        res = await client.post("http://localhost:8000/api/upload", files=files, headers={"Authorization": f"Bearer {token}"})
        print("Audio:", res.status_code, res.text)
asyncio.run(test())
