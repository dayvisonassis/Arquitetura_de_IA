import path from 'path'
import dotenv from 'dotenv'

const environment = process.env.NODE_ENV || 'development'

dotenv.config({
  path: path.join(process.cwd(), `.env.${environment}`),
  quiet: true
})
