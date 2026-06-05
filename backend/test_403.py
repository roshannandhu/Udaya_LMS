import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
service_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async def check():
    class_id = "042d9e16-869c-4667-b38f-2625ebce2a7b"
    class_result = service_supabase.table("subject_classes").select("id, standard_id").eq("id", class_id).single().execute()
    print("Class result:", class_result.data)
    
    if class_result.data:
        std_id = class_result.data["standard_id"]
        # print all students in this standard
        students = service_supabase.table("students").select("id, name, standard_id").eq("standard_id", std_id).execute()
        print("Students in standard:", students.data)
        
        # print all students overall
        all_students = service_supabase.table("students").select("id, name, standard_id").execute()
        print("All Students:", all_students.data)

if __name__ == "__main__":
    asyncio.run(check())
