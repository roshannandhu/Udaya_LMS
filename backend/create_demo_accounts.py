#!/usr/bin/env python3
"""
Script to create demo accounts in Supabase.
Run this AFTER starting the backend: python main.py

Usage:
    python create_demo_accounts.py
"""

import requests
import json

BASE_URL = "http://localhost:8001"

def create_demo_accounts():
    print("Creating demo accounts...")
    
    response = requests.post(f"{BASE_URL}/api/demo/create-accounts")
    
    if response.status_code == 200:
        data = response.json()
        print("\n✅ " + data.get("message", "Done"))
        print("\n" + "="*60)
        print("DEMO ACCOUNTS")
        print("="*60)
        
        for account in data.get("accounts", []):
            if account["role"] == "teacher":
                print(f"\n👩‍🏫 TEACHER:")
                print(f"   Email:    {account['email']}")
                print(f"   Password: {account['password']}")
            else:
                print(f"\n👨‍🎓 STUDENT:")
                print(f"   Username: {account['username']}")
                print(f"   Password: {account['password']}")
        
        print("\n" + "="*60)
        print("LOGIN INSTRUCTIONS")
        print("="*60)
        print("\nTEACHER LOGIN:")
        print("  Email: teacher@udaya.com")
        print("  Password: teacher123")
        print("\nSTUDENT LOGIN:")
        print("  Use any username from the list above")
        print("  Password: student123")
        
    else:
        print(f"❌ Error: {response.text}")

def list_accounts():
    print("\nFetching existing accounts...")
    response = requests.get(f"{BASE_URL}/api/demo/list-accounts")
    
    if response.status_code == 200:
        data = response.json()
        print("\n👩‍🏫 Teachers:")
        for t in data.get("teachers", []):
            print(f"  - {t.get('name', 'N/A')} ({t.get('email', 'N/A')})")
        
        print("\n👨‍🎓 Students:")
        for s in data.get("students", []):
            print(f"  - {s.get('name', 'N/A')} (@{s.get('username', 'N/A')})")
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    print("\n" + "="*60)
    print("UDAYA LMS - Demo Account Creator")
    print("="*60)
    print("\nMake sure the backend is running first:")
    print("  cd backend && python main.py")
    print()
    
    try:
        create_demo_accounts()
        list_accounts()
    except requests.exceptions.ConnectionError:
        print("\n❌ Cannot connect to backend.")
        print("   Please start the backend first:")
        print("   cd backend")
        print("   python main.py")