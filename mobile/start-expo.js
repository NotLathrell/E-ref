const { spawn } = require('child_process');
const { join } = require('path');
const { networkInterfaces } = require('os');

function getLanHost() {
  const interfaces = networkInterfaces();
  const addresses = Object.values(interfaces)
    .flat()
    .filter((address) => address && address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);

  return addresses.find((address) => address.startsWith('192.168.')) || addresses[0] || '127.0.0.1';
}

const host = getLanHost();
const expoBinary = join(__dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo');
// Metro spawns one transform worker per CPU core by default. On a machine with
// many cores but modest RAM that exhausts memory while bundling, so cap it.
// Override with EXPO_MAX_WORKERS if you have memory to spare.
const args = ['start', '--host', 'lan', '--max-workers', process.env.EXPO_MAX_WORKERS || '2'];

const command = process.platform === 'win32' ? 'cmd.exe' : expoBinary;
const commandArgs = process.platform === 'win32' ? ['/c', expoBinary, ...args] : args;

const proc = spawn(command, commandArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_PACKAGER_HOSTNAME: host,
    REACT_NATIVE_PACKAGER_HOSTNAME: host,
    EXPO_PUBLIC_API_HOST: host,
    EXPO_PUBLIC_API_URL: `http://${host}:8000`
  }
});

proc.on('error', (err) => {
  console.error('Failed to start Expo:', err);
  process.exit(1);
});

proc.on('close', (code) => {
  process.exit(code);
});
