import { agent } from 'supertest';
import { assert, describe, it } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import net, { AddressInfo } from 'net';
import { createServer } from '../src/lib/server';

describe('Server', () => {
    it('server starts and stops', async () => {
        const server = createServer();
        await new Promise<void>(resolve => server.listen(resolve));
        await new Promise<void>((resolve: () => void) => server.close(resolve));
    });

    it('should redirect root requests to landing page', async () => {
        const server = createServer();
        const res = await agent(server).get('/');
        assert.equal('https://localtunnel.github.io/www/', res.headers.location);
    });

    it('should support custom base domains', async () => {
        const server = createServer({
            domain: 'domain.example.com',
        });

        const res = await agent(server).get('/');
        assert.equal('https://localtunnel.github.io/www/', res.headers.location);
    });

    it('reject long domain name requests', async () => {
        const server = createServer();
        const res = await agent(server).get('/thisdomainisoutsidethesizeofwhatweallowwhichissixtythreecharacters');
        assert.equal(res.body.message, 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.');
    });

    it('should upgrade websocket requests', async () => {
        const hostname = 'websocket-test';
        const server = createServer({
            domain: 'example.com',
        });
        await new Promise<void>(resolve => server.listen(resolve));

        const res = await agent(server).get('/websocket-test');
        const localTunnelPort = res.body.port;

        const wss = await new Promise<WebSocketServer>((resolve) => {
            const wsServer = new WebSocketServer({ port: 0 }, () => {
                resolve(wsServer);
            });
        });

        const websocketServerPort = (wss.address() as AddressInfo).port;

        const ltSocket = net.createConnection({ port: localTunnelPort });
        const wsSocket = net.createConnection({ port: websocketServerPort });
        ltSocket.pipe(wsSocket).pipe(ltSocket);

        wss.once('connection', (ws) => {
            ws.once('message', (message) => {
                ws.send(message);
            });
        });

        const ws: WebSocket = new WebSocket(`ws://localhost:${(server.address() as AddressInfo).port}`, {
            headers: {
                host: `${hostname}.example.com`,
            }
        } as any);

        ws.on('open', () => {
            ws.send('something');
        });

        await new Promise<void>((resolve) => {
            ws.once('message', (msg) => {
                assert.equal(msg, 'something');
                resolve();
            });
        });

        wss.close();
        ws.close();

        await new Promise<void>((resolve: () => void) => server.close(resolve));
    });

    it('should support the /api/tunnels/:id/status endpoint', async () => {
        const server = createServer();
        await new Promise<void>(resolve => server.listen(resolve));

        // no such tunnel yet
        let res = await agent(server).get('/api/tunnels/foobar-test/status');
        assert.equal(res.statusCode, 404);

        // request a new client called foobar-test
        await agent(server).get('/foobar-test');

        res = await agent(server).get('/api/tunnels/foobar-test/status');
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, {
            connected_sockets: 0,
        });

        await new Promise<void>((resolve: () => void) => server.close(resolve));
    });
});
