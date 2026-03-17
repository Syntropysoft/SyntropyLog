import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// Static path: load the CJS sibling (no dynamic require; safe for tooling/Socket)
const native = require('./index.js')

export const { configureNative, fastSerialize, fastSerializeFromJson, ping } = native
export default native
