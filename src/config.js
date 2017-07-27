
import dotenv from 'dotenv'
const ENV = process.env.NODE_ENV || 'development'

if (ENV === 'development') dotenv.load()

const config = {
  ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  MONGODB_URI: process.env.MONGODB_DEV_URI,
  PROXY_URI: process.env.PROXY_URI,
  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID_DEV,
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET_DEV,
  EMOJI_TOKEN: process.env.EMOJI_TOKEN
}

export default (key) => {
  if (!key) return config
  return config[key]
}
