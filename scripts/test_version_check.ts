


const UPDATE_URLS = [
  'https://cdn.jsdelivr.net/gh/jimytao/lexicon@master/version.json',
  'https://raw.githubusercontent.com/jimytao/lexicon/master/version.json',
  'https://gcore.jsdelivr.net/gh/jimytao/lexicon@master/version.json'
];

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const n1 = parts1[i] || 0;
    const n2 = parts2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}


async function fetchManifestWithFallback() {
  console.log('\n--- Network Connectivity Test (Highest Version Strategy) ---');
  
  const results = await Promise.allSettled(
    UPDATE_URLS.map(async (url) => {
      const hostname = new URL(url).hostname;
      const start = Date.now();
      try {
        const response = await fetch(url + '?t=' + Date.now(), {
          signal: AbortSignal.timeout(8000),
          headers: { Accept: 'application/json' }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as any;
        const duration = Date.now() - start;
        console.log(`✅ ${hostname}: Success [${duration}ms] - Version: ${data.version}`);
        return data;
      } catch (e: any) {
        console.log(`❌ ${hostname}: Failed - ${e.message}`);
        throw e;
      }
    })
  );

  const manifests = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map(r => r.value);

  if (manifests.length === 0) throw new Error("All nodes failed");

  // Selection Logic: Sort by version descending
  manifests.sort((a, b) => compareVersions(b.version, a.version));
  
  const selected = manifests[0];
  console.log(`\n🏆 Strategy Selection: Picked version ${selected.version}`);
  return selected;
}



async function runSimulation() {
  try {
    const manifest = await fetchManifestWithFallback();
    const cloudVersion = manifest.version;

    console.log('\n--- Logic Simulation ---');
    
    const scenarios = [
      { local: '0.7.0', desc: 'Old version' },
      { local: cloudVersion, desc: 'Current version' },
      { local: '0.8.0', desc: 'Future/Dev version' }
    ];

    scenarios.forEach(({ local, desc }) => {
      const comp = compareVersions(cloudVersion, local);
      let result = '';
      if (comp > 0) result = `Update Available! (${local} -> ${cloudVersion})`;
      else if (comp === 0) result = `Up to date (${local})`;
      else result = `Current version is higher (${local} > ${cloudVersion})`;
      
      console.log(`Scenario [${desc}]: Local ${local} vs Cloud ${cloudVersion} => ${result}`);
    });

    console.log('\n--- Information Retrieval Test ---');
    console.log('Notes:', manifest.notes);
    console.log('Platforms:', Object.keys(manifest.platforms).join(', '));
    
    console.log('\n✅ Mock version test process completed successfully.');
  } catch (err: any) {
    console.error('\n❌ Simulation failed:', err.message);
    process.exit(1);
  }
}

runSimulation();
