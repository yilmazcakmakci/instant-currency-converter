const ENV = {
  development: {
    API_URL: 'http://localhost:3000'
  },
  production: {
    API_URL: 'https://ipcapi.yilmazc.com'
  }
};

// You can change this to 'production' or 'development'
const CURRENT_ENV = 'production';

const config = ENV[CURRENT_ENV];