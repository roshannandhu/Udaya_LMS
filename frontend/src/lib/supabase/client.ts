import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export const getAuthToken = () => localStorage.getItem('tutoria_token');

export const setAuthToken = (token) => localStorage.setItem('tutoria_token', token);

export const clearAuthToken = () => localStorage.removeItem('tutoria_token');

supabase.auth.onAuthStateChange((event, session) => {
  if (session?.access_token) {
    setAuthToken(session.access_token);
  } else {
    clearAuthToken();
  }
});