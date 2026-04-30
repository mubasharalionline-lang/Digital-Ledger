const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const envUrlMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const envKeyMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabaseUrl = envUrlMatch ? envUrlMatch[1].trim() : '';
const supabaseKey = envKeyMatch ? envKeyMatch[1].trim() : '';

const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data, error } = await supabase.from('users').select('*');
  console.log("USERS:", data?.length);
  if (error) console.log(error);
  
  // try inserting a dummy user
  const { data: iData, error: iErr } = await supabase.from('users').insert({
    username: 'dummy_user_' + Date.now(),
    password: 'password',
    role: 'Staff'
  });
  console.log("INSERT ERROR:", iErr);
}
run();
