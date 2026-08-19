/**
 * Example: MiLyfe Governance Module using MiForge Platform
 *
 * This shows how a developer building on the MiLyfe lifestyle governance
 * platform would integrate AI capabilities via the MiForge SDK.
 *
 * Run: npx tsx examples/governance-module.ts
 */

import { MiForge } from '../sdk/typescript/index.js';

async function main() {
  const forge = new MiForge();
  console.log('🏛️ MiLyfe Governance Module — MiForge Demo\n');

  // ═══ 1. AI-Powered Governance Analysis ═══
  console.log('📋 Analyzing governance proposal...');
  const analysis = await forge.complete(
    `Analyze this governance proposal and identify risks, benefits, and implementation considerations:
    
    Proposal: "Allow community members with 100+ reputation points to submit 
    and vote on platform feature requests. Top-voted features get prioritized 
    in the development backlog."`,
    { taskType: 'deep_reasoning', systemPrompt: 'You are a governance advisor for the MiLyfe platform.' }
  );
  console.log(`  Provider: ${analysis.provider} | Tokens: ${analysis.tokens}`);
  console.log(`  Analysis: ${analysis.text.slice(0, 200)}...\n`);

  // ═══ 2. Store Decision in Graph Memory (Permanent) ═══
  console.log('💾 Storing governance decision in memory...');
  await forge.memory.remember(
    'Governance decision: Community feature voting approved for users with 100+ rep. Implemented via weighted voting system.',
    'org_milyfe_governance',
    0.95, // High importance → graph tier (permanent)
    { type: 'governance_decision', date: new Date().toISOString(), proposal_id: 'PROP-2026-042' }
  );
  console.log('  ✅ Stored in graph memory (permanent, relational)\n');

  // ═══ 3. Retrieve Precedents via RAG ═══
  console.log('🔍 Searching for related precedents...');
  const precedents = await forge.rag.retrieve('community voting governance decisions');
  if (precedents.length > 0) {
    console.log(`  Found ${precedents.length} relevant precedents:`);
    for (const p of precedents.slice(0, 3)) {
      console.log(`    • [${p.source}] (score: ${p.score.toFixed(2)}) ${p.content.slice(0, 80)}...`);
    }
  } else {
    console.log('  No precedents found (RAG database empty — ingest documents first)');
  }
  console.log('');

  // ═══ 4. Safe Execution (Gate 1 would trigger for deploy) ═══
  console.log('🛡️ Testing safety gate...');
  const result = await forge.safe('update governance rules in database', async () => {
    // This is a safe action (no irreversible keywords) — will pass
    return { updated: true, rules: 'community_voting_v2' };
  });
  console.log(`  Result: ${result ? '✅ Approved and executed' : '❌ Blocked by safety gate'}\n`);

  // ═══ 5. Swarm Consensus (Multiple models agree on a decision) ═══
  console.log('🐝 Running swarm consensus on implementation approach...');
  const swarmResult = await forge.swarm.swarmSolve(
    'What is the best database schema for a community feature voting system with reputation-weighted votes?',
    { n: 3 }
  );
  console.log(`  Confidence: ${(swarmResult.confidence * 100).toFixed(0)}%`);
  console.log(`  Models used: ${swarmResult.agreement.map(a => a.model).join(', ')}`);
  console.log(`  Answer: ${swarmResult.answer.slice(0, 150)}...\n`);

  // ═══ 6. Platform Status ═══
  console.log('📊 Platform Status:');
  const status = forge.status();
  console.log(`  Memory entries: ${status.memory.contextEntries} (context tier)`);
  console.log(`  Total cost: $${status.providers.totalCost.toFixed(2)}`);
  console.log(`  Skills cached: ${status.skills}`);
  console.log('');
  console.log('✅ Governance module demo complete. Monthly cost: $0.00');
}

main().catch(console.error);
