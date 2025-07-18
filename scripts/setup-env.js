#!/usr/bin/env node

/**
 * Setup environment script for SyntropyLog
 * 
 * This script detects whether we're in a submodule environment or standalone
 * and configures the project accordingly.
 */

const fs = require('fs');
const path = require('path');

function detectEnvironment() {
  const submodulePath = path.join(__dirname, '..', 'modules', '@syntropylog', 'types');
  const hasSubmodule = fs.existsSync(submodulePath);
  
  return {
    isSubmodule: hasSubmodule,
    submodulePath: hasSubmodule ? submodulePath : null
  };
}

function updatePackageJson(env) {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const package = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  if (env.isSubmodule) {
    console.log('🔄 Detected submodule environment - configuring for local development');
    
    // Add local path mapping for development
    package.dependencies['@syntropylog/types'] = 'file:./modules/@syntropylog/types';
    
    // Add workspace configuration
    if (!package.workspaces) {
      package.workspaces = [];
    }
    
    if (!package.workspaces.includes('modules/@syntropylog/types')) {
      package.workspaces.push('modules/@syntropylog/types');
    }
    
    if (!package.workspaces.includes('modules/@syntropylog/adapters')) {
      package.workspaces.push('modules/@syntropylog/adapters');
    }
    
  } else {
    console.log('📦 Detected standalone environment - using npm package');
    
    // Ensure we're using the npm package
    if (package.dependencies['@syntropylog/types'] && 
        package.dependencies['@syntropylog/types'].startsWith('file:')) {
      package.dependencies['@syntropylog/types'] = '^0.1.1';
    }
    
    // Remove from workspaces if present
    if (package.workspaces) {
      package.workspaces = package.workspaces.filter(w => !w.includes('@syntropylog/'));
    }
  }
  
  fs.writeFileSync(packagePath, JSON.stringify(package, null, 2));
  console.log('✅ Package.json updated');
}

function updateTsConfig(env) {
  const tsConfigPath = path.join(__dirname, '..', 'tsconfig.json');
  const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, 'utf8'));
  
  if (env.isSubmodule) {
    // Add path mapping for local development
    if (!tsConfig.compilerOptions.paths) {
      tsConfig.compilerOptions.paths = {};
    }
    
    tsConfig.compilerOptions.paths['@syntropylog/types'] = [
      './modules/@syntropylog/types/src'
    ];
    tsConfig.compilerOptions.paths['@syntropylog/types/*'] = [
      './modules/@syntropylog/types/src/*'
    ];
    
  } else {
    // Remove local path mappings
    if (tsConfig.compilerOptions.paths) {
      delete tsConfig.compilerOptions.paths['@syntropylog/types'];
      delete tsConfig.compilerOptions.paths['@syntropylog/types/*'];
    }
  }
  
  fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
  console.log('✅ tsconfig.json updated');
}

function main() {
  console.log('🔧 Setting up SyntropyLog environment...');
  
  const env = detectEnvironment();
  updatePackageJson(env);
  updateTsConfig(env);
  
  console.log('🎉 Environment setup complete!');
  console.log(`Mode: ${env.isSubmodule ? 'Submodule Development' : 'Standalone'}`);
}

if (require.main === module) {
  main();
}

module.exports = { detectEnvironment, updatePackageJson, updateTsConfig }; 