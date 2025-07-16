// Import the main object from our published library
const { syntropyLog } = require('@gabriel70g/syntropylog');

async function main() {
  await syntropyLog.init({
    logger: {
      serviceName: 'github-consumer-test',
      serializerTimeoutMs: 100,
    },
  });


  
  console.log('Attempting to use the library from GitHub Packages...');

  // If this line executes without crashing, it means the package was
  // successfully installed and imported.
  const logger = await syntropyLog.getLogger('github-consumer-test');



  await logger.info('SUCCESS! The library was consumed from GitHub Packages correctly.');
  console.log('SUCCESS! The library was consumed from GitHub Packages correctly.');
}

main(); 