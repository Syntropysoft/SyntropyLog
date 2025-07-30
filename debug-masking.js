#!/usr/bin/env node

/**
 * Debug script para verificar el MaskingEngine
 */

const { MaskingEngine, MaskingStrategy } = require('./dist/masking/MaskingEngine');

console.log('🔍 Debugging MaskingEngine...\n');

// Crear engine con reglas por defecto
const engine = new MaskingEngine({
  enableDefaultRules: true,
  maskChar: '*',
  preserveLength: true
});

console.log('📊 Estadísticas del engine:');
console.log(JSON.stringify(engine.getStats(), null, 2));

console.log('\n🔍 Verificando reglas por defecto:');
const stats = engine.getStats();
console.log(`- Total rules: ${stats.totalRules}`);
console.log(`- Default rules: ${stats.defaultRules}`);
console.log(`- Custom rules: ${stats.customRules}`);

// Test simple con datos básicos
console.log('\n🧪 Test básico:');
const testData = {
  password: 'secret123',
  email: 'test@example.com',
  ssn: '123-45-6789',
  credit_card: '4111-1111-1111-1111'
};

console.log('📥 Datos originales:');
console.log(JSON.stringify(testData, null, 2));

const result = engine.process(testData);

console.log('\n📤 Resultado después de masking:');
console.log(JSON.stringify(result, null, 2));

console.log('\n✅ Verificación:');
console.log(`- Password: ${result.password} (esperado: *********)`);
console.log(`- Email: ${result.email} (esperado: t***@example.com)`);
console.log(`- SSN: ${result.ssn} (esperado: ***-**-6789)`);
console.log(`- Credit card: ${result.credit_card} (esperado: ****-****-****-1111)`);

console.log('\n🔍 Debug completado.'); 