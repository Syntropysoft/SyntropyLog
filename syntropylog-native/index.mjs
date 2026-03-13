import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const native = require(join(__dirname, 'index.js'))

export const { configureNative, fastSerialize, ping } = native
export default native
