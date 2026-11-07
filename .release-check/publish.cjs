// The managed terminal has no TTY, so npm otherwise declines to offer its web
// OTP flow. Enable that UI branch with browser=false: it prints the approval
// URL and polls npm's protected flow. No OTP is read, logged or bypassed here.
const path = require('node:path');
const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
process.stdin.isTTY = true;
process.stdout.isTTY = true;
process.argv = [process.execPath, cli, 'publish', './.release-check/lybx-leyw-dsh-pages-0.1.3.tgz', '--access=public', '--tag=latest', '--registry=https://registry.npmjs.org/', '--browser=false', '--color=false'];
require(cli);
