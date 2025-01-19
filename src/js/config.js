const ENV = {
  development: {
    API_URL: 'http://localhost:3000',
    ENV: 'development'
  },
  production: {
    API_URL: 'https://ipcapi.yilmazc.com',
    ENV: 'production'
  }
};

// You can change this to 'production' or 'development'
const CURRENT_ENV = 'production';

const config = ENV[CURRENT_ENV];