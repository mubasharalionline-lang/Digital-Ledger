const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// We'll read the environment variables manually since dotenv is missing
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('run_sql', { sql: "SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks';" });
  if (error) {
     console.log("RPC Error:", error);
     // let's try getting one task
     const { data: tData } = await supabase.from('tasks').select('*').limit(1);
     console.log("Task keys:", Object.keys(tData[0] || {}));
  } else {
     console.log(data);
  }
}
run();
