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

    constructor(options: ClientOptions) {
        super();

        const agent = (this.agent = options.agent);
        const id = (this.id = options.id);
        const connTimeout = options.timeout ?? 1000;

        this.debug = Debug(`lt:Client[${this.id}]`);

        // client is given a grace period in which they can connect before they are _removed_
        this.graceTimeout = setTimeout(() => {
            this.close();
        }, connTimeout).unref();

        agent.on('online', () => {
            this.debug('client online %s', id);
            clearTimeout(this.graceTimeout);
        });

        agent.on('offline', () => {
            this.debug('client offline %s', id);

            // if there was a previous timeout set, we don't want to double trigger
            clearTimeout(this.graceTimeout);

            // client is given a grace period in which they can re-connect before they are _removed_
            this.graceTimeout = setTimeout(() => {
                this.close();
            }, connTimeout).unref();
        });

        // TODO: Handle agent error
        agent.once('error', (err) => {
            this.close();
        });
    }

    stats() {
        return this.agent.stats();
    }

    close() {
        clearTimeout(this.graceTimeout);
        this.agent.destroy();
        this.emit('close');
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
