
import dotenv from 'dotenv';
const ENV = process.env.NODE_ENV || 'development';

if (ENV === 'development') dotenv.load();

const config = {
  ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  REDIS_URL: process.env.REDIS_URL,
  PROXY_URI: process.env.PROXY_URI,
  ICON_EMOJI: ':mcfly:',
  SLACK_CLIENT_ID: process.env.CLIENT_ID,
  SLACK_CLIENT_SECRET: process.env.CLIENT_SECRET,
  SLACK_OAUTH_TOKEN: process.env.OAUTH_TOKEN,
  APIAI_TOKEN: process.env.APIAI_TOKEN,
};

export default (key) => {
  if (!key) return config;
  return config[key];
};
