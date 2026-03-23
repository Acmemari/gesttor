import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const PROD_URL = 'https://gesttor.app/api/agents-run';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_EMAIL = process.env.TEST_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

async function test() {
  console.log('=== Production Feedback Agent Test ===');
  console.log(`SUPABASE_URL: ${SUPABASE_URL ? '✅' : '❌ MISSING'}`);
  console.log(`SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? '✅' : '❌ MISSING'}`);

  if (!TEST_EMAIL || !TEST_PASSWORD) {
    console.log('⚠️  TEST_EMAIL/TEST_PASSWORD not set. Trying unauthenticated call to capture raw 500 body...');

    const res = await fetch(PROD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer fake_token',
      },
      body: JSON.stringify({ agentId: 'feedback', input: {} }),
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${text || '(empty body)'}`);
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authErr || !authData.session) {
    console.error('❌ Auth failed:', authErr?.message);
    return;
  }

  const token = authData.session.access_token;
  console.log(`✅ Authenticated as: ${authData.user.email}`);
  console.log(`Calling ${PROD_URL}...`);

  const res = await fetch(PROD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      agentId: 'feedback',
      input: {
        context: 'trabalho',
        feedbackType: 'construtivo',
        objective: 'Testing feedback',
        recipient: 'Test User',
        whatHappened: 'Test scenario for debugging the anthropic fetch replacement correctly',
        eventDate: '2026-02-20',
        eventMoment: 'Test meeting',
        damages: 'None',
        tone: 'direto',
        format: 'escrito',
        model: 'auto',
        existingText: '',
        lengthPreference: 'curto',
      },
    }),
  });

  const text = await res.text();
  console.log(`\nStatus: ${res.status}`);
  console.log(`Body: ${text.slice(0, 1000)}`);

  if (res.ok) {
    console.log('\n✅ PRODUCTION WORKS!');
  } else {
    console.log('\n❌ PRODUCTION FAILED');
  }
}

test().catch(console.error);
