/* ==========================================
   supabase-client.js — Inicialização do cliente Supabase
   ========================================== */
const SUPABASE_URL  = 'https://mxvwccyopzfewhvscrzj.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14dndjY3lvcHpmZXdodnNjcnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MDI2OTYsImV4cCI6MjA5NDM3ODY5Nn0.zDPXwxt5UjY2NN1HMc1cVtPlKvAcOOlhh032Ls7MSMg';

// Criado via CDN: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js">
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
