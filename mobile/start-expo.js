const { spawn } = require('child_process');
const { join } = require('path');
const { API_HOST } = require('./config');

const host = API_HOST.split(':')[0] || '127.0.0.1';
const expoBinary = join(__dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo');
const args = ['start', '--host', 'lan'];

const command = process.platform === 'win32' ? 'cmd.exe' : expoBinary;
const commandArgs = process.platform === 'win32' ? ['/c', expoBinary, ...args] : args;

const proc = spawn(command, commandArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_PACKAGER_HOSTNAME: host,
    REACT_NATIVE_PACKAGER_HOSTNAME: host
  }
});

proc.on('error', (err) => {
  console.error('Failed to start Expo:', err);
  process.exit(1);
});

proc.on('close', (code) => {
  process.exit(code);
});
