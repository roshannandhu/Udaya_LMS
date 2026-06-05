import asyncio
import os
import base64
import httpx
from dotenv import load_dotenv

load_dotenv('.env')

async def main():
    acc = os.environ.get('ZOOM_ACCOUNT_ID')
    cid = os.environ.get('ZOOM_CLIENT_ID')
    sec = os.environ.get('ZOOM_CLIENT_SECRET')
    
    creds = base64.b64encode(f"{cid}:{sec}".encode()).decode()
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://zoom.us/oauth/token?grant_type=account_credentials&account_id={acc}",
            headers={"Authorization": f"Basic {creds}"}
        )
        token = resp.json()["access_token"]
        
        # Test creating a meeting
        payload = {
            "topic": "Test Meeting",
            "type": 2,
            "start_time": "2026-06-03T09:00:00",
            "duration": 60,
            "timezone": "Asia/Kolkata",
            "settings": {
                "host_video": True,
                "participant_video": True,
                "join_before_host": False,
                "waiting_room": True,
                "auto_recording": "none",
                "approval_type": 2,
            },
        }
        resp2 = await client.post(
            "https://api.zoom.us/v2/users/me/meetings",
            json=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        )
        print("Create Meeting Status:", resp2.status_code)
        print("Create Meeting Response:", resp2.json())

if __name__ == "__main__":
    asyncio.run(main())
