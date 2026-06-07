import asyncio
import httpx
from main import SUPABASE_URL, SUPABASE_SERVICE_KEY

async def run():
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    ddl = "ALTER TABLE teacher_branding ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/pg-meta/v0/query", headers=headers, json={"query": ddl}
        )
        print(resp.status_code, resp.text)

if __name__ == "__main__":
    asyncio.run(run())
