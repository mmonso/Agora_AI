import { createClient } from '@supabase/supabase-js';

/**
 * CONFIGURAÇÃO DO SUPABASE
 * ------------------------
 * Estas credenciais permitem que o frontend se comunique com o seu banco de dados.
 * A chave 'anon' é segura para uso no lado do cliente com RLS (Row Level Security) ativado.
 */
const supabaseUrl = 'https://dnurdaatsqnmzpinfwec.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudXJkYWF0c3FubXpwaW5md2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NTI2MjMsImV4cCI6MjA4MzUyODYyM30.kCNNfhKSstCgLAOM8s9vY82Zkwu_QMxkoBRGjCGtksA';

export const supabase = createClient(supabaseUrl, supabaseKey);
