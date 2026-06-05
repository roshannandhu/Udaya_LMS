import asyncio
from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(url, key)

async def test_upsert():
    try:
        # fetch a real broadcast id and student id to test
        b_res = supabase.table("broadcasts").select("id").limit(1).execute()
        if not b_res.data:
            print("No broadcasts")
            return
        bid = b_res.data[0]["id"]
        
        s_res = supabase.table("students").select("id").limit(1).execute()
        if not s_res.data:
            print("No students")
            return
        sid = s_res.data[0]["id"]

        print(f"Testing upsert with bid={bid}, sid={sid}")
        rows = [{"broadcast_id": bid, "student_id": sid}]
        res = supabase.table("broadcast_reads").upsert(rows, on_conflict="broadcast_id,student_id").execute()
        print("Success:", res.data)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(test_upsert())
