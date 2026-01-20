// Quick test of the SDK
import { AutoIncentiveFacilitator, createFacilitator, DEFAULT_FACILITATOR_URL } from './dist/index.mjs';

async function main() {
  console.log('Testing AutoIncentive Facilitator SDK\n');
  console.log(`Default URL: ${DEFAULT_FACILITATOR_URL}\n`);

  // Test with production facilitator
  const facilitator = new AutoIncentiveFacilitator({
    baseUrl: 'https://facilitator.x402endpoints.online'
  });

  try {
    // Test health
    console.log('1. Testing health()...');
    const health = await facilitator.health();
    console.log('   ✓ Health:', health);

    // Test isHealthy
    console.log('\n2. Testing isHealthy()...');
    const isHealthy = await facilitator.isHealthy();
    console.log('   ✓ Is Healthy:', isHealthy);

    // Test supported
    console.log('\n3. Testing supported()...');
    const supported = await facilitator.supported();
    console.log('   ✓ Supported networks:', supported.kinds.length);
    console.log('   ✓ EVM signers:', supported.signers['eip155:*']);
    console.log('   ✓ Solana signers:', supported.signers['solana:*']);

    // Test isNetworkSupported
    console.log('\n4. Testing isNetworkSupported()...');
    const baseSupported = await facilitator.isNetworkSupported('base');
    console.log('   ✓ Base supported:', baseSupported);

    // Test getSignerForNetwork
    console.log('\n5. Testing getSignerForNetwork()...');
    const signer = await facilitator.getSignerForNetwork('base');
    console.log('   ✓ Base signer:', signer);

    // Test OASF record
    console.log('\n6. Testing getOASFRecord()...');
    const oasfRecord = await facilitator.getOASFRecord();
    console.log('   ✓ Agent name:', oasfRecord.name);
    console.log('   ✓ Version:', oasfRecord.version);
    console.log('   ✓ Skills:', oasfRecord.skills.length);

    // Test OASF skills
    console.log('\n7. Testing getOASFSkills()...');
    const skills = await facilitator.getOASFSkills();
    console.log('   ✓ Skills response:', skills.skills.length, 'skills');

    // Test discovery
    console.log('\n8. Testing listResources()...');
    const resources = await facilitator.listResources({ limit: 5 });
    console.log('   ✓ Resources found:', resources.items.length);
    console.log('   ✓ Total in registry:', resources.pagination.total);

    // Test discovery stats
    console.log('\n9. Testing getDiscoveryStats()...');
    const stats = await facilitator.getDiscoveryStats();
    console.log('   ✓ Stats:', stats);

    // Test createFacilitator helper
    console.log('\n10. Testing createFacilitator() helper...');
    const facilitator2 = createFacilitator();
    const health2 = await facilitator2.health();
    console.log('    ✓ Helper works:', health2.status);

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.statusCode) {
      console.error('   Status code:', error.statusCode);
    }
    if (error.details) {
      console.error('   Details:', error.details);
    }
    process.exit(1);
  }
}

main();
