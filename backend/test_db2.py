import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
service_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async def check():
    res = service_supabase.table('live_classes').select('id, title, scheduled_at').order('created_at', desc=True).limit(3).execute()
    print("Latest live classes:", res.data)

if __name__ == "__main__":
    asyncio.run(check())
