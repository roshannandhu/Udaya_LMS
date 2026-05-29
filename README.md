# Tutoria LMS

Welcome to the Tutoria LMS repository! This project consists of a React (Vite) frontend and a Python (FastAPI) backend.

## Prerequisites
Before you begin, ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/en/) (v16 or higher)
- [Python](https://www.python.org/downloads/) (3.10 or higher)
- A [Supabase](https://supabase.com/) project (if you are setting up your own database)

## Environment Setup
Because `.env` files contain sensitive secrets, they are intentionally excluded from the GitHub repository. You must create them manually before running the app.

### 1. Frontend Configuration
1. Navigate to the `frontend` folder.
2. Copy `.env.local.example` to a new file named `.env.local`.
   ```bash
   cd frontend
   cp .env.local.example .env.local
   ```
3. Open `.env.local` and fill in your Supabase details (or ask the repository owner for the shared testing keys).

### 2. Backend Configuration
1. Navigate to the `backend` folder.
2. Copy `.env.example` to a new file named `.env`.
   ```bash
   cd backend
   cp .env.example .env
   ```
3. Open `.env` and fill in your Supabase connection strings and Service Role Key.

## Running the Application

You will need two separate terminal windows to run both the frontend and backend simultaneously.

### Terminal 1: Backend
1. Open a terminal and navigate to the `backend` directory.
2. Create and activate a Python virtual environment (recommended):
   ```bash
   python -m venv venv
   
   # On Windows:
   venv\Scripts\activate
   
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the FastAPI server:
   ```bash
   uvicorn main:app --port 8001 --reload
   ```

### Terminal 2: Frontend
1. Open a new terminal and navigate to the `frontend` directory.
2. Install the Node modules:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```

The frontend will now be available at `http://localhost:5173` and will correctly communicate with the backend on port 8001.

## Database Setup
If you are spinning up a fresh database on your own Supabase project:
1. Go to the Supabase SQL Editor.
2. Copy and paste the contents of `backend/schema.sql` and run it to create the tables.
3. Copy and paste the contents of `backend/optimize_indexes.sql` and run it to optimize the database.

## Features & Modules
* **Student Portal & Teacher Portal**: Role-based access with JWT authentication.
* **Assignments Module**: Teachers can create assignments with attachments, and students can submit their work for grading.
* **AI Mentorship (Report Cards)**: Analyzes student performance and generates dynamic, personalized insights.
  * *Note: AI Mentorship requires an API key (e.g., Gemini). Teachers can configure this directly via the UI in the Settings page. The API key is securely saved to `backend/teacher_settings.json`.*
