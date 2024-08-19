#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("localenv");
const optimist_1 = __importDefault(require("optimist"));
const server_1 = require("./lib/server");
const debug_1 = __importDefault(require("debug"));
const winston_1 = __importDefault(require("winston"));
const log = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console(),
        new winston_1.default.transports.File({ filename: 'error.log', level: 'error' }),
        new winston_1.default.transports.File({ filename: 'combined.log' }),
    ],
});
const logger = (0, debug_1.default)('localtunnel');
const argv = optimist_1.default
    .usage('Usage: $0 --port [num]')
    .options('secure', {
    default: false,
    describe: 'use this flag to indicate proxy over https',
})
    .options('port', {
    default: '80',
    describe: 'listen on this port for outside requests',
})
    .options('address', {
    default: '0.0.0.0',
    describe: 'IP address to bind to',
})
    .options('domain', {
    describe: 'Specify the base domain name. This is optional if hosting localtunnel from a regular example.com domain. This is required if hosting a localtunnel server from a subdomain (i.e. lt.example.dom where clients will be client-app.lt.example.come)',
})
    .options('max-sockets', {
    default: 10,
    describe: 'maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)',
}).argv;
if (argv.help) {
    optimist_1.default.showHelp();
    process.exit();
}
const secure = process.env.SECURE ?? argv.secure;
const domain = process.env.DOMAIN ?? argv.domain;
const port = process.env.PORT ?? argv.port;
const address = process.env.ADDRESS ?? argv.address;
logger('Configuration', {
    domain,
    address,
    port,
    secure,
});
const server = (0, server_1.createServer)({
    max_tcp_sockets: argv['max-sockets'],
    secure: secure,
    domain: domain,
});
server.listen(port, address, () => {
    logger('server listening on port: %d', server.address().port);
});
process.on('SIGINT', () => {
    process.exit();
});
process.on('SIGTERM', () => {
    process.exit();
});
process.on('uncaughtException', (err) => {
    log.error(err);
});
process.on('unhandledRejection', (reason) => {
    log.error(reason);
});
