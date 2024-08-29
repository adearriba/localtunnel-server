import Koa from 'koa';
import tldjs from 'tldjs';
import Debug from 'debug';
import http, { IncomingMessage, ServerResponse } from 'http';
import { hri } from 'human-readable-ids';
import Router from 'koa-router';
import net from 'net';

import { ClientManager } from './ClientManager';
import { validateSubdmain } from './Utils';

interface Options {
    domain?: string;
    landing?: string;
    secure?: boolean;
    max_tcp_sockets?: number;
}

const debug = Debug('localtunnel:server');
const API_KEY = process.env.API_KEY ?? '';

export function createServer(opt: Options = {}): http.Server {
    const validHosts = opt.domain ? [opt.domain] : undefined;
    const myTldjs = tldjs.fromUserSettings({ validHosts });
    const landingPage = opt.landing || 'https://localtunnel.github.io/www/';

    function GetClientIdFromHostname(hostname: string): string | null {
        return myTldjs.getSubdomain(hostname);
    }

    const manager = new ClientManager(opt);

    const schema = opt.secure ? 'https' : 'http';

    const app = new Koa();
    const router = new Router();

    router.get('/api/status', async (ctx) => {
        const stats = manager.stats;
        ctx.body = {
            tunnels: stats.tunnels,
            mem: process.memoryUsage(),
        };
    });

    router.get('/api/tunnels', async (ctx) => {
        ctx.body = manager.getClients();
    });

    router.get('/api/tunnels/:id/status', async (ctx) => {
        const clientId = ctx.params.id;
        const client = manager.getClient(clientId);
        if (!client) {
            ctx.throw(404);
            return;
        }

        const stats = client.stats();
        ctx.body = {
            connected_sockets: stats.connectedSockets,
        };
    });

    app.use(router.routes());
    app.use(router.allowedMethods());

    // root endpoint
    app.use(async (ctx, next) => {
        const path = ctx.request.path;

        // skip anything not on the root path
        if (path !== '/') {
            await next();
            return;
        }

        const isNewClientRequest = ctx.query['new'] !== undefined;
        if (isNewClientRequest) {
            const apiKey = ctx.request.headers['x-api-key'];

            if (!apiKey || apiKey !== API_KEY) {
                ctx.status = 401;
                return;
            }

            const reqId = hri.random();
            debug('making new client with id %s', reqId);
            const info = await manager.newClient(reqId);

            const url = `${schema}://${info.id}.${ctx.request.host}`;
            info.url = url;
            ctx.body = info;
            return;
        }

        // no new client request, send to landing page
        ctx.redirect(landingPage);
    });

    // anything after the / path is a request for a specific client name
    app.use(async (ctx, next) => {
        const parts = ctx.request.path.split('/');

        // any request with several layers of paths is not allowed
        if (parts.length !== 2) {
            await next();
            return;
        }

        const reqId = parts[1];

        const apiKey = ctx.request.headers['x-api-key'];

        if (!apiKey || apiKey !== API_KEY) {
            ctx.status = 401;
            return;
        }

        // limit requested hostnames to 63 characters
        const subdomainValidation = validateSubdmain(reqId);
        if (!subdomainValidation.success) {
            ctx.status = 403;
            ctx.body = { message: subdomainValidation.message };
            return;
        }

        debug('making new client with id %s', reqId);
        const info = await manager.newClient(reqId);

        const url = `${schema}://${info.id}.${ctx.request.host}`;
        info.url = url;
        ctx.body = info;
        return;
    });

    const server = http.createServer();

    const appCallback = app.callback();

    server.on('request', (req: IncomingMessage, res: ServerResponse) => {
        // without a hostname, we won't know who the request is for
        const hostname = req.headers.host;
        if (!hostname) {
            res.statusCode = 400;
            res.end('Host header is required');
            return;
        }

        const clientId = GetClientIdFromHostname(hostname);
        if (!clientId) {
            appCallback(req, res);
            return;
        }

        const client = manager.getClient(clientId);
        if (!client) {
            res.statusCode = 404;
            res.end('404');
            return;
        }

        client.handleRequest(req, res);
    });

    server.on('upgrade', (req: IncomingMessage, socket: net.Socket, head: Buffer) => {
        const hostname = req.headers.host;
        if (!hostname) {
            socket.destroy();
            return;
        }

        const clientId = GetClientIdFromHostname(hostname);
        if (!clientId) {
            socket.destroy();
            return;
        }

        const client = manager.getClient(clientId);
        if (!client) {
            socket.destroy();
            return;
        }

        client.handleUpgrade(req, socket);
    });

    return server;
}
