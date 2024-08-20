"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientManager = void 0;
const human_readable_ids_1 = require("human-readable-ids");
const debug_1 = require("debug");
const Client_1 = require("./Client");
const TunnelAgent_1 = __importDefault(require("./TunnelAgent"));
// Manage sets of clients
// A client is a "user session" established to service a remote localtunnel client
class ClientManager {
    clients;
    stats;
    debug;
    opt;
    constructor(opt = {}) {
        this.opt = opt;
        // id -> client instance
        this.clients = new Map();
        // statistics
        this.stats = {
            tunnels: 0
        };
        this.debug = (0, debug_1.debug)('lt:ClientManager');
    }
    // create a new tunnel with `id`
    // if the id is already used, a random id is assigned
    // if the tunnel could not be created, throws an error
    async newClient(id) {
        // can't ask for id already in use
        if (this.clients.has(id)) {
            id = human_readable_ids_1.hri.random();
        }
        const maxSockets = this.opt.max_tcp_sockets ?? 10;
        const agent = new TunnelAgent_1.default({
            clientId: id,
            maxTcpSockets: maxSockets
        });
        const client = new Client_1.Client({
            id,
            agent,
            timeout: 1000
        });
        // add to clients map immediately
        // avoiding races with other clients requesting same id
        this.clients.set(id, client);
        client.once('close', () => {
            this.removeClient(id);
            client.removeAllListeners();
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
    removeClient(id) {
        this.debug('removing client: %s', id);
        const client = this.clients.get(id);
        if (!client) {
            this.debug('Client ID %s not found during removal', id);
            return;
        }
        --this.stats.tunnels;
        this.clients.delete(id);
        client.close();
    }
    hasClient(id) {
        return this.clients.has(id);
    }
    getClient(id) {
        return this.clients.get(id);
    }
    getClients() {
        return Array.from(this.clients.keys());
    }
}
exports.ClientManager = ClientManager;
