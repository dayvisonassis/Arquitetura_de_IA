const path = require('path')
const dotenv = require('dotenv')

const environment = process.env.NODE_ENV || 'development'

dotenv.config({
  path: path.join(process.cwd(), `.env.${environment}`),
  quiet: true
})
