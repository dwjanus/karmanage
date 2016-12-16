
import dotenv from 'dotenv';
const ENV = process.env.NODE_ENV || 'development';

if (ENV === 'development') dotenv.load();

const config = {
  ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGODB_URI,
  PROXY_URI: process.env.PROXY_URI,
  ICON_EMOJI: ':robot:',
  SLACK_CLIENT_ID: process.env.CLIENT_ID,
  SLACK_CLIENT_SECRET: process.env.CLIENT_SECRET,
  APIAI_TOKEN: process.env.APIAI_TOKEN,
};

export default (key) => {
  if (!key) return config;
  return config[key];
};
