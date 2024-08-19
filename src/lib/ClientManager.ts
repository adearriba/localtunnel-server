import { hri } from 'human-readable-ids';
import { Debugger, debug } from 'debug';
import { Client } from './Client';
import TunnelAgent from './TunnelAgent';

export interface ClientManagerOptions {
    max_tcp_sockets?: number;
}

export interface NewClientResult {
    id: string;
    port: number;
    max_conn_count: number | undefined;
    url?: string;
}

// Manage sets of clients
// A client is a "user session" established to service a remote localtunnel client
export class ClientManager {
    private clients: Map<string, Client>;
    public stats: { tunnels: number };
    private debug: Debugger;
    private opt: ClientManagerOptions;

    constructor(opt: ClientManagerOptions = {}) {
        this.opt = opt;

        // id -> client instance
        this.clients = new Map<string, Client>();

        // statistics
        this.stats = {
            tunnels: 0
        };

        this.debug = debug('lt:ClientManager');
    }

    // create a new tunnel with `id`
    // if the id is already used, a random id is assigned
    // if the tunnel could not be created, throws an error
    async newClient(id: string): Promise<NewClientResult> {
        // can't ask for id already in use
        if (this.clients.has(id)) {
            id = hri.random();
        }

        const maxSockets = this.opt.max_tcp_sockets ?? 10;
        const agent = new TunnelAgent({
            clientId: id,
            maxTcpSockets: maxSockets
        });

        const client = new Client({
            id,
            agent,
            timeout: 1000
        });

        // add to clients map immediately
        // avoiding races with other clients requesting same id
        this.clients.set(id, client);

        client.once('close', () => {
            this.removeClient(id);
        });

        // try/catch used here to remove client id
        try {
            const info = await agent.listen();
            ++this.stats.tunnels;
            return {
                id: id,
                port: info.port,
                max_conn_count: maxSockets,
            };
        }
        catch (err) {
            this.removeClient(id);
            // rethrow error for upstream to handle
            throw err;
        }
    }

    removeClient(id: string): void {
        this.debug('removing client: %s', id);
        const client = this.clients.get(id);
        if (!client) {
            return;
        }
        --this.stats.tunnels;
        this.clients.delete(id);
        client.close();
    }

    hasClient(id: string): boolean {
        return this.clients.has(id);
    }

    getClient(id: string): Client | undefined {
        return this.clients.get(id);
    }
}