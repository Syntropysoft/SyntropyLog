#!/usr/bin/env node

/**
 * MaskingEngine JSON Flattening Example
 * 
 * This example demonstrates the ultra-fast JSON flattening strategy
 * used by the MaskingEngine for extreme performance when masking
 * sensitive data in complex nested objects.
 */

const { MaskingEngine, MaskingStrategy } = require('../dist/masking/MaskingEngine');

console.log('🔐 SyntropyLog - MaskingEngine JSON Flattening Demo\n');

// Create a masking engine with default rules
const maskingEngine = new MaskingEngine({
  enableDefaultRules: true,
  maskChar: '*',
  preserveLength: true
});

// Add some custom rules
maskingEngine.addRule({
  pattern: /api_key/i,
  strategy: MaskingStrategy.TOKEN,
  preserveLength: true,
  maskChar: '*'
});

maskingEngine.addRule({
  pattern: /custom_field/i,
  strategy: MaskingStrategy.CUSTOM,
  customMask: (value) => `CUSTOM_${value.length}_MASK`
});

// Create complex nested data structure
const complexData = {
  user: {
    profile: {
      personal: {
        ssn: '123-45-6789',
        email: 'john.doe@example.com',
        phone: '555-123-4567'
      },
      preferences: {
        notifications: {
          email: 'alerts@example.com',
          sms: '555-987-6543'
        }
      }
    },
    orders: [
      {
        id: 'ORD-001',
        payment: {
          card_number: '4111-1111-1111-1111',
          cvv: '123',
          expiry: '12/25'
        },
        items: [
          { product_id: 'PROD001', price: 29.99 },
          { product_id: 'PROD002', price: 49.99 }
        ]
      },
      {
        id: 'ORD-002',
        payment: {
          card_number: '5555-5555-5555-5555',
          cvv: '456',
          expiry: '06/26'
        },
        items: [
          { product_id: 'PROD003', price: 79.99 }
        ]
      }
    ],
    api_keys: {
      stripe_key: 'sk_test_1234567890abcdef',
      public_key: 'pk_test_1234567890abcdef'
    }
  },
  session: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    refresh_token: 'refresh_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
  },
  custom_field: 'hello world',
  normal_field: 'this should remain unchanged'
};

console.log('📊 Original Data Structure:');
console.log(JSON.stringify(complexData, null, 2));

console.log('\n🔄 Processing with JSON Flattening Strategy...\n');

// Process the data with masking
const startTime = Date.now();
const maskedData = maskingEngine.process(complexData);
const endTime = Date.now();

console.log('⚡ Processing Time:', endTime - startTime, 'ms');
console.log('📈 Performance: Ultra-fast JSON flattening strategy\n');

console.log('🔒 Masked Data Structure:');
console.log(JSON.stringify(maskedData, null, 2));

console.log('\n✅ Masking Results:');
console.log('• SSN:', maskedData.user.profile.personal.ssn);
console.log('• Email:', maskedData.user.profile.personal.email);
console.log('• Phone:', maskedData.user.profile.personal.phone);
console.log('• Credit Card 1:', maskedData.user.orders[0].payment.card_number);
console.log('• Credit Card 2:', maskedData.user.orders[1].payment.card_number);
console.log('• Stripe Key:', maskedData.user.api_keys.stripe_key);
console.log('• Session Token:', maskedData.session.token);
console.log('• Custom Field:', maskedData.custom_field);
console.log('• Normal Field:', maskedData.normal_field);

console.log('\n📊 Masking Engine Statistics:');
const stats = maskingEngine.getStats();
console.log(JSON.stringify(stats, null, 2));

console.log('\n🎯 Key Benefits of JSON Flattening:');
console.log('• ⚡ Extreme Speed: O(n) performance regardless of object depth');
console.log('• 🔄 Simple Processing: Linear key-value pairs for easy rule application');
console.log('• 🏗️ Structure Preservation: Original object structure maintained');
console.log('• 🛡️ Silent Observer: Never throws exceptions, always returns data');
console.log('• 🎛️ Flexible Rules: Regex patterns, custom functions, multiple strategies');

console.log('\n🚀 Ready for Production!'); 