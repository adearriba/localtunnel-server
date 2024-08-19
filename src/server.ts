#!/usr/bin/env node

import 'localenv';
import optimist from 'optimist';
import { createServer } from './lib/server';
import debug from 'debug';
import winston from 'winston';

const log = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});

const logger = debug('localtunnel');

const argv = optimist
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
    optimist.showHelp();
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

const server = createServer({
    max_tcp_sockets: argv['max-sockets'],
    secure: secure,
    domain: domain,
});

server.listen(port, address, () => {
    logger('server listening on port: %d', (server.address() as any).port);
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
