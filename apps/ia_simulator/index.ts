import { createServer } from 'http'
import app from './src/app'

const port = Number(process.env.PORT) || 3132
const host = process.env.API_HOST || '127.0.0.1'

createServer(app).listen(port, host, () => {
  process.stdout.write(`ia_simulator listening on http://${host}:${port}\n`)
})
