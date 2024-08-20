import http, { IncomingMessage, ServerResponse } from 'http';
import Debug from 'debug';
import pump from 'pump';
import EventEmitter from 'events';
import { Socket } from 'net';
import { TunnelAgent } from './TunnelAgent';  // assuming TunnelAgent is imported from a file in your project

interface ClientOptions {
    agent: TunnelAgent;
    id: string;
    timeout?: number
}

// A client encapsulates req/res handling using an agent
//
// If an agent is destroyed, the request handling will error
// The caller is responsible for handling a failed request
export class Client extends EventEmitter {
    private agent: TunnelAgent;
    private id: string;
    private debug: Debug.Debugger;
    private graceTimeout: NodeJS.Timeout;
    private connTimeout: number;

    constructor(options: ClientOptions) {
        super();

        const agent = (this.agent = options.agent);
        const id = (this.id = options.id);
        this.connTimeout = options.timeout ?? 1000;

        this.debug = Debug(`lt:Client[${this.id}]`);

        // client is given a grace period in which they can connect before they are _removed_
        this.graceTimeout = setTimeout(() => {
            this.close();
        }, this.connTimeout).unref();

        agent.on('online', this.handleOnline.bind(this));
        agent.on('offline', this.handleOffline.bind(this));
        agent.once('error', this.handleError.bind(this));
    }

    stats() {
        return this.agent.stats();
    }

    close() {
        clearTimeout(this.graceTimeout);
        this.agent.off('online', this.handleOnline);
        this.agent.off('offline', this.handleOffline);
        this.agent.off('error', this.handleError);
        this.agent.destroy();
        this.emit('close');
    }

    private handleOnline() {
        this.debug('client online %s', this.id);
        clearTimeout(this.graceTimeout);
    }

    private handleOffline() {
        this.debug('client offline %s', this.id);
        clearTimeout(this.graceTimeout);

        // client is given a grace period in which they can re-connect before they are _removed_
        this.graceTimeout = setTimeout(() => {
            this.close();
        }, this.connTimeout).unref();
    }

    private handleError(err: Error) {
        this.debug('agent error: %s', err.message);
        this.close();
    }

    handleRequest(req: IncomingMessage, res: ServerResponse) {
        this.debug('> %s', req.url);
        const opt: http.RequestOptions = {
            path: req.url,
            agent: this.agent,
            method: req.method,
            headers: req.headers,
        };

        const clientReq = http.request(opt, (clientRes) => {
            this.debug('< %s', req.url);
            // write response code and headers
            res.writeHead(clientRes.statusCode || 500, clientRes.headers);

            // using pump is deliberate - see the pump docs for why
            pump(clientRes, res);
        });

        // this can happen when underlying agent produces an error
        clientReq.once('error', (err) => {
            // TODO: Handle request error, maybe respond with a 504 if headers not sent
            this.debug('Request error: %s', err.message);
            if (!res.headersSent) {
                res.writeHead(504, { 'Content-Type': 'text/plain' });
                res.end('504 Gateway Timeout');
            }
        });

        // using pump is deliberate - see the pump docs for why
        pump(req, clientReq);
    }

    handleUpgrade(req: IncomingMessage, socket: Socket) {
        this.debug('> [up] %s', req.url);
        socket.once('error', (err) => {
            // These client side errors can happen if the client dies while we are reading
            // We don't need to surface these in our logs.
            if ((err as NodeJS.ErrnoException).code === 'ECONNRESET' || (err as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
                return;
            }
            console.error(err);
        });

        this.agent.createConnection({}, (err, conn) => {
            this.debug('< [up] %s', req.url);
            // any errors getting a connection mean we cannot service this request
            if (err) {
                socket.end();
                return;
            }

            // socket may have disconnected while we were waiting for a connection
            if (!socket.readable || !socket.writable) {
                conn?.destroy();
                socket.end();
                return;
            }

            // websocket requests are special in that we simply re-create the header info
            // then directly pipe the socket data
            // avoids having to rebuild the request and handle upgrades via the http client
            const arr = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
            for (let i = 0; i < req.rawHeaders.length - 1; i += 2) {
                arr.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
            }

            arr.push('');
            arr.push('');

            // using pump is deliberate - see the pump docs for why
            pump(conn!, socket);
            pump(socket, conn!);
            conn?.write(arr.join('\r\n'));
        });
    }
}
